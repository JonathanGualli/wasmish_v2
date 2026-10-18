import { ArrowRight } from 'lucide-react'
import { demoHref } from '../lib/links.ts'
import { Pending } from './Pending.tsx'

// La acción principal de la página: abre WhatsApp con el texto ya escrito, que
// dice de qué página viene. Es el único elemento menta de cada vista.
export function DemoButton({ label, large = false }: { label: string; large?: boolean }) {
  const href = demoHref(label)
  const size = large ? 'min-h-[58px] px-7 text-[17px]' : 'min-h-14 px-[26px] text-[16.5px]'
  const button = `press-mint inline-flex items-center gap-2.5 rounded-[14px] font-bold no-underline ${size}`
  return (
    <div className="grid justify-items-start gap-3">
      {href ? (
        <a href={href} className={button}>
          Pedir una demostración
          <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
        </a>
      ) : (
        // Sin número todavía: el botón se ve, deshabilitado (revisión de Codex, PR #94).
        <Pending>
          <button type="button" disabled className={button}>
            Pedir una demostración
            <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
          </button>
        </Pending>
      )}
      <span className="mt-1 text-[13.5px] leading-[1.45] text-brand-gray-600">
        Demostración de 15 minutos · Sin compromiso · Le atiende Jonathan
      </span>
    </div>
  )
}
