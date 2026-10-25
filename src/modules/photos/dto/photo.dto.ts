import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { LIMITS } from '@/common/limits';
import { PHOTO_CONTENT_TYPES } from '../image-sniff';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const photoSchema = z.object({
  id: z.uuid(),
  /** 1 is the main photo. */
  position: z.number().int().min(1).max(LIMITS.photosMax),
  status: z.enum(['uploading', 'pending', 'approved', 'rejected']),
  /** Short-lived download URL (null until the upload is confirmed). Refetch when it expires. */
  url: z.url().max(4096).nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** Why moderation rejected it, when status is `rejected`. */
  rejectionReason: z.string().max(200).nullable(),
});
export class PhotoDto extends createZodDto(photoSchema) {}

export const photoListSchema = z.object({ items: z.array(photoSchema) });
export class PhotoListDto extends createZodDto(photoListSchema) {}

// ---- Reserve a slot and get an upload URL
export const createPhotoSchema = z.object({
  contentType: z.enum(PHOTO_CONTENT_TYPES),
  /** Size of the file about to be uploaded, in bytes (max 10 MB). */
  byteSize: z.number().int().min(1).max(MAX_PHOTO_BYTES),
});
export class CreatePhotoDto extends createZodDto(createPhotoSchema) {}

export const photoUploadSchema = z.object({
  photo: photoSchema,
  upload: z.object({
    /** PUT the file bytes here, with exactly these headers. */
    url: z.url().max(4096),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
  }),
});
export class PhotoUploadDto extends createZodDto(photoUploadSchema) {}

// ---- Confirm the upload
export const completePhotoSchema = z.object({
  width: z.number().int().min(200).max(10000),
  height: z.number().int().min(200).max(10000),
});
export class CompletePhotoDto extends createZodDto(completePhotoSchema) {}

// ---- Reorder
export const reorderPhotosSchema = z.object({
  /** Every photo id, in the new order (first = main). */
  photoIds: z
    .array(z.uuid())
    .min(1)
    .max(LIMITS.photosMax)
    .refine((ids) => new Set(ids).size === ids.length, 'each photo once'),
});
export class ReorderPhotosDto extends createZodDto(reorderPhotosSchema) {}

export const photoIdParamSchema = z.object({ photoId: z.uuid() });
export class PhotoIdParamDto extends createZodDto(photoIdParamSchema) {}
