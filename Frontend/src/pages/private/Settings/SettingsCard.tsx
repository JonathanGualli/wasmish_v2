import type { ReactNode } from "react";

/** Tarjeta de sección de Ajustes — el lenguaje de card del manual: borde, sin sombra. */
export const SettingsCard = ({ children }: { children: ReactNode }) => (
    <section className="rounded-xl border border-brand-border bg-brand-surface p-6">
        {children}
    </section>
);
