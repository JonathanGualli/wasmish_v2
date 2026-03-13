import { randomBytes } from 'crypto';

export const generateApiKeyUtil = (prefix = 'wm') => {
  const buffer = randomBytes(32);
  
  // 2. Convertimos a base64url para que sea corta, segura para URLs 
  // y no tenga caracteres raros (+, /, =) que den problemas en headers.
  const key = buffer
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, ''); 

  const fullKey = `${prefix}_${key}`;

  return {
    fullKey
  };
};