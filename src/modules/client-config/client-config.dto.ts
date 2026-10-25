import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const clientConfigSchema = z.object({
  /** Apps older than this get a blocking "update required" screen. */
  minSupportedAppVersion: z.string(),
  /** Remote feature flags, by name. */
  flags: z.record(z.string(), z.boolean()),
  /** Product limits, so clients validate with the same numbers the server enforces. */
  limits: z.object({
    photosMin: z.number().int(),
    photosMax: z.number().int(),
    promptsRequired: z.number().int(),
    promptMaxLength: z.number().int(),
    bioMaxLength: z.number().int(),
    messageMaxLength: z.number().int(),
    dailyLikes: z.number().int(),
    minAge: z.number().int(),
  }),
});

export class ClientConfigDto extends createZodDto(clientConfigSchema) {}
