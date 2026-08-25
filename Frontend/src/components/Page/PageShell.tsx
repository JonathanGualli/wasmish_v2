import type { ReactNode } from 'react';

/**
 * Contenedor de página. Desde que no hay barra de título global, cada página
 * aporta su propio encabezado; esto mantiene el ancho y los márgenes iguales
 * en todas.
 */
export const PageShell = ({
    children,
    width = 'default',
}: {
    children: ReactNode;
    /** `wide` para páginas con tablas, que necesitan más aire horizontal. */
    width?: 'default' | 'wide';
}) => (
    <div className={`mx-auto px-5 sm:px-8 py-8 sm:py-10
        ${width === 'wide' ? 'max-w-6xl' : 'max-w-5xl'}`}>
        {children}
    </div>
);

/** Encabezado de página: sello de icono, H1 del manual (30/700) y acciones. */
export const PageHeader = ({
    icon,
    title,
    description,
    actions,
}: {
    icon: ReactNode;
    title: string;
    description?: string;
    actions?: ReactNode;
}) => (
    <header className="flex flex-col sm:flex-row sm:items-start gap-4 mb-10">
        <div className="w-10 h-10 rounded-[10px] bg-brand-accent-soft text-brand-accent-strong
            flex items-center justify-center flex-none">
            {icon}
        </div>
        <div className="min-w-0 flex-1">
            <h1 className="text-[30px] font-bold tracking-[-0.03em] leading-none text-brand-text">
                {title}
            </h1>
            {description && (
                <p className="text-[15px] leading-[1.6] text-brand-muted mt-2 max-w-[620px]">
                    {description}
                </p>
            )}
        </div>
        {actions && <div className="flex-none sm:self-center">{actions}</div>}
    </header>
);

/** Título de sección dentro de una página — H2 del manual (22/700). */
export const SectionTitle = ({
    children,
    description,
    className = '',
}: {
    children: ReactNode;
    description?: string;
    className?: string;
}) => (
    <div className={`mb-5 ${className}`}>
        <h2 className="text-[22px] font-bold tracking-[-0.02em] text-brand-text">{children}</h2>
        {description && (
            <p className="text-[15px] leading-[1.6] text-brand-muted mt-1.5 max-w-[620px]">
                {description}
            </p>
        )}
    </div>
);
