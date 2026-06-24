import { SetMetadata } from '@nestjs/common';

export const SKIP_TOTP_CHECK_KEY = 'skipTotpCheck';
export const SkipTotpCheck = () => SetMetadata(SKIP_TOTP_CHECK_KEY, true);
