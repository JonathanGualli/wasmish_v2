import { Highlight } from '../components/Highlight.tsx'
import { DemoButton } from '../components/DemoButton.tsx'
import { sectionWrap } from '../components/RichText.tsx'

// El cierre: la demostración otra vez, antes del pie.
export function ClosingCta({ demoLabel }: { demoLabel: string }) {
  return (
    <section className={`py-[clamp(64px,9vw,120px)] ${sectionWrap}`}>
      <div data-reveal="" className="grid max-w-[900px] justify-items-start gap-6">
        <h2 className="m-0 text-[clamp(38px,5.6vw,80px)] leading-none font-extrabold tracking-[-0.05em] text-balance">
          Véalo con el caso de su negocio, en <Highlight>15 minutos</Highlight>.
        </h2>
        <p className="m-0 max-w-[560px] text-[17px] leading-[1.55] text-brand-gray-600">
          Jonathan le muestra Wasmish por WhatsApp y responde sus preguntas.
        </p>
        <DemoButton label={demoLabel} large />
      </div>
    </section>
  )
}
