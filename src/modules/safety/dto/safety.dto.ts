import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const blockSchema = z.object({ userId: z.uuid() });
export class BlockDto extends createZodDto(blockSchema) {}

export const userIdParamSchema = z.object({ userId: z.uuid() });
export class BlockedUserParamDto extends createZodDto(userIdParamSchema) {}

export const blockedListSchema = z.object({
  items: z.array(
    z.object({
      userId: z.uuid(),
      displayName: z.string().max(30),
      blockedAt: z.iso.datetime(),
    }),
  ),
});
export class BlockedListDto extends createZodDto(blockedListSchema) {}

export const REPORT_REASONS = [
  'fake_or_spam',
  'inappropriate',
  'harassment_or_hate',
  'underage',
  'scam',
  'other',
] as const;

export const reportSchema = z
  .object({
    reportedId: z.uuid(),
    /** What is reported: the person, or one of their photos, prompt answers or messages. */
    targetType: z.enum(['user', 'photo', 'prompt', 'message']),
    /** The photo, prompt answer or message id (not for `user`). */
    targetId: z.uuid().optional(),
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(1000).optional(),
    /** Also block them (the report screen offers it). */
    alsoBlock: z.boolean().default(false),
  })
  .refine((r) => (r.targetType === 'user') === (r.targetId === undefined), {
    message: 'targetId is required for photo, prompt and message reports (and only for those)',
    path: ['targetId'],
  });
export class ReportDto extends createZodDto(reportSchema) {}

export const reportResultSchema = z.object({ id: z.uuid() });
export class ReportResultDto extends createZodDto(reportResultSchema) {}
