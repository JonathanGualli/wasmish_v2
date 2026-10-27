import { ArrowRight, RefreshCw, X } from "lucide-react";

/**
 * Una barra bajo la cabecera del chat que se cierra con la X (diseño, 2a y 2c):
 * `handoff` cuando a quien mira le pasaron la conversación, `changed` cuando
 * su cambio no se hizo porque otra persona la movió antes.
 */
export const AssignmentNotice = ({ tone, children, onClose }: {
    tone: 'handoff' | 'changed';
    children: React.ReactNode;
    onClose: () => void;
}) => (
    <div role="status"
        className={`flex-none flex items-center gap-2.5 px-6 max-md:px-4 py-[11px] border-b text-[13.5px] text-brand-text
            ${tone === 'handoff' ? 'bg-brand-green-50 border-brand-accent-soft' : 'bg-brand-bg border-brand-border'}`}>
        {tone === 'handoff'
            ? <ArrowRight size={15} strokeWidth={2.2} className="flex-none text-brand-accent-strong" />
            : <RefreshCw size={15} strokeWidth={2.2} className="flex-none text-brand-gray-600" />}
        <span className="flex-1 min-w-0">{children}</span>
        <button type="button" onClick={onClose} title="Cerrar" className="flex-none text-brand-muted hover:text-brand-text cursor-pointer">
            <X size={14} />
        </button>
    </div>
);
