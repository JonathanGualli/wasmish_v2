import { randomBytes } from 'crypto';

export const generateApiKeyUtil = (prefix = 'wm') => {
  const key = randomBytes(32)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '');

  return `${prefix}_${key}`;
};