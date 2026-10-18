import { Smartphone } from 'lucide-react'
import type { Niche } from '../content/types.ts'
import { HighlightedTitle } from '../components/Highlight.tsx'
import { DemoButton } from '../components/DemoButton.tsx'
import { HeroDemo } from './HeroDemo.tsx'

// Lo primero que se ve: el titular, el botón y, al lado (o debajo, en el
// celular), la conversación animada.
export function Hero({ niche }: { niche: Niche }) {
  const { hero } = niche
  return (
    <section className="mx-auto box-content flex max-w-[1320px] flex-wrap items-center gap-[clamp(40px,5vw,72px)] px-[clamp(20px,5vw,64px)] pt-[clamp(28px,7vw,96px)] pb-[clamp(56px,8vw,112px)]">
      <div className="min-w-0 flex-[1_1_400px]">
        <div className="mb-[18px] hidden font-mono text-xs uppercase tracking-[0.1em] text-brand-gray-600 min-[900px]:block">{hero.eyebrow}</div>
        <h1 className="m-0 text-[clamp(40px,5.6vw,80px)] leading-[1.02] font-extrabold tracking-[-0.045em] text-balance">
          <HighlightedTitle text={hero.title} enter />
        </h1>
        <p className="mt-5 max-w-[520px] text-[clamp(17px,1.4vw,19px)] leading-[1.55] text-brand-strong text-pretty">{hero.subtitle}</p>
        <div className="mt-[26px]">
          <DemoButton label={niche.demoLabel} />
        </div>
        <HeroFacts className="mt-7 hidden min-[900px]:grid" />
      </div>

      <div className="grid min-w-0 flex-[1.35_1_540px] gap-[18px]">
        <HeroDemo scene={hero.scene} />
        <p className="m-0 text-[clamp(17px,1.5vw,20px)] leading-[1.4] font-semibold tracking-[-0.015em] text-balance">
          {hero.caption.strong} <span className="text-brand-gray-600">{hero.caption.soft}</span>
        </p>
        {/* En el celular van debajo de la conversación, para que esta asome en la primera pantalla. */}
        <HeroFacts className="grid min-[900px]:hidden" />
      </div>
    </section>
  )
}

// Quién está detrás y que se sigue con la app.
function HeroFacts({ className }: { className: string }) {
  return (
    <div className={`gap-2.5 text-[14.5px] leading-[1.45] text-brand-strong ${className}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-brand-deep text-[10.5px] font-extrabold text-white">JG</span>
        <span><b className="text-brand-text">Jonathan Gualli</b> · Ecuador · Le ayudo a dejarlo funcionando</span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-brand-raised text-brand-accent-strong">
          <Smartphone size={15} strokeWidth={2.2} aria-hidden />
        </span>
        <span>
          <b className="text-brand-text">Sigue con su app de WhatsApp Business y su número.</b>{' '}
          <a href="#cambios" className="font-semibold text-brand-accent-strong">Qué cambia</a>
        </span>
      </div>
    </div>
  )
}
