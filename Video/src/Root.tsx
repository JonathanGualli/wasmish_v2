import { Composition } from 'remotion'
import { Capacitacion } from './Capacitacion.tsx'
import { loadFonts } from './fonts.ts'
import { FPS, totalFrames } from './lib/timeline.ts'
import { capacitacion } from './story/capacitacion.ts'
import './styles.css'

loadFonts()

export function Root() {
  return (
    <Composition
      id="capacitacion"
      component={Capacitacion}
      defaultProps={{ story: capacitacion }}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={totalFrames(capacitacion.scenes)}
    />
  )
}
