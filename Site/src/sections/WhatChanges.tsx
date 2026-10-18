import { APP_CHANGES } from '../content/home.ts'
import { Highlight } from '../components/Highlight.tsx'
import { sectionTitle, sectionWrap } from '../components/RichText.tsx'

const item = 'grid grid-cols-[44px_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-site-deep-line py-6'
const number = 'pt-[5px] font-mono text-sm font-semibold text-brand-green-200'
const heading = 'text-[clamp(21px,2.2vw,26px)] font-extrabold tracking-[-0.025em]'
const body = 'mt-2 mb-0 text-base leading-[1.6] text-site-on-deep-strong text-pretty'

// «Lo que cambia en su WhatsApp» (brief, § 3.4): visible antes de pedir la demostración.
export function WhatChanges() {
  return (
    <section id="cambios" className="scroll-mt-16 bg-brand-deep text-white">
      <div className={`grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-[clamp(28px,5vw,80px)] py-[clamp(64px,9vw,120px)] ${sectionWrap}`}>
        <div data-reveal="">
          <div className="font-mono text-xs uppercase tracking-[0.1em] text-brand-green-200">Antes de la demostración</div>
          <h2 className={`mt-3.5 ${sectionTitle}`}>Lo que cambia en <Highlight inverse>su WhatsApp</Highlight>.</h2>
        </div>

        <div className="grid">
          <div data-reveal="" className={item}>
            <span className={number}>01</span>
            <div>
              <div className={heading}>Su número y su app</div>
              <p className={body}>
                Sigue usando la app de WhatsApp Business en el celular, con el mismo número, y además atiende desde Wasmish. Lo que llega se ve en los dos lados, y lo que responde desde la app aparece en Wasmish marcado «Desde la app de WhatsApp», sin el nombre de quién lo envió.
              </p>
              <div className="mt-3.5 grid gap-[9px] text-[15px] leading-normal text-brand-on-deep">
                {APP_CHANGES.map((parts, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-brand-green-200" />
                    <span>{parts.map((p, j) => (typeof p === 'string' ? p : <b key={j} className="text-white">{p.strong}</b>))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div data-reveal="" className={item}>
            <span className={number}>02</span>
            <div>
              <div className={heading}>Las 24 horas</div>
              <p className={body}>
                Puede responderle a un cliente libremente durante las 24 horas siguientes a su último mensaje. Después, para escribirle hay que usar una <b className="text-white">plantilla</b>: un mensaje aprobado por WhatsApp para iniciar o retomar una conversación. Siempre a contactos que aceptaron recibir mensajes.
              </p>
            </div>
          </div>
          <div data-reveal="" className={`${item} border-b`}>
            <span className={number}>03</span>
            <div>
              <div className={heading}>Lo que cobra Meta</div>
              <p className={body}>
                Va aparte, directo a la tarjeta de su negocio. <a href="#precio" className="font-semibold text-white">Vea el ejemplo de un mes</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
