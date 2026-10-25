import { sniffImageType } from './image-sniff';

const bytes = (...values: (number | string)[]) =>
  Buffer.concat(
    values.map((v) => (typeof v === 'string' ? Buffer.from(v, 'ascii') : Buffer.from([v]))),
  );

describe('sniffImageType', () => {
  it('recognises JPEG, PNG, WebP and HEIC by their first bytes', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('image/png');
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(bytes(0, 0, 0, 0x18, 'ftypheic', 0, 0, 0, 0))).toBe('image/heic');
  });

  it('rejects other files, including other ISO media (video) and truncated data', () => {
    expect(sniffImageType(bytes(0, 0, 0, 0x18, 'ftypmp42', 0, 0, 0, 0))).toBeNull();
    expect(sniffImageType(Buffer.from('<?xml version="1.0"?><svg'))).toBeNull();
    expect(sniffImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});
