const DOT = {
    on: { text: 'text-brand-accent-strong', dot: 'bg-brand-success' },
    off: { text: 'text-brand-muted', dot: 'bg-brand-border-strong' },
    error: { text: 'text-brand-danger', dot: 'bg-brand-danger' },
};

/** «● Encendida»: un estado con su punto de color (el asistente y la página en el teléfono). */
export const StatusDot = ({ tone, children }: { tone: keyof typeof DOT; children: string }) => (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${DOT[tone].text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${DOT[tone].dot}`} />
        {children}
    </span>
);
