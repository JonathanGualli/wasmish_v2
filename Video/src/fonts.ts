import { loadFont } from '@remotion/fonts'
import inter from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'
import jetbrainsMono from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'

// Las mismas fuentes de la página, con los nombres de --font-sans y --font-mono.
// `loadFont` detiene el render hasta que cargan: ningún cuadro sale con la de reserva.
export function loadFonts(): void {
  loadFont({ family: 'Inter Variable', url: inter, weight: '100 900' })
  loadFont({ family: 'JetBrains Mono Variable', url: jetbrainsMono, weight: '100 800' })
}
