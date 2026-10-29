import { AbsoluteFill, Composition } from 'remotion'
import { ChatItemView, Composer } from '../../Site/src/components/app/Chat.tsx'
import { loadFonts } from './fonts.ts'
import './styles.css'

loadFonts()

// Provisional (Tarea 2 del plan): comprueba que las piezas de Site/ se pintan
// con sus fuentes y sin otra copia de React.
function Probe() {
  return (
    <AbsoluteFill className="bg-brand-bg">
      <div className="flex w-[390px] origin-top-left scale-[2.77] flex-col gap-2 p-3">
        <ChatItemView item={{ id: 'c', kind: 'chip', text: '18 oct · hace 10 días' }} />
        <ChatItemView item={{ id: 'i', kind: 'in', text: '¿Qué días es el curso de Excel avanzado?', time: '10:12' }} />
        <ChatItemView item={{ id: 'o', kind: 'out', text: 'Tenemos grupo los sábados de 9:00 a 13:00.', time: '10:16', who: 'Gabriela' }} />
        <ChatItemView item={{ id: 'p', kind: 'pdf', file: 'Excel-Avanzado-Academia-Horizonte.pdf', size: 'PDF · 1,2 MB', time: '10:16', who: 'Gabriela' }} />
        <Composer text={null} />
      </div>
    </AbsoluteFill>
  )
}

export function Root() {
  return <Composition id="capacitacion" component={Probe} width={1080} height={1920} fps={30} durationInFrames={30} />
}
