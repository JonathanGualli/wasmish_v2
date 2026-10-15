import { SkeletonLine, SkeletonNumber } from "../Skeleton/Skeleton";

export interface Metric {
    label: string;
    value: number;
    /** La aclaración bajo la cifra: «Meta los aceptó», «Solo se rellena lo vacío». */
    note: string;
    tone?: 'success' | 'info' | 'warning' | 'danger' | 'muted';
}

// Los mismos colores que las píldoras de cada estado.
const METRIC_TONE = {
    success: 'text-brand-success', info: 'text-brand-info', warning: 'text-brand-warning',
    danger: 'text-brand-danger', muted: 'text-brand-muted',
};

/**
 * Cifras en una cuadrícula de celdas separadas por una línea fina. Cada una
 * con su aclaración, porque una cifra sola no dice qué cuenta. `columns` son
 * las clases de las columnas, que cambian según cuántas cifras haya.
 */
export const MetricGrid = ({ metrics, columns }: { metrics: Metric[]; columns: string }) => (
    <div className={`grid ${columns} gap-px bg-brand-border border border-brand-border rounded-xl overflow-hidden`}>
        {metrics.map(m => (
            <div key={m.label} className="bg-brand-surface px-3.5 py-3">
                <div className={`font-mono text-xl font-semibold tabular-nums ${m.tone ? METRIC_TONE[m.tone] : 'text-brand-text'}`}>
                    {m.value.toLocaleString('es-EC')}
                </div>
                <div className="text-[12.5px] font-semibold text-brand-strong mt-0.5">{m.label}</div>
                <div className="text-[11.5px] text-brand-muted mt-px">{m.note}</div>
            </div>
        ))}
    </div>
);

const NUMBER_WIDTHS = ['56px', '44px', '64px', '36px'];

/** Mientras carga: las etiquetas reales y, en lugar de la cifra y su aclaración, bloques del mismo alto. */
export const MetricGridSkeleton = ({ labels, columns }: { labels: string[]; columns: string }) => (
    <div className={`grid ${columns} gap-px bg-brand-border border border-brand-border rounded-xl overflow-hidden`}>
        {labels.map((label, i) => (
            <div key={label} className="bg-brand-surface px-3.5 py-3">
                <div className="h-7 flex items-center"><SkeletonNumber width={NUMBER_WIDTHS[i % NUMBER_WIDTHS.length]} className="h-[18px]" /></div>
                <div className="text-[12.5px] font-semibold text-brand-strong mt-0.5">{label}</div>
                <div className="h-[17px] mt-px flex items-center"><SkeletonLine soft width="60%" /></div>
            </div>
        ))}
    </div>
);
