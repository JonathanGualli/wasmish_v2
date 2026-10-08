import type { ReactNode } from "react";

/** Las tarjetas blancas de la ficha: título con su icono y, a la derecha, su estado o acción. */
export const SidebarCard = ({ title, icon, aside, className = 'border-transparent', children }: {
    title: string;
    icon?: ReactNode;
    aside?: ReactNode;
    /** El color del borde: el de las notas cambia al escribir o si falla al guardar. */
    className?: string;
    children: ReactNode;
}) => (
    <section className={`bg-brand-surface rounded-xl border p-3.5 grid gap-2.5 transition-colors ${className}`}>
        <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-bold text-brand-text">{title}</h3>
            {aside && <span className="ml-auto">{aside}</span>}
        </div>
        {children}
    </section>
);
