import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type Database, type Executor } from '@/infra/database/database.module';
import {
  profileAttributes,
  profilePrompts,
  profiles,
  prompts,
  userConsents,
  type ProfileRow,
  type PromptRow,
} from '@/infra/database/schema';
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

export interface ProfilePromptView {
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
}
