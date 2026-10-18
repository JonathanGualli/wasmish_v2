import { FAQ } from '../content/home.ts'
import { RichText, sectionTitle, sectionWrap } from '../components/RichText.tsx'

// Las preguntas frecuentes, con <details>: se abren sin JavaScript.
export function Faq() {
  return (
    <section className="bg-brand-bg">
      <div className={`grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-x-[clamp(32px,5vw,80px)] gap-y-7 py-[clamp(64px,9vw,120px)] ${sectionWrap}`}>
        <h2 data-reveal="" className={sectionTitle}>Preguntas frecuentes.</h2>
        <div className="grid min-w-0 gap-2.5">
          {FAQ.map((item) => (
            <details key={item.q} className="rounded-[18px] border border-brand-border bg-white shadow-[0_3px_0_var(--color-site-card-shadow)]">
              <summary className="flex min-h-14 cursor-pointer items-center gap-3.5 px-5 py-2.5 text-base font-semibold">
                {item.q}
                <span className="faq-plus ml-auto text-[22px] font-normal text-brand-gray-600 transition-transform duration-200" aria-hidden>+</span>
              </summary>
              <div className="px-5 pb-[18px] text-[15.5px] leading-[1.6] text-brand-strong">
                <RichText parts={item.a} />
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
