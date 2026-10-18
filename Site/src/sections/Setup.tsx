import { CONTACT_EMAIL, WHATSAPP_NUMBER } from '../site.ts'
import { SETUP_STEPS } from '../content/home.ts'
import { Highlight } from '../components/Highlight.tsx'
import { Pending } from '../components/Pending.tsx'
import { sectionTitle, sectionWrap } from '../components/RichText.tsx'

// «Le ayudo a dejarlo funcionando»: los 4 pasos, el alcance y quién lo hace.
export function Setup() {
  return (
    <section className="bg-brand-bg">
      <div className={`py-[clamp(64px,9vw,120px)] ${sectionWrap}`}>
        <h2 data-reveal="" className={`max-w-[860px] ${sectionTitle}`}>
          «Le ayudo a dejarlo <Highlight>funcionando</Highlight>».
        </h2>

        <div className="mt-[clamp(32px,4vw,56px)] grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-4">
          {SETUP_STEPS.map((step, i) => {
            const last = i === SETUP_STEPS.length - 1
            return (
              <div key={step} data-reveal="" data-delay={i * 120}
                className={`flex min-h-[220px] flex-col gap-[18px] rounded-[28px] p-[clamp(22px,2.6vw,30px)] ${
                  last
                    ? 'bg-brand-deep text-white shadow-[0_6px_0_var(--color-site-deep-shadow)]'
                    : 'border border-brand-border bg-white shadow-[0_6px_0_var(--color-site-card-shadow)]'}`}>
                <span className={`text-[clamp(56px,6vw,84px)] leading-[0.85] font-extrabold tracking-[-0.06em] ${last ? 'text-brand-green-200' : 'text-brand-deep'}`}>{i + 1}</span>
                <span className="mt-auto text-[clamp(22px,2vw,27px)] leading-[1.15] font-extrabold tracking-[-0.03em] text-balance">{step}</span>
              </div>
            )
          })}
        </div>

        <p data-reveal="" className="mt-[26px] mb-0 max-w-[760px] text-base leading-[1.55] text-brand-strong text-pretty">
          Incluido en el precio, en <b>hasta 2 horas</b> de trabajo: 2 plantillas, 1 importación de contactos y 1 capacitación a su equipo. Lo que vaya más allá, como integraciones, se cotiza antes. Después, soporte por WhatsApp, en español.
        </p>

        <div data-reveal=""
          className="mt-[clamp(28px,4vw,44px)] flex max-w-[760px] flex-wrap items-center gap-x-6 gap-y-3.5 rounded-3xl border border-brand-border bg-white px-[22px] py-[18px] shadow-[0_5px_0_var(--color-site-card-shadow)]">
          <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[14px] bg-brand-deep text-lg font-extrabold tracking-[-0.03em] text-white">JG</div>
          <div className="flex-[1_1_220px]">
            <div className="text-[17px] font-bold">Jonathan Gualli</div>
            <div className="mt-0.5 text-[14.5px] leading-normal text-brand-gray-600">Desarrollador de Wasmish, en Ecuador. Atiende y da soporte él mismo.</div>
          </div>
          <div className="grid gap-[3px] font-mono text-[13px] text-brand-strong">
            <span>{WHATSAPP_NUMBER ? `+${WHATSAPP_NUMBER}` : <Pending>+593 9X XXX XXXX</Pending>}</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-strong no-underline hover:underline">{CONTACT_EMAIL}</a>
          </div>
        </div>
      </div>
    </section>
  )
}
