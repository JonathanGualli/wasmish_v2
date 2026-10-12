import { useState } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Minus, Pencil, Plus } from "lucide-react";
import type { AdminClient } from "../../../models/admin.model";
import { CustomButton } from "../../../components/Button/Button";
import { useUpdateAccountLimits } from "../../../hooks/useAdmin";
import { apiErrorOf } from "../../../utils/apiError";

const MIN_LINES = 1;
const MAX_LINES = 50;

const clamp = (value: number) => Math.min(MAX_LINES, Math.max(MIN_LINES, value));

const StepButton = ({ label, onClick, disabled, children }: {
    label: string; onClick: () => void; disabled: boolean; children: React.ReactNode;
}) => (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled}
        className="w-9 h-full flex items-center justify-center text-brand-gray-600 hover:bg-brand-bg
            disabled:text-brand-subtle disabled:cursor-not-allowed cursor-pointer">
        {children}
    </button>
);

/** El panel para cambiar el máximo: de 1 a 50, avisando si queda por debajo de las conectadas. */
const LimitEditor = ({ client, close }: { client: AdminClient; close: () => void }) => {
    const [value, setValue] = useState(client.lines.max);
    const update = useUpdateAccountLimits();
    const { active } = client.lines;

    const save = () => update.mutate({ accountId: client.accountId!, maxLines: value }, { onSuccess: close });

    return (
        <div className="grid gap-3">
            <p className="text-sm font-bold text-brand-text">Máximo de líneas</p>
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center h-[38px] overflow-hidden rounded-[8px] border-[1.5px] border-brand-accent-strong ring-[3px] ring-brand-accent-soft">
                    <StepButton label="Una menos" onClick={() => setValue(clamp(value - 1))} disabled={value <= MIN_LINES}><Minus size={16} /></StepButton>
                    <input
                        aria-label="Máximo de líneas"
                        inputMode="numeric"
                        value={value}
                        onChange={(e) => setValue(clamp(Number(e.target.value.replace(/\D/g, '')) || MIN_LINES))}
                        className="w-11 text-center font-mono text-[15px] font-semibold text-brand-text tabular-nums focus:outline-none"
                    />
                    <StepButton label="Una más" onClick={() => setValue(clamp(value + 1))} disabled={value >= MAX_LINES}><Plus size={16} /></StepButton>
                </div>
                <span className="text-[13px] text-brand-muted">
                    Entre {MIN_LINES} y {MAX_LINES} · conectadas: <span className="font-mono text-brand-text">{active}</span>
                </span>
            </div>
            {value < active && (
                <p className="rounded-[8px] border border-brand-border bg-brand-warning-soft px-3 py-2.5 text-[13px] leading-[1.5] text-brand-strong">
                    Tiene {active} líneas conectadas. Bajar a {value} no desconecta ninguna: las {active} siguen funcionando, solo no podrá conectar otra.
                </p>
            )}
            {update.isError && <p className="text-[13px] text-brand-danger">{apiErrorOf(update.error).message}</p>}
            <div className="flex justify-end gap-2">
                <div className="h-[34px]"><CustomButton variant="ghost" onClick={close} disabled={update.isPending}>Cancelar</CustomButton></div>
                <div className="h-[34px]"><CustomButton variant="secondary" onClick={save} isLoading={update.isPending}>Guardar</CustomButton></div>
            </div>
        </div>
    );
};

/**
 * La columna «Líneas» del panel: conectadas / máximo del plan, en ámbar si
 * está por encima, y el máximo se cambia en el sitio.
 */
export const LinesLimitCell = ({ client }: { client: AdminClient }) => {
    const { active, max } = client.lines;
    const over = active - max;

    if (!client.accountId) return <span className="font-mono text-[13px] text-brand-subtle tabular-nums">{active} / {max}</span>;

    return (
        <Popover className="relative">
            <PopoverButton aria-label={`Cambiar el máximo de líneas de ${client.name}`}
                className={`-ml-2 inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border px-2 font-mono text-[13px] font-semibold
                    tabular-nums cursor-pointer transition-colors hover:border-brand-border-strong data-[open]:border-brand-accent-strong
                    ${over > 0 ? 'border-transparent bg-brand-warning-soft text-brand-warning'
                        : active === 0 ? 'border-transparent text-brand-subtle' : 'border-transparent text-brand-text'}`}>
                {active} / {max}
                <Pencil size={12} className="text-brand-subtle" />
            </PopoverButton>
            {over > 0 && <p className="mt-0.5 whitespace-nowrap text-[11.5px] font-semibold text-brand-warning">+{over} sobre el plan</p>}
            <PopoverPanel anchor={{ to: 'bottom start', gap: 8 }}
                className="z-50 w-[330px] rounded-xl border border-brand-border bg-brand-surface p-4 shadow-[0_18px_44px_rgba(14,17,22,0.16)]">
                {({ close }) => <LimitEditor client={client} close={close} />}
            </PopoverPanel>
        </Popover>
    );
};
