import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { LEGAL_VERSION, LIMITS } from '@/common/limits';
import { TransactionManager } from '@/infra/database/transaction.manager';
import { RateLimiter } from '@/infra/redis/rate-limiter.service';
import { PhotosService } from '@/modules/photos';
import type { ProfileRow } from '@/infra/database/schema';
import { ageOn, todayInIndia } from './age';
import type { MyProfileDto, SetLocationResultDto, UpdateProfileInput } from './dto/profile.dto';
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
    const verdict = evaluateFix(fix, previous, new Date());

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
