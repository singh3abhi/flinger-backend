import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type Database, type Executor } from '@/infra/database/database.module';
import {
  places,
  preferences,
  profileAttributes,
  profilePrompts,
  profiles,
  prompts,
  userConsents,
  type PreferencesRow,
  type ProfileRow,
  type PromptRow,
} from '@/infra/database/schema';
import type { PreferencesValues } from './preferences';
import type { AttributeKind } from './profile-options';

export type ProfileChanges = Partial<
  Pick<
    ProfileRow,
    | 'displayName'
    | 'birthDate'
    | 'gender'
    | 'heightCm'
    | 'kidsStatus'
    | 'familyPlans'
    | 'religion'
    | 'politics'
    | 'bio'
  >
>;

export interface LocationView {
  latitude: number;
  longitude: number;
  updatedAt: Date;
  city: string | null;
  state: string | null;
}

export interface ProfilePromptView {
  /** The answer's own id (what a like on a prompt points at). */
  id: string;
  promptId: string;
  text: string;
  answer: string;
  position: number;
}

/** The only place that touches the profile tables (profiles, attributes, prompts, consents). */
@Injectable()
export class ProfilesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findProfile(userId: string, executor: Executor = this.db): Promise<ProfileRow | undefined> {
    const [row] = await executor
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    return row;
  }

  /** Create the empty profile row if missing, then lock it for the rest of the transaction. */
  async lockOrCreateProfile(userId: string, tx: Executor): Promise<ProfileRow> {
    await tx.insert(profiles).values({ userId }).onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .for('update')
      .limit(1);
    return row;
  }

  async updateProfile(userId: string, changes: ProfileChanges, tx: Executor): Promise<void> {
    await tx
      .update(profiles)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(profiles.userId, userId));
  }

  async listAttributes(
    userId: string,
    executor: Executor = this.db,
  ): Promise<{ kind: AttributeKind; value: string }[]> {
    return executor
      .select({ kind: profileAttributes.kind, value: profileAttributes.value })
      .from(profileAttributes)
      .where(eq(profileAttributes.userId, userId));
  }

  async replaceAttributes(
    userId: string,
    kind: AttributeKind,
    values: readonly string[],
    tx: Executor,
  ): Promise<void> {
    await tx
      .delete(profileAttributes)
      .where(and(eq(profileAttributes.userId, userId), eq(profileAttributes.kind, kind)));
    if (values.length > 0) {
      await tx.insert(profileAttributes).values(values.map((value) => ({ userId, kind, value })));
    }
  }

  listActivePrompts(executor: Executor = this.db): Promise<PromptRow[]> {
    return executor
      .select()
      .from(prompts)
      .where(eq(prompts.active, true))
      .orderBy(asc(prompts.sortOrder));
  }

  /** The ids from `ids` that exist and are active. */
  async findActivePromptIds(
    ids: readonly string[],
    executor: Executor = this.db,
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await executor
      .select({ id: prompts.id })
      .from(prompts)
      .where(and(inArray(prompts.id, [...ids]), eq(prompts.active, true)));
    return rows.map((r) => r.id);
  }

  listProfilePrompts(userId: string, executor: Executor = this.db): Promise<ProfilePromptView[]> {
    return executor
      .select({
        id: profilePrompts.id,
        promptId: profilePrompts.promptId,
        text: prompts.text,
        answer: profilePrompts.answer,
        position: profilePrompts.position,
      })
      .from(profilePrompts)
      .innerJoin(prompts, eq(prompts.id, profilePrompts.promptId))
      .where(eq(profilePrompts.userId, userId))
      .orderBy(asc(profilePrompts.position));
  }

  async replaceProfilePrompts(
    userId: string,
    items: readonly { promptId: string; answer: string }[],
    tx: Executor,
  ): Promise<void> {
    await tx.delete(profilePrompts).where(eq(profilePrompts.userId, userId));
    if (items.length > 0) {
      await tx
        .insert(profilePrompts)
        .values(items.map((item, i) => ({ userId, ...item, position: i + 1 })));
    }
  }

  async acceptConsents(
    userId: string,
    documents: readonly ('terms' | 'privacy' | 'guidelines')[],
    version: string,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .insert(userConsents)
      .values(documents.map((document) => ({ userId, document, version })))
      .onConflictDoNothing();
  }

  /** Documents accepted at `version`. */
  async acceptedDocuments(
    userId: string,
    version: string,
    executor: Executor = this.db,
  ): Promise<string[]> {
    const rows = await executor
      .select({ document: userConsents.document })
      .from(userConsents)
      .where(and(eq(userConsents.userId, userId), eq(userConsents.version, version)));
    return rows.map((r) => r.document);
  }

  /** The stored location with its city label, or null if none has been accepted yet. */
  async findLocation(userId: string, executor: Executor = this.db): Promise<LocationView | null> {
    const [row] = await executor
      .select({
        latitude: sql<number>`ST_Y(${profiles.location}::geometry)`,
        longitude: sql<number>`ST_X(${profiles.location}::geometry)`,
        updatedAt: profiles.locationUpdatedAt,
        city: places.displayName,
        state: places.state,
      })
      .from(profiles)
      .leftJoin(places, eq(places.id, profiles.placeId))
      .where(and(eq(profiles.userId, userId), sql`${profiles.location} IS NOT NULL`))
      .limit(1);
    if (!row || !row.updatedAt) return null;
    return { ...row, updatedAt: row.updatedAt };
  }

  /** Nearest active place within `maxKm`, using the GiST index (KNN). */
  async nearestPlace(
    latitude: number,
    longitude: number,
    maxKm: number,
    executor: Executor = this.db,
  ): Promise<{ id: number } | undefined> {
    const point = sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
    const [row] = await executor
      .select({ id: places.id })
      .from(places)
      .where(
        and(
          eq(places.isActive, true),
          sql`ST_DWithin(${places.location}, ${point}, ${maxKm * 1000})`,
        ),
      )
      .orderBy(sql`${places.location} <-> ${point}`)
      .limit(1);
    return row;
  }

  async saveLocation(
    userId: string,
    fix: { latitude: number; longitude: number; accuracyMeters: number; placeId: number | null },
    tx: Executor,
  ): Promise<void> {
    await tx
      .update(profiles)
      .set({
        location: sql`ST_SetSRID(ST_MakePoint(${fix.longitude}, ${fix.latitude}), 4326)::geography`,
        locationAccuracyM: fix.accuracyMeters,
        locationUpdatedAt: new Date(),
        placeId: fix.placeId,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, userId));
  }

  async flagLocation(userId: string, executor: Executor = this.db): Promise<void> {
    await executor
      .update(profiles)
      .set({ locationFlaggedAt: new Date() })
      .where(eq(profiles.userId, userId));
  }

  async findPreferences(
    userId: string,
    executor: Executor = this.db,
  ): Promise<PreferencesRow | undefined> {
    const [row] = await executor
      .select()
      .from(preferences)
      .where(eq(preferences.userId, userId))
      .limit(1);
    return row;
  }

  /** Create preferences only if the member has none yet. */
  async insertPreferencesIfMissing(
    userId: string,
    values: PreferencesValues,
    tx: Executor,
  ): Promise<void> {
    await tx
      .insert(preferences)
      .values({ userId, ...values })
      .onConflictDoNothing();
  }

  async savePreferences(userId: string, values: PreferencesValues, tx: Executor): Promise<void> {
    await tx
      .insert(preferences)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: preferences.userId,
        set: { ...values, updatedAt: new Date() },
      });
  }

  async markOnboardingComplete(userId: string, tx: Executor): Promise<void> {
    await tx
      .update(profiles)
      .set({
        onboardingCompletedAt: sql`coalesce(${profiles.onboardingCompletedAt}, now())`,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, userId));
  }

  /** Name, birthday and city of several members (for cards in lists). */
  async findBasics(userIds: readonly string[], executor: Executor = this.db) {
    if (userIds.length === 0) return [];
    return executor
      .select({
        userId: profiles.userId,
        displayName: profiles.displayName,
        birthDate: profiles.birthDate,
        visibility: profiles.visibility,
        onboardingCompletedAt: profiles.onboardingCompletedAt,
        city: places.displayName,
      })
      .from(profiles)
      .leftJoin(places, eq(places.id, profiles.placeId))
      .where(inArray(profiles.userId, [...userIds]));
  }

  /** Prompt answers by their id, with the question text. */
  async findPromptAnswers(answerIds: readonly string[], executor: Executor = this.db) {
    if (answerIds.length === 0) return [];
    return executor
      .select({
        id: profilePrompts.id,
        userId: profilePrompts.userId,
        text: prompts.text,
        answer: profilePrompts.answer,
      })
      .from(profilePrompts)
      .innerJoin(prompts, eq(prompts.id, profilePrompts.promptId))
      .where(inArray(profilePrompts.id, [...answerIds]));
  }

  /** Everything public about several members (no location, no birthday). */
  async findPublic(userIds: readonly string[], executor: Executor = this.db) {
    if (userIds.length === 0) return [];
    return executor
      .select({
        userId: profiles.userId,
        displayName: profiles.displayName,
        birthDate: profiles.birthDate,
        gender: profiles.gender,
        heightCm: profiles.heightCm,
        kidsStatus: profiles.kidsStatus,
        familyPlans: profiles.familyPlans,
        religion: profiles.religion,
        politics: profiles.politics,
        bio: profiles.bio,
        visibility: profiles.visibility,
        onboardingCompletedAt: profiles.onboardingCompletedAt,
        city: places.displayName,
        showDistance: preferences.showDistance,
      })
      .from(profiles)
      .leftJoin(places, eq(places.id, profiles.placeId))
      .leftJoin(preferences, eq(preferences.userId, profiles.userId))
      .where(inArray(profiles.userId, [...userIds]));
  }

  async listAttributesFor(userIds: readonly string[], executor: Executor = this.db) {
    if (userIds.length === 0) return [];
    return executor
      .select({
        userId: profileAttributes.userId,
        kind: profileAttributes.kind,
        value: profileAttributes.value,
      })
      .from(profileAttributes)
      .where(inArray(profileAttributes.userId, [...userIds]));
  }

  async listPromptsFor(userIds: readonly string[], executor: Executor = this.db) {
    if (userIds.length === 0) return [];
    return executor
      .select({
        userId: profilePrompts.userId,
        id: profilePrompts.id,
        promptId: profilePrompts.promptId,
        text: prompts.text,
        answer: profilePrompts.answer,
        position: profilePrompts.position,
      })
      .from(profilePrompts)
      .innerJoin(prompts, eq(prompts.id, profilePrompts.promptId))
      .where(inArray(profilePrompts.userId, [...userIds]))
      .orderBy(asc(profilePrompts.position));
  }
}
