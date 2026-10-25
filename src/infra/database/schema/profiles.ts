import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '@/common/utils/uuid';
import { users } from './users';

export const gender = pgEnum('gender', ['woman', 'man', 'non_binary']);
export const profileVisibility = pgEnum('profile_visibility', ['visible', 'hidden']);
export const verificationStatus = pgEnum('verification_status', ['none', 'pending', 'verified']);
export const profileAttributeKind = pgEnum('profile_attribute_kind', [
  'interested_in',
  'hoping_to_find',
  'values',
  'causes',
]);
export const consentDocument = pgEnum('consent_document', ['terms', 'privacy', 'guidelines']);

/**
 * One row per member, created on the first onboarding answer. Single-choice answers are text ids
 * validated in code (src/modules/profiles/profile-options.ts) so new options need no migration.
 * Location columns arrive with the location step.
 */
export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name'),
    /** Set once (the app asks for confirmation); only the age is ever shown. */
    birthDate: date('birth_date', { mode: 'string' }),
    gender: gender('gender'),
    datingMode: text('dating_mode').notNull().default('dating'),
    heightCm: smallint('height_cm'),
    kidsStatus: text('kids_status'),
    familyPlans: text('family_plans'),
    religion: text('religion'),
    politics: text('politics'),
    bio: text('bio'),
    /** `hidden` is set by moderation only; pausing is `users.status = paused`. */
    visibility: profileVisibility('visibility').notNull().default('visible'),
    verificationStatus: verificationStatus('verification_status').notNull().default('none'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('profiles_display_name_len', sql`char_length(${t.displayName}) BETWEEN 2 AND 30`),
    check('profiles_birth_date_range', sql`${t.birthDate} >= '1900-01-01'`),
    check('profiles_height_range', sql`${t.heightCm} BETWEEN 120 AND 230`),
    check('profiles_bio_len', sql`char_length(${t.bio}) <= 500`),
  ],
);

/** Multi-choice answers: who to meet, intentions, values, causes. Counts are capped in the service. */
export const profileAttributes = pgTable(
  'profile_attributes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    kind: profileAttributeKind('kind').notNull(),
    value: text('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.value] })],
);

/** The prompt library. Ids are stable slugs; rows are seeded by migration and retired via `active`. */
export const prompts = pgTable('prompts', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  category: text('category').notNull(),
  sortOrder: integer('sort_order').notNull(),
  active: boolean('active').notNull().default(true),
});

export const profilePrompts = pgTable(
  'profile_prompts',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id),
    answer: text('answer').notNull(),
    position: smallint('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('profile_prompts_user_position').on(t.userId, t.position),
    unique('profile_prompts_user_prompt').on(t.userId, t.promptId),
    check('profile_prompts_position_range', sql`${t.position} BETWEEN 1 AND 3`),
    check('profile_prompts_answer_len', sql`char_length(${t.answer}) BETWEEN 1 AND 150`),
  ],
);

/** Acceptance of a legal document version. Append-only: re-accepting a new version adds a row. */
export const userConsents = pgTable(
  'user_consents',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    document: consentDocument('document').notNull(),
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // The unique key also serves lookups by (user_id, document).
  (t) => [unique('user_consents_user_document_version').on(t.userId, t.document, t.version)],
);

export type ProfileRow = typeof profiles.$inferSelect;
export type ProfileAttributeRow = typeof profileAttributes.$inferSelect;
export type PromptRow = typeof prompts.$inferSelect;
export type ProfilePromptRow = typeof profilePrompts.$inferSelect;
