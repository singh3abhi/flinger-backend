import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Emails are compared case-insensitively and without surrounding spaces everywhere. */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** The device making the request. Tags the session so people can be signed out per device. */
export const deviceSchema = z.object({
  id: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[\w-]+$/, 'letters, digits, dashes and underscores only'),
  platform: z.enum(['ios', 'android', 'web']),
});

// ---- Request a sign-in code
export const requestOtpSchema = z.object({ email: emailSchema });
export class RequestOtpDto extends createZodDto(requestOtpSchema) {}

export const requestOtpResultSchema = z.object({
  /** Seconds until another code can be requested. */
  resendAvailableInSeconds: z.number().int(),
  /** Seconds the code stays valid. */
  expiresInSeconds: z.number().int(),
});
export class RequestOtpResultDto extends createZodDto(requestOtpResultSchema) {}

// ---- Verify the code
export const verifyOtpSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, 'must be 6 digits'),
  device: deviceSchema,
});
export class VerifyOtpDto extends createZodDto(verifyOtpSchema) {}

export const tokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  /** Seconds until the access token expires. */
  expiresIn: z.number().int(),
});

export const authResultSchema = tokensSchema.extend({
  user: z.object({
    id: z.uuid(),
    status: z.enum(['pending', 'active', 'paused', 'suspended', 'deleted']),
    /** True the first time this email signs in. */
    isNewUser: z.boolean(),
  }),
});
export class AuthResultDto extends createZodDto(authResultSchema) {}

// ---- Refresh
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });
export class RefreshDto extends createZodDto(refreshSchema) {}
export class TokensDto extends createZodDto(tokensSchema) {}
