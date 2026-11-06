import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const deleteAccountSchema = z.object({
  /** Must be exactly "DELETE" (the app asks the member to type it). */
  confirm: z.string().max(20),
});
export class DeleteAccountDto extends createZodDto(deleteAccountSchema) {}

export const exportSchema = z.object({
  id: z.uuid(),
  status: z.enum(['pending', 'ready', 'failed']),
  url: z.url().max(4096).nullable(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export class ExportDto extends createZodDto(exportSchema) {}

export const exportIdParamSchema = z.object({ exportId: z.uuid() });
export class ExportIdParamDto extends createZodDto(exportIdParamSchema) {}
