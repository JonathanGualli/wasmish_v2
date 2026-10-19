import { Check } from 'lucide-react'
import { PRICE } from '../content/price.ts'
import { Highlight } from '../components/Highlight.tsx'
import { sectionTitle, sectionWrap } from '../components/RichText.tsx'

// El ejemplo de un mes (brief, § 3.6): 500 avisos de marketing a USD 0,074, la
// tarifa de Meta para «Resto de Latinoamérica», donde entra Ecuador (tabla del
// 1 de julio de 2026, sin cambios el 1 de octubre). Comprobado el 2026-10-19.
const META_EXAMPLE = 37

const row = 'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-t border-brand-border py-3'

// «Precio, con todo sumado»: la oferta de fundador y lo que cuesta un mes, Meta incluido.
export function Pricing() {
  const usd = (n: number) => `${PRICE.currency} ${n}`
  return (
    <section id="precio" className={`scroll-mt-16 py-[clamp(64px,9vw,120px)] ${sectionWrap}`}>
      <h2 data-reveal="" className={sectionTitle}>
        Precio, con todo <Highlight>sumado</Highlight>.
      </h2>

      <div className="mt-[clamp(28px,4vw,52px)] grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-stretch gap-[18px]">
        <div data-reveal="" className="flex flex-col gap-[18px] rounded-[28px] bg-brand-deep p-[clamp(24px,4vw,40px)] text-white shadow-[0_6px_0_var(--color-site-deep-shadow)]">
          <div>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="text-[clamp(56px,7vw,96px)] leading-[0.9] font-extrabold tracking-[-0.05em]">{usd(PRICE.founder)}</span>
              <span className="text-lg text-brand-on-deep">al mes</span>
            </div>
            <div className="mt-3 text-[17px] leading-[1.45] font-semibold">
              Durante los primeros {PRICE.founderMonths} meses. Desde el mes {PRICE.founderMonths + 1}, {usd(PRICE.regular)} al mes.
            </div>
            <div className="mt-1.5 text-[14.5px] text-brand-green-200">
              Oferta para los primeros {PRICE.founderSlots} clientes. Pago mensual, IVA incluido.
            </div>
          </div>
          <div className="h-px bg-brand-deep-active" />
          <div className="grid gap-[9px] text-[15.5px] leading-[1.45]">
            {['1 número de WhatsApp', '3 usuarios, contando al dueño', 'La implementación inicial, con Jonathan'].map((item) => (
              <div key={item} className="flex gap-3">
                <Check size={18} strokeWidth={2.6} className="mt-0.5 flex-none text-brand-green-200" aria-hidden />{item}
              </div>
            ))}
          </div>
          <div className="mt-auto text-[14.5px] leading-normal text-brand-on-deep">
            Usuario adicional: {usd(PRICE.extraUser)} al mes. Los cargos de Meta se pagan aparte.
          </div>
        </div>

        <div data-reveal="" data-delay="120" className="flex flex-col gap-[18px] rounded-[28px] border border-brand-border p-[clamp(24px,4vw,40px)] shadow-[0_6px_0_var(--color-brand-border)]">
          <div>
            <div className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-brand-gray-600">Ejemplo de un mes</div>
            <div className="mt-2 text-[17px] leading-[1.45] font-semibold">Un negocio con 3 usuarios envía un aviso de promoción a 500 contactos.</div>
          </div>
          <div className="grid">
            <div className={row}>
              <span className="text-[15.5px] text-brand-strong">Suscripción Wasmish</span>
              <span className="text-2xl font-extrabold tracking-[-0.03em] whitespace-nowrap">{usd(PRICE.founder)}</span>
            </div>
            <div className={row}>
              <span className="text-[15.5px] leading-[1.4] text-brand-strong">
                + Cargos de Meta en este ejemplo
                <span className="block text-[13.5px] text-brand-gray-600">500 avisos entregados, cobrados por Meta a su tarjeta</span>
              </span>
              <span className="grid justify-items-end gap-1">
                <span className="text-2xl font-extrabold tracking-[-0.03em] whitespace-nowrap">≈ {usd(META_EXAMPLE)}</span>
              </span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-t-2 border-brand-text pt-3.5">
              <span className="text-base font-bold">= Total de este ejemplo</span>
              <span className="grid justify-items-end gap-1">
                <span className="text-[clamp(30px,3.2vw,40px)] font-extrabold tracking-[-0.04em] whitespace-nowrap">≈ {usd(PRICE.founder + META_EXAMPLE)}</span>
              </span>
            </div>
          </div>
          <div className="mt-auto grid gap-2.5 text-[14.5px] leading-[1.55] text-brand-gray-600">
            <p className="m-0">Meta, la empresa dueña de WhatsApp, cobra por cada mensaje entregado según el tipo y el país, directamente a la tarjeta de su negocio. Wasmish no gana nada con eso.</p>
            <p className="m-0">
              <b className="text-brand-text">Las respuestas automáticas también son mensajes</b> y Meta las cobra igual que las de una persona, con 1.000 gratis al mes por número. Por eso Wasmish junta en un solo mensaje todo lo que corresponde responder.
            </p>
            <p className="m-0"><b className="text-brand-text">Lo que responde desde la app de WhatsApp Business sigue siendo gratis.</b> Meta cobra lo que se envía desde Wasmish.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
