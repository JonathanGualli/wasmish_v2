import type { Niche } from '../content/types.ts'
import { Logo, Wordmark } from '../components/Logo.tsx'

// La imagen de vista previa del enlace (diseño «og2»): 1200 × 630. Es lo que ve
// el prospecto en WhatsApp antes de abrir la página. scripts/og.mjs la
// fotografía y la guarda en public/ con el nombre de `meta.ogImage`.
export function OgCard({ niche }: { niche: Niche }) {
  const { scene } = niche.hero
  const title = niche.hero.title.before + niche.hero.title.highlight + niche.hero.title.after
  return (
    <div data-og-file={niche.meta.ogImage} className="flex h-[630px] w-[1200px] overflow-hidden bg-white text-brand-text">
      <div className="flex w-[720px] flex-col justify-between px-14 pt-14 pb-[52px]">
        <div className="flex items-center gap-3.5">
          <Logo className="h-12 w-12" />
          <Wordmark className="text-[34px]" />
        </div>
        <div>
          <div className="text-[62px] leading-[1.02] font-extrabold tracking-[-0.045em] text-balance">{title}</div>
          <div className="mt-5 text-2xl text-brand-gray-600">Demostración de 15 minutos por WhatsApp · Ecuador</div>
        </div>
      </div>

      <div className="flex w-[480px] flex-col justify-center gap-5 bg-brand-deep px-10">
        <div className="self-end">
          <div className="max-w-[380px] rounded-[16px_16px_4px_16px] bg-brand-deep-hover px-[18px] py-3.5 text-[22px] leading-[1.35] text-white">{niche.og.bubble}</div>
          <div className="mt-1.5 text-right font-mono text-base text-brand-on-deep">{niche.og.time} · <b className="font-sans">{niche.og.by}</b></div>
        </div>
        <div className="rounded-[20px] bg-white p-6">
          <div className="flex items-center gap-3.5">
            <div className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-brand-deep text-xl font-bold text-brand-accent">{scene.contact.initials}</div>
            <div>
              <div className="text-[22px] font-bold tracking-[-0.015em]">{scene.contact.name}</div>
              <div className="text-base text-brand-gray-600">Ficha del contacto</div>
            </div>
          </div>
          <div className="mt-[18px] text-sm font-bold uppercase tracking-[0.08em] text-brand-muted">Notas</div>
          <div className="mt-2.5 rounded-xl bg-brand-bg px-4 py-3">
            <div className="text-base text-brand-subtle"><b className="text-brand-text">{scene.note.author}</b> · {scene.note.date}</div>
            <div className="mt-1 text-[21px] leading-[1.35] text-brand-strong">{scene.note.text}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
