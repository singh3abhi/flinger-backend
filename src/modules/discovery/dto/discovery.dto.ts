import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { publicProfileSchema } from '@/modules/profiles';

export const deckQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export class DeckQueryDto extends createZodDto(deckQuerySchema) {}

export const deckSchema = z.object({
  items: z.array(publicProfileSchema),
  /** The search radius used for this deck. */
  radiusKm: z.number().int(),
  /** True when nobody was left nearby and the radius was widened beyond the member's maximum. */
  widened: z.boolean(),
});
export class DeckDto extends createZodDto(deckSchema) {}

export const userIdParamSchema = z.object({ userId: z.uuid() });
export class UserIdParamDto extends createZodDto(userIdParamSchema) {}
