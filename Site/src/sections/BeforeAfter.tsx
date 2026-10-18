import type { CSSProperties } from 'react'
import { Check, Clock, MessageSquare, Moon, Smartphone, X } from 'lucide-react'
import type { BeforeAfter as Pair } from '../content/types.ts'
import { Highlight } from '../components/Highlight.tsx'
import { sectionTitle, sectionWrap } from '../components/RichText.tsx'

// Una hora («22:00») va en mono, como los datos de la app.
function WithTimes({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d{1,2}:\d{2})/).map((part, i) =>
        /^\d{1,2}:\d{2}$/.test(part)
          ? <span key={i} className="font-mono font-semibold tracking-[-0.04em]">{part}</span>
          : part)}
    </>
  )
}

// Los íconos que flotan a la derecha (solo con animaciones; sin ellas, quietos).
const FLOATING = [
  { Icon: Moon, size: 24, box: 'top-[76px] right-[9%] h-14 w-14 rounded-2xl bg-brand-deep text-white shadow-[0_4px_0_var(--color-site-deep-shadow)]', r: '-7deg', anim: '6s ease-in-out 0s' },
  { Icon: Clock, size: 22, box: 'top-[210px] right-[20%] h-12 w-12 rounded-[14px] border border-brand-border bg-white text-brand-gray-600 shadow-[0_4px_0_var(--color-site-card-shadow)]', r: '8deg', anim: '7s ease-in-out 1s' },
  { Icon: MessageSquare, size: 22, box: 'bottom-[90px] right-[6%] h-[52px] w-[52px] rounded-[15px] border border-brand-border bg-white text-brand-accent-strong shadow-[0_4px_0_var(--color-site-card-shadow)]', r: '-5deg', anim: '6.5s ease-in-out 0.5s' },
  { Icon: Smartphone, size: 20, box: 'bottom-[210px] right-[15%] h-11 w-11 rounded-[13px] bg-site-device text-brand-strong', r: '10deg', anim: '8s ease-in-out 2s' },
]

// «Lo que pasa hoy, y lo que pasa con Wasmish»: cada problema entra desde la
// izquierda y su respuesta, desde la derecha.
export function BeforeAfter({ pairs }: { pairs: Pair[] }) {
  return (
    <section className="overflow-hidden bg-brand-bg">
      <div className={`relative py-[clamp(64px,9vw,120px)] ${sectionWrap}`}>
        {FLOATING.map(({ Icon, size, box, r, anim }) => (
          <div key={r} aria-hidden
            className={`absolute hidden items-center justify-center md:flex ${box}`}
            style={{ '--r': r, animation: `wm-float ${anim} infinite` } as CSSProperties}>
            <Icon size={size} />
          </div>
        ))}

        <h2 data-reveal="" className={`relative max-w-[820px] ${sectionTitle}`}>
          Lo que pasa hoy, y lo que pasa <Highlight>con Wasmish</Highlight>.
        </h2>

        <div className="relative mt-[clamp(36px,5vw,64px)] grid max-w-[1040px] gap-[clamp(28px,4vw,48px)]">
          {pairs.map((pair) => (
            <div key={pair.before} className="grid justify-items-start gap-2.5">
              <div data-reveal="l"
                className="flex max-w-[860px] items-start gap-3.5 rounded-3xl border border-brand-border bg-white px-[clamp(18px,2.4vw,28px)] py-[clamp(16px,2vw,22px)] shadow-[0_4px_0_var(--color-site-card-shadow)]">
                <span className="mt-[0.15em] flex h-7 w-7 flex-none items-center justify-center rounded-full border-[1.5px] border-brand-subtle text-brand-muted">
                  <X size={13} strokeWidth={3} aria-hidden />
                </span>
                <span className="text-[clamp(21px,2.6vw,34px)] leading-[1.18] font-extrabold tracking-[-0.03em] text-brand-muted text-balance">
                  <WithTimes text={pair.before} />
                </span>
              </div>
              <div data-reveal="r" data-delay="180"
                className="ml-[clamp(16px,9vw,140px)] flex max-w-[860px] items-start gap-3.5 rounded-3xl bg-brand-deep px-[clamp(20px,2.8vw,32px)] py-[clamp(18px,2.4vw,28px)] shadow-[0_5px_0_var(--color-site-deep-shadow)]">
                <span className="mt-[0.2em] flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-white text-brand-deep">
                  <Check size={15} strokeWidth={3} aria-hidden />
                </span>
                <span className="text-[clamp(23px,3vw,40px)] leading-[1.12] font-extrabold tracking-[-0.035em] text-white text-balance">{pair.after}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
