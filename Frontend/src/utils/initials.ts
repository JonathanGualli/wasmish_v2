/** Iniciales para avatares (máx. 2 letras). Vale para contactos y para el usuario. */
export const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '#';
