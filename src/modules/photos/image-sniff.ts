/** Image types accepted for profile photos. The app converts to JPEG before uploading. */
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];

/** Bytes needed to recognise every accepted format. */
export const SNIFF_BYTES = 16;

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);

/**
 * What the file really is, from its first bytes (never trust the declared Content-Type).
 * Returns null for anything that is not an accepted image.
 */
export function sniffImageType(head: Buffer): PhotoContentType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    head.length >= 12 &&
    head.toString('ascii', 0, 4) === 'RIFF' &&
    head.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (head.length >= 12 && head.toString('ascii', 4, 8) === 'ftyp') {
    return HEIC_BRANDS.has(head.toString('ascii', 8, 12)) ? 'image/heic' : null;
  }
  return null;
}
