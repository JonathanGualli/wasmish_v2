import type { ReactNode } from 'react'

// Un dato que todavía no existe (el número de WhatsApp, por ejemplo): el valor de ejemplo y la etiqueta, como en el diseño. `data-pending`
// es lo que busca el chequeo de huecos del lanzamiento (tests/output/pending.test.mjs).
// `stacked`: la etiqueta debajo del valor, alineada a la derecha (los montos del precio).
export function Pending({ children, label = 'pendiente', onDeep = false, stacked = false }: { children?: ReactNode; label?: string; onDeep?: boolean; stacked?: boolean }) {
  const tag = onDeep
    ? 'text-brand-warning-soft'
    : 'bg-brand-warning-soft text-brand-warning'
  return (
    <span data-pending className={stacked ? 'inline-grid justify-items-end gap-1' : 'inline-flex flex-wrap items-center gap-x-1.5 gap-y-1'}>
      {children}
      <span className={`rounded border border-dashed border-site-pending-border px-[5px] py-px font-mono text-[10.5px] leading-normal ${tag}`}>
        {label}
      </span>
    </span>
  )
}
