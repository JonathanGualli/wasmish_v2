import type { ReactNode } from 'react'

// Un dato que todavía no existe (el número de WhatsApp, el RUC, una cifra de
// Meta): el valor de ejemplo y la etiqueta «pendiente», como en el diseño.
// `data-pending` es lo que busca el chequeo de huecos del lanzamiento.
export function Pending({ children }: { children?: ReactNode }) {
  return (
    <span data-pending className="inline-flex items-center gap-1.5">
      {children}
      <span className="rounded border border-dashed border-brand-warning px-1 font-mono text-[10px] leading-4 text-brand-warning">
        pendiente
      </span>
    </span>
  )
}
