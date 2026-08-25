import type { ReactNode } from 'react';

export { Callout } from '../../../components/Callout/Callout';

/**
 * Código en línea. La página lo repetía a mano con cuatro variantes distintas
 * de tamaño y fondo; aquí hay una sola, en la escala «Dato» del manual.
 */
export const Code = ({ children }: { children: ReactNode }) => (
    <code className="font-mono text-[13px] text-brand-text bg-brand-raised
        rounded px-1.5 py-0.5 break-words">
        {children}
    </code>
);

/** Encabezado numerado de subsección — H3 del manual. Ancla del índice lateral. */
export const StepHeading = ({ n, id, children }: { n: number; id: string; children: ReactNode }) => (
    <h3 id={id} className="scroll-mt-6 flex items-baseline gap-2.5 text-[17px] font-semibold text-brand-text mt-9 mb-2.5">
        <span className="font-mono text-[13px] font-medium text-brand-subtle tabular-nums">
            {String(n).padStart(2, '0')}
        </span>
        {children}
    </h3>
);

/** Tabla de referencia con la cabecera en estilo «Etiqueta». */
export const RefTable = ({ head, children }: { head: string[]; children: ReactNode }) => (
    <div className="overflow-x-auto rounded-xl border border-brand-border">
        <table className="w-full">
            <thead>
                <tr className="border-b border-brand-border bg-brand-bg text-left">
                    {head.map((h, i) => (
                        <th
                            key={h}
                            className={`py-3 text-[11px] font-semibold uppercase tracking-[0.1em]
                                text-brand-muted ${i === 0 ? 'px-4' : 'pr-4'}`}
                        >
                            {h}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    </div>
);
