import { SetMetadata } from '@nestjs/common';

export const SKIP_PASSWORD_CHANGE_CHECK_KEY = 'skipPasswordChangeCheck';
export const SkipPasswordChangeCheck = () => SetMetadata(SKIP_PASSWORD_CHANGE_CHECK_KEY, true);
