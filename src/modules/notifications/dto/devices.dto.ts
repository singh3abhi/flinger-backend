import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const deviceIdParamSchema = z.object({
  deviceId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[\w-]+$/),
});
export class DeviceIdParamDto extends createZodDto(deviceIdParamSchema) {}

export const pushTokenSchema = z.object({
  provider: z.enum(['expo']),
  /** e.g. ExponentPushToken[xxxxxxxx] */
  token: z.string().min(10).max(255),
  platform: z.enum(['ios', 'android']),
});
export class PushTokenDto extends createZodDto(pushTokenSchema) {}
