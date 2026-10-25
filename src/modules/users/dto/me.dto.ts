import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const meSchema = z.object({
  id: z.uuid(),
  status: z.enum(['pending', 'active', 'paused', 'suspended', 'deleted']),
  /** The verified email, when the account signed in with one. */
  // A constraint keeps nullable strings correct in OpenAPI (see openapi-contract test).
  email: z.string().max(254).nullable(),
  /** False until the onboarding questionnaire is complete. */
  onboardingCompleted: z.boolean(),
  createdAt: z.iso.datetime(),
});

export class MeDto extends createZodDto(meSchema) {}
