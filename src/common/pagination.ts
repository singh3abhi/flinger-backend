import { z } from 'zod';
import { DomainError } from './errors/domain-error';
import { ErrorCode } from './errors/error-codes';

/** Keyset pagination over (created_at, id) descending: stable while new rows arrive. */
export interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString('base64url');
}

export function decodeCursor(value: string | undefined): Cursor | undefined {
  if (!value) return undefined;
  const [at, id] = Buffer.from(value, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(at);
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid cursor.', {
      status: 400,
      errors: [{ path: 'cursor', message: 'invalid' }],
    });
  }
  return { createdAt, id };
}

export const pageQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
