import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { LEGAL_VERSION, LIMITS } from '@/common/limits';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { TransactionManager } from '@/infra/database/transaction.manager';
import { RateLimiter } from '@/infra/redis/rate-limiter.service';
import { PhotosService } from '@/modules/photos';
import { UsersService } from '@/modules/users';
import type { ProfileRow } from '@/infra/database/schema';
import { ageOn, todayInIndia } from './age';
import type {
  MyProfileDto,
  PreferencesDto,
  PublicProfileDto,
  SetLocationResultDto,
  UpdateProfileInput,
} from './dto/profile.dto';
import { defaultPreferences, type PreferencesValues } from './preferences';
import { evaluateFix, roundCoordinate, type Fix } from './location-rules';
import { onboardingProgress, type OnboardingProgress } from './onboarding';
import { ATTRIBUTE_KINDS, CONSENT_DOCUMENTS, MAX_AGE, type AttributeKind } from './profile-options';
import { ProfilesRepository, type LocationView, type ProfileChanges } from './profiles.repository';

/** PATCH field name for each multi-select attribute kind. */
const ATTRIBUTE_FIELDS = {
  interested_in: 'interestedIn',
  hoping_to_find: 'hopingToFind',
  values: 'values',
  causes: 'causes',
} as const satisfies Record<AttributeKind, keyof UpdateProfileInput>;

const SCALAR_FIELDS = [
  'displayName',
  'gender',
  'heightCm',
  'kidsStatus',
  'familyPlans',
  'religion',
  'politics',
  'bio',
] as const satisfies readonly (keyof UpdateProfileInput & keyof ProfileChanges)[];

/** A public profile plus whether its owner shows their distance (stripped before sending). */
export type PublicCard = PublicProfileDto & { showDistance: boolean };

export interface RankingSignals {
  hopingToFind: string[];
  values: string[];
  causes: string[];
  kidsStatus: string | null;
  familyPlans: string | null;
  hasBio: boolean;
}

export interface MemberSummary {
  userId: string;
  displayName: string;
  age: number;
  city: string | null;
  /** Main photo (short-lived URL). */
  photoUrl: string;
}

const LOCATION_MESSAGES = {
  LOCATION_MOCKED: 'Your location looks simulated. Turn off any fake-GPS app and try again.',
  LOCATION_OUTSIDE_SERVICE_AREA: 'Flinger is only available in India for now.',
  LOCATION_TOO_INACCURATE:
    'We couldn’t get an accurate location. Try again with a clearer view of the sky.',
  LOCATION_STALE: 'That location is out of date. Please try again.',
} as const;

/** A place further than this from the fix is not used as its label. */
const PLACE_LABEL_MAX_KM = 75;
const LOCATION_UPDATES_PER_HOUR = 60;

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    private readonly repo: ProfilesRepository,
    private readonly tx: TransactionManager,
    private readonly photos: PhotosService,
    private readonly rateLimiter: RateLimiter,
    private readonly users: UsersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** The member's own profile with onboarding progress, for the app to resume or edit. */
  async getOwn(userId: string): Promise<MyProfileDto> {
    const [profile, attributes, prompts, accepted, photos, location] = await Promise.all([
      this.repo.findProfile(userId),
      this.repo.listAttributes(userId),
      this.repo.listProfilePrompts(userId),
      this.repo.acceptedDocuments(userId, LEGAL_VERSION),
      this.photos.listOwn(userId),
      this.repo.findLocation(userId),
    ]);

    const byKind = Object.fromEntries(ATTRIBUTE_KINDS.map((k) => [k, [] as string[]])) as Record<
      AttributeKind,
      string[]
    >;
    for (const a of attributes) byKind[a.kind].push(a.value);
    for (const list of Object.values(byKind)) list.sort();

    const usablePhotos = photos.filter((p) => p.status === 'pending' || p.status === 'approved');
    const onboarding = this.progress(
      profile,
      byKind,
      prompts.length,
      usablePhotos.length,
      location !== null,
      accepted,
    );
    return {
      displayName: profile?.displayName ?? null,
      birthDate: profile?.birthDate ?? null,
      age: profile?.birthDate ? ageOn(profile.birthDate, todayInIndia()) : null,
      gender: profile?.gender ?? null,
      heightCm: profile?.heightCm ?? null,
      kidsStatus: (profile?.kidsStatus ?? null) as MyProfileDto['kidsStatus'],
      familyPlans: (profile?.familyPlans ?? null) as MyProfileDto['familyPlans'],
      religion: (profile?.religion ?? null) as MyProfileDto['religion'],
      politics: (profile?.politics ?? null) as MyProfileDto['politics'],
      bio: profile?.bio ?? null,
      interestedIn: byKind.interested_in as MyProfileDto['interestedIn'],
      hopingToFind: byKind.hoping_to_find as MyProfileDto['hopingToFind'],
      values: byKind.values as MyProfileDto['values'],
      causes: byKind.causes as MyProfileDto['causes'],
      prompts,
      photos,
      location: this.locationLabel(location),
      onboarding,
    };
  }

  /** Save any subset of answers in one transaction. */
  async update(userId: string, input: UpdateProfileInput): Promise<MyProfileDto> {
    await this.tx.run(async (t) => {
      const current = await this.repo.lockOrCreateProfile(userId, t);

      const changes: ProfileChanges = {};
      for (const field of SCALAR_FIELDS) {
        if (input[field] !== undefined) Object.assign(changes, { [field]: input[field] });
      }
      if (input.bio !== undefined) changes.bio = input.bio === '' ? null : input.bio;
      if (input.birthDate !== undefined) {
        this.assertBirthDateAllowed(current, input.birthDate);
        changes.birthDate = input.birthDate;
      }
      if (Object.keys(changes).length > 0) await this.repo.updateProfile(userId, changes, t);

      for (const kind of ATTRIBUTE_KINDS) {
        const values = input[ATTRIBUTE_FIELDS[kind]];
        if (values !== undefined) await this.repo.replaceAttributes(userId, kind, values, t);
      }
    });
    return this.getOwn(userId);
  }

  async listPrompts(): Promise<{ id: string; text: string; category: string }[]> {
    const rows = await this.repo.listActivePrompts();
    return rows.map(({ id, text, category }) => ({ id, text, category }));
  }

  /** Replace the prompt answers (in display order). */
  async setPrompts(
    userId: string,
    items: readonly { promptId: string; answer: string }[],
  ): Promise<MyProfileDto> {
    const known = new Set(await this.repo.findActivePromptIds(items.map((i) => i.promptId)));
    const unknown = items.findIndex((i) => !known.has(i.promptId));
    if (unknown !== -1) {
      throw new DomainError(ErrorCode.PROMPT_NOT_FOUND, 'That prompt is no longer available.', {
        status: 422,
        errors: [{ path: `prompts.${unknown}.promptId`, message: 'unknown prompt' }],
      });
    }
    await this.tx.run(async (t) => {
      await this.repo.lockOrCreateProfile(userId, t);
      await this.repo.replaceProfilePrompts(userId, items, t);
    });
    return this.getOwn(userId);
  }

  async acceptConsents(
    userId: string,
    documents: readonly (typeof CONSENT_DOCUMENTS)[number][],
    version: string,
  ): Promise<void> {
    if (version !== LEGAL_VERSION) {
      throw new DomainError(
        ErrorCode.CONSENT_VERSION_MISMATCH,
        'These terms have been updated. Please review the latest version.',
        { status: 409 },
      );
    }
    await this.repo.acceptConsents(userId, documents, version);
  }

  /**
   * Save a GPS fix. Fake, out-of-area, inaccurate or stale fixes are refused with a reason the app
   * can show; a fix implying impossible travel is silently ignored and the account flagged.
   */
  async setLocation(
    userId: string,
    input: Omit<Fix, 'capturedAt'> & { capturedAt: string },
  ): Promise<SetLocationResultDto> {
    const limit = await this.rateLimiter.hit('location', userId, LOCATION_UPDATES_PER_HOUR, 3600);
    if (!limit.allowed) {
      throw new DomainError(
        ErrorCode.RATE_LIMITED,
        'Too many location updates. Please try again later.',
        {
          status: 429,
          headers: { 'Retry-After': String(limit.retryAfterSeconds) },
        },
      );
    }

    const fix: Fix = { ...input, capturedAt: new Date(input.capturedAt) };
    const previous = await this.repo.findLocation(userId);
    const verdict = evaluateFix(fix, previous, new Date(), {
      allowMocked: this.config.LOCATION_ALLOW_MOCKED,
    });

    if (verdict.kind === 'reject') {
      throw new DomainError(verdict.code, LOCATION_MESSAGES[verdict.code], { status: 422 });
    }
    if (verdict.kind === 'ignore') {
      await this.repo.flagLocation(userId);
      // No coordinates in logs: only that it happened.
      this.logger.warn('Location ignored: impossible travel');
      return { accepted: false, location: this.locationLabel(previous) };
    }

    const latitude = roundCoordinate(fix.latitude);
    const longitude = roundCoordinate(fix.longitude);
    const place = await this.repo.nearestPlace(latitude, longitude, PLACE_LABEL_MAX_KM);
    await this.tx.run(async (t) => {
      await this.repo.lockOrCreateProfile(userId, t);
      await this.repo.saveLocation(
        userId,
        {
          latitude,
          longitude,
          accuracyMeters: Math.round(fix.accuracyMeters),
          placeId: place?.id ?? null,
        },
        t,
      );
    });
    return { accepted: true, location: this.locationLabel(await this.repo.findLocation(userId)) };
  }

  /**
   * Finish onboarding: every required step must be done. Activates the account and sets default
   * preferences. Calling it again changes nothing.
   */
  async complete(userId: string): Promise<MyProfileDto> {
    const current = await this.getOwn(userId);
    if (!current.onboarding.completed) {
      throw new DomainError(ErrorCode.ONBOARDING_INCOMPLETE, 'A few steps are still missing.', {
        status: 409,
        errors: current.onboarding.missing.map((step) => ({ path: step, message: 'missing' })),
      });
    }
    await this.tx.run(async (t) => {
      await this.repo.markOnboardingComplete(userId, t);
      await this.repo.insertPreferencesIfMissing(userId, defaultPreferences(current.age ?? 18), t);
      await this.users.activate(userId, t);
    });
    return this.getOwn(userId);
  }

  /**
   * Short cards (name, age, city, main photo) for members others may see: onboarding finished and
   * not hidden by moderation. Members missing from the map must not be shown.
   */
  async summaries(userIds: readonly string[]): Promise<Map<string, MemberSummary>> {
    const [basics, photos] = await Promise.all([
      this.repo.findBasics(userIds),
      this.photos.approvedFor(userIds),
    ]);
    const today = todayInIndia();
    const result = new Map<string, MemberSummary>();
    for (const b of basics) {
      if (
        b.visibility !== 'visible' ||
        !b.onboardingCompletedAt ||
        !b.displayName ||
        !b.birthDate
      ) {
        continue;
      }
      const main = photos.get(b.userId)?.[0];
      if (!main?.url) continue;
      result.set(b.userId, {
        userId: b.userId,
        displayName: b.displayName,
        age: ageOn(b.birthDate, today),
        city: b.city,
        photoUrl: main.url,
      });
    }
    return result;
  }

  /**
   * Full public profiles (for Discover and profile views), without distance (the caller adds it).
   * Only members others may see are returned.
   */
  async publicProfiles(userIds: readonly string[]): Promise<Map<string, PublicCard>> {
    const [rows, attributes, promptRows, photos] = await Promise.all([
      this.repo.findPublic(userIds),
      this.repo.listAttributesFor(userIds),
      this.repo.listPromptsFor(userIds),
      this.photos.approvedFor(userIds),
    ]);
    const today = todayInIndia();
    const result = new Map<string, PublicCard>();
    for (const r of rows) {
      const memberPhotos = (photos.get(r.userId) ?? []).filter((p) => p.url);
      if (
        r.visibility !== 'visible' ||
        !r.onboardingCompletedAt ||
        !r.displayName ||
        !r.birthDate ||
        !r.gender ||
        memberPhotos.length === 0
      ) {
        continue;
      }
      const attrs = (kind: AttributeKind) =>
        attributes
          .filter((a) => a.userId === r.userId && a.kind === kind)
          .map((a) => a.value)
          .sort();
      result.set(r.userId, {
        userId: r.userId,
        displayName: r.displayName,
        age: ageOn(r.birthDate, today),
        city: r.city,
        distanceKm: null,
        showDistance: r.showDistance ?? true,
        gender: r.gender,
        heightCm: r.heightCm,
        hopingToFind: attrs('hoping_to_find') as PublicProfileDto['hopingToFind'],
        values: attrs('values') as PublicProfileDto['values'],
        causes: attrs('causes') as PublicProfileDto['causes'],
        kidsStatus: r.kidsStatus as PublicProfileDto['kidsStatus'],
        familyPlans: r.familyPlans as PublicProfileDto['familyPlans'],
        religion: r.religion as PublicProfileDto['religion'],
        politics: r.politics as PublicProfileDto['politics'],
        bio: r.bio,
        photos: memberPhotos.map((p) => ({
          id: p.id,
          url: p.url as string,
          width: p.width,
          height: p.height,
        })),
        prompts: promptRows
          .filter((p) => p.userId === r.userId)
          .map(({ id, promptId, text, answer, position }) => ({
            id,
            promptId,
            text,
            answer,
            position,
          })),
      });
    }
    return result;
  }

  /** First names only (for notification titles); no photos are loaded. */
  async displayNames(userIds: readonly string[]): Promise<Map<string, string>> {
    const rows = await this.repo.findBasics(userIds);
    return new Map(
      rows.flatMap((r) => (r.displayName ? [[r.userId, r.displayName] as const] : [])),
    );
  }

  /** What ranking needs about many members, without loading photos. */
  async rankingSignals(userIds: readonly string[]): Promise<Map<string, RankingSignals>> {
    const [rows, attributes] = await Promise.all([
      this.repo.findPublic(userIds),
      this.repo.listAttributesFor(userIds),
    ]);
    const result = new Map<string, RankingSignals>();
    for (const r of rows) {
      const attrs = (kind: AttributeKind) =>
        attributes.filter((a) => a.userId === r.userId && a.kind === kind).map((a) => a.value);
      result.set(r.userId, {
        hopingToFind: attrs('hoping_to_find'),
        values: attrs('values'),
        causes: attrs('causes'),
        kidsStatus: r.kidsStatus,
        familyPlans: r.familyPlans,
        hasBio: Boolean(r.bio),
      });
    }
    return result;
  }

  /** Prompt answers by id: question, answer and owner (to check and preview likes on prompts). */
  promptAnswers(answerIds: readonly string[]) {
    return this.repo.findPromptAnswers(answerIds);
  }

  /** Stored preferences, or the defaults the member would get. */
  async getPreferences(userId: string): Promise<PreferencesDto> {
    const stored = await this.repo.findPreferences(userId);
    if (stored) return this.toPreferences(stored);
    const profile = await this.repo.findProfile(userId);
    const age = profile?.birthDate ? ageOn(profile.birthDate, todayInIndia()) : 18;
    return defaultPreferences(age);
  }

  async updatePreferences(
    userId: string,
    changes: Partial<PreferencesValues>,
  ): Promise<PreferencesDto> {
    const next = { ...(await this.getPreferences(userId)), ...changes };
    if (next.minAge > next.maxAge) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'The minimum age can’t be above the maximum.',
        {
          status: 400,
          errors: [{ path: 'minAge', message: 'must not be above maxAge' }],
        },
      );
    }
    await this.tx.run((t) => this.repo.savePreferences(userId, next, t));
    return next;
  }

  private toPreferences(row: PreferencesValues): PreferencesDto {
    const { minAge, maxAge, maxDistanceKm, showDistance, expandRadiusWhenEmpty } = row;
    return { minAge, maxAge, maxDistanceKm, showDistance, expandRadiusWhenEmpty };
  }

  private locationLabel(location: LocationView | null): MyProfileDto['location'] {
    if (!location) return null;
    return {
      city: location.city,
      state: location.state,
      updatedAt: location.updatedAt.toISOString(),
    };
  }

  private assertBirthDateAllowed(current: ProfileRow, birthDate: string): void {
    if (current.birthDate !== null && current.birthDate !== birthDate) {
      throw new DomainError(
        ErrorCode.BIRTHDATE_LOCKED,
        'Your birthday can’t be changed. Contact support if it’s wrong.',
        { status: 409 },
      );
    }
    const age = ageOn(birthDate, todayInIndia());
    if (age < LIMITS.minAge) {
      throw new DomainError(
        ErrorCode.PROFILE_UNDERAGE,
        `You must be at least ${LIMITS.minAge} to use Flinger.`,
        { status: 422, errors: [{ path: 'birthDate', message: 'under 18' }] },
      );
    }
    if (age > MAX_AGE) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Please check your birthday.', {
        status: 400,
        errors: [{ path: 'birthDate', message: `older than ${MAX_AGE}` }],
      });
    }
  }

  private progress(
    profile: ProfileRow | undefined,
    byKind: Record<AttributeKind, string[]>,
    promptCount: number,
    photoCount: number,
    hasLocation: boolean,
    accepted: string[],
  ): OnboardingProgress {
    return onboardingProgress({
      displayName: profile?.displayName ?? null,
      birthDate: profile?.birthDate ?? null,
      gender: profile?.gender ?? null,
      heightCm: profile?.heightCm ?? null,
      attributeCounts: {
        interested_in: byKind.interested_in.length,
        hoping_to_find: byKind.hoping_to_find.length,
        values: byKind.values.length,
        causes: byKind.causes.length,
      },
      promptCount,
      photoCount,
      hasLocation,
      consentsAccepted: CONSENT_DOCUMENTS.every((d) => accepted.includes(d)),
    });
  }
}
