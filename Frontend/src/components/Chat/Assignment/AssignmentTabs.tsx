import { ASSIGNMENT_TABS, type AssignmentTab } from "../../../utils/assignment";

/**
 * «Mías / Sin asignar / Todas» en la bandeja (diseño, 1a). Cada vista dice
 * cuántas tiene sin leer. Solo con más de una persona en la cuenta.
 */
export const AssignmentTabs = ({ value, onChange, unread }: {
    value: AssignmentTab;
    onChange: (tab: AssignmentTab) => void;
    unread: Record<AssignmentTab, number>;
}) => (
    <div role="tablist" aria-label="Qué conversaciones ver"
        className="flex gap-0.5 p-[3px] bg-brand-bg border border-brand-border rounded-[9px] max-md:rounded-[10px]">
        {ASSIGNMENT_TABS.map(tab => {
            const on = tab.key === value;
            return (
                <button key={tab.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 h-[30px] max-md:h-[38px] rounded-[7px] max-md:rounded-lg
                        text-[13px] max-md:text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors
                        ${on ? 'bg-brand-surface text-brand-text shadow-[0_1px_2px_rgba(14,17,22,0.1)]' : 'text-brand-gray-600 hover:text-brand-text'}`}>
                    {tab.label}
                    {unread[tab.key] > 0 && (
                        <span className="min-w-[18px] h-[18px] px-[5px] rounded-[9px] bg-brand-accent text-brand-ink
                            text-[10.5px] font-bold tabular-nums flex items-center justify-center">
                            {unread[tab.key]}
                        </span>
                    )}
                </button>
            );
        })}
    </div>
);
