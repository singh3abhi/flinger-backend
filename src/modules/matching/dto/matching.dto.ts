import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { pageQuerySchema } from '@/common/pagination';

export const memberSummarySchema = z.object({
  userId: z.uuid(),
  displayName: z.string().max(30),
  age: z.number().int(),
  city: z.string().max(120).nullable(),
  /** Main photo (short-lived URL). */
  photoUrl: z.url().max(4096),
});

// ---- Like and pass
export const likeSchema = z.object({
  targetId: z.uuid(),
  /** What the like is on: one of their photos or prompt answers (Hinge-style). */
  itemType: z.enum(['photo', 'prompt']),
  itemId: z.uuid(),
  comment: z.string().trim().min(1).max(150).optional(),
});
export class LikeDto extends createZodDto(likeSchema) {}

export const likeResultSchema = z.object({
  matched: z.boolean(),
  matchId: z.uuid().nullable(),
  likesRemaining: z.number().int(),
  /** When the daily likes refill. */
  resetsAt: z.iso.datetime(),
});
export class LikeResultDto extends createZodDto(likeResultSchema) {}

export const passSchema = z.object({ targetId: z.uuid() });
export class PassDto extends createZodDto(passSchema) {}

export const limitsSchema = z.object({
  likesPerDay: z.number().int(),
  likesUsed: z.number().int(),
  likesRemaining: z.number().int(),
  resetsAt: z.iso.datetime(),
});
export class LimitsDto extends createZodDto(limitsSchema) {}

// ---- Liked You
export const likedItemSchema = z.object({
  type: z.enum(['photo', 'prompt']),
  id: z.uuid(),
  /** The liked photo (short-lived URL), when type is photo and it still exists. */
  photoUrl: z.url().max(4096).nullable(),
  /** The liked prompt question and answer, when type is prompt and it still exists. */
  promptText: z.string().max(200).nullable(),
  promptAnswer: z.string().max(150).nullable(),
});

export const receivedLikeSchema = z.object({
  likeId: z.uuid(),
  from: memberSummarySchema,
  item: likedItemSchema,
  comment: z.string().max(150).nullable(),
  createdAt: z.iso.datetime(),
});
export const receivedLikesSchema = z.object({
  items: z.array(receivedLikeSchema),
  nextCursor: z.string().max(200).nullable(),
});
export class ReceivedLikesDto extends createZodDto(receivedLikesSchema) {}

// ---- Matches
export const matchSchema = z.object({
  matchId: z.uuid(),
  member: memberSummarySchema,
  createdAt: z.iso.datetime(),
});
export const matchListSchema = z.object({
  items: z.array(matchSchema),
  nextCursor: z.string().max(200).nullable(),
});
export class MatchListDto extends createZodDto(matchListSchema) {}

export class PageQueryDto extends createZodDto(pageQuerySchema) {}

export const matchIdParamSchema = z.object({ matchId: z.uuid() });
export class MatchIdParamDto extends createZodDto(matchIdParamSchema) {}
