import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opt a route out of the global JWT guard (sign-in, health probes, public config). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
