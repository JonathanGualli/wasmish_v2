import type { ReactNode } from "react";

/** Estado a pantalla completa (lista vacía, error…): icono, título, texto y una acción. */
export const BlankState = ({ icon, tone = 'neutral', title, children, action }: {
    icon: ReactNode;
    tone?: 'neutral' | 'danger';
    title: string;
    children: ReactNode;
    action?: ReactNode;
}) => (
    <div className="border border-brand-border rounded-xl px-8 py-16 grid justify-items-center gap-2.5 text-center">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center
            ${tone === 'danger' ? 'bg-brand-danger-soft text-brand-danger' : 'bg-brand-bg text-brand-muted'}`}>
            {icon}
        </div>
        <div className="text-[17px] font-semibold text-brand-text">{title}</div>
        <div className="max-w-[420px] text-sm leading-[1.6] text-brand-muted">{children}</div>
        {action && <div className="mt-2 h-10">{action}</div>}
    </div>
);
