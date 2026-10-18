import { useEffect, useRef, useState } from 'react'
import type { Feature } from '../content/types.ts'
import { FEATURE_STRIP } from '../content/home.ts'
import { Highlight } from '../components/Highlight.tsx'
import { sectionTitle, sectionWrap } from '../components/RichText.tsx'
import { FeatureScreen } from '../components/app/FeatureScreen.tsx'

// El contador y su barra: «2 / 4 ▬▬▭▭», sobre verde profundo.
function Counter({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="min-w-11 font-mono text-sm text-brand-green-200">{index + 1} / {total}</span>
      <span className="flex flex-1 gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-sm transition-colors duration-[400ms] ${i <= index ? 'bg-white' : 'bg-site-deep-line'}`} />
        ))}
      </span>
    </div>
  )
}

// «Lo que ve su equipo, una cosa a la vez» (diseño v3). En la computadora
// (≥ 900 px), los textos pasan a la izquierda y la pantalla de la derecha queda
// fija y cambia con la función que está en el centro. En el celular, cada
// función lleva su pantalla debajo, y se anima al llegar a ella.
export function Features({ features, stripText = {} }: { features: Feature[]; stripText?: Record<string, string> }) {
  const rootRef = useRef<HTMLDivElement>(null)
  // Hasta montar, todo «encendido»: es lo que dibuja el servidor y lo que ve
  // quien no tiene JavaScript o desactivó las animaciones.
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState(0)
  const [seen, setSeen] = useState(-1)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const wide = window.matchMedia('(min-width: 900px)')
    let frame = 0
    const measure = () => {
      frame = 0
      const steps = root.querySelectorAll<HTMLElement>('[data-feat]')
      const middle = window.innerHeight / 2
      const threshold = window.innerHeight * (wide.matches ? 0.5 : 0.7)
      let best = 0
      let bestDistance = Infinity
      let lastSeen = -1
      steps.forEach((el, i) => {
        const r = el.getBoundingClientRect()
        const distance = Math.abs((r.top + r.bottom) / 2 - middle)
        if (distance < bestDistance) { bestDistance = distance; best = i }
        if (r.top < threshold) lastSeen = i
      })
      setActive(best)
      setSeen((s) => Math.max(s, lastSeen))
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure) }
    if (!reduced) setReady(true)
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <section className="bg-brand-deep text-white">
      <div className={`pt-[clamp(64px,9vw,120px)] pb-[clamp(56px,8vw,104px)] ${sectionWrap}`}>
        <h2 data-reveal="" className={`max-w-[820px] ${sectionTitle}`}>
          Lo que ve su equipo, <Highlight inverse>una cosa a la vez</Highlight>.
        </h2>

        <div ref={rootRef} className="mt-[clamp(28px,4vw,48px)] grid gap-16 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] min-[900px]:gap-[clamp(40px,6vw,96px)]">
          <div className="grid gap-16 min-[900px]:gap-0">
            {features.map((feature, i) => (
              <div key={feature.title} data-feat={i}
                className={`flex flex-col justify-center gap-4 transition-opacity duration-[400ms] min-[900px]:min-h-[72vh] ${
                  ready && active !== i ? 'min-[900px]:opacity-[0.32]' : ''}`}>
                <div className="min-[900px]:hidden"><Counter index={i} total={features.length} /></div>
                <h3 className="m-0 text-[clamp(30px,3.8vw,52px)] leading-[1.04] font-extrabold tracking-[-0.04em] text-balance">{feature.title}</h3>
                <p className="m-0 max-w-[480px] text-[17px] leading-[1.55] text-brand-on-deep text-pretty">{feature.text}</p>
                <div className="mt-2 h-[460px] min-[900px]:hidden">
                  <FeatureScreen screen={feature.screen} on={!ready || i <= seen} />
                </div>
              </div>
            ))}
          </div>

          {/* La pantalla fija de la computadora. */}
          <div className="relative hidden min-w-0 min-[900px]:block">
            <div className="sticky top-16 flex h-[calc(100vh-64px)] flex-col justify-center gap-[18px]">
              <Counter index={active} total={features.length} />
              <div className="relative h-[min(480px,calc(100vh-200px))]">
                {features.map((feature, i) => (
                  <div key={feature.title} aria-hidden={active !== i}
                    className="absolute inset-0 transition-[opacity,transform] duration-[450ms] ease-[cubic-bezier(0.2,0.7,0.2,1)]"
                    style={{
                      opacity: active === i ? 1 : 0,
                      transform: active === i ? 'none' : i < active ? 'translateY(-24px) scale(0.97)' : 'translateY(24px) scale(0.97)',
                    }}>
                    <FeatureScreen screen={feature.screen} on={!ready || active === i} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div data-reveal=""
          className="mt-[clamp(48px,6vw,80px)] grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-x-8 gap-y-5 border-t border-brand-deep-active pt-7">
          {FEATURE_STRIP.map((item) => (
            <div key={item.title}>
              <div className="text-base font-bold">{item.title}</div>
              <div className="mt-1 text-[14.5px] leading-normal text-brand-on-deep">{stripText[item.title] ?? item.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
