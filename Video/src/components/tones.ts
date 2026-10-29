// Los cuatro capítulos del video, por color de fondo (storyboard de Claude
// Design): tinta para el problema y el cierre, gris claro para la app, noche
// para el centro cerrado y menta solo para «otro ejemplo».

export type Tone = 'light' | 'dark' | 'night' | 'mint'

type ToneColors = {
  bg: string
  headline: string
  // La pastilla del titular: menta sobre tinta y noche, tinta sobre claro y menta.
  mintPill: boolean
  cardShadow: string
  kicker: { bg: string; fg: string; border: string }
  subtitleShadow: string
}

export const TONES: Record<Tone, ToneColors> = {
  light: { bg: '#f4f6f8', headline: '#0e1116', mintPill: false, cardShadow: '0 10px 0 #dfe3e8', kicker: { bg: '#ffffff', fg: '#0e1116', border: '#e4e7eb' }, subtitleShadow: '0 8px 0 #dfe3e8, 0 0 0 2px #e4e7eb' },
  dark: { bg: '#0b3b2e', headline: '#ffffff', mintPill: true, cardShadow: '0 10px 0 #062a20', kicker: { bg: '#12523f', fg: '#ffffff', border: '#2c6a56' }, subtitleShadow: '0 8px 0 #062a20' },
  night: { bg: '#06251c', headline: '#ffffff', mintPill: true, cardShadow: '0 10px 0 #021a13', kicker: { bg: '#0b3b2e', fg: '#ffffff', border: '#17503f' }, subtitleShadow: '0 8px 0 #021a13' },
  mint: { bg: '#6fe3ae', headline: '#06251c', mintPill: false, cardShadow: '0 10px 0 #3fbf86', kicker: { bg: '#0b3b2e', fg: '#ffffff', border: '#0b3b2e' }, subtitleShadow: '0 8px 0 #3fbf86' },
}

export const MINT = '#6fe3ae'
// Menta transparente: para que un resaltado entre con interpolateColors sin pasar por gris.
export const CLEAR_MINT = 'rgba(111, 227, 174, 0)'
