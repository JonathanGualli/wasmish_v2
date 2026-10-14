import { useState } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Minus, Pencil, Plus } from "lucide-react";
import type { AdminClient } from "../../../models/admin.model";
import { CustomButton } from "../../../components/Button/Button";
import { useUpdateAccountLimits } from "../../../hooks/useAdmin";
import { apiErrorOf } from "../../../utils/apiError";

type LimitKind = 'lines' | 'users';

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * Lo que cambia entre las dos columnas. «En uso» de los usuarios cuenta las
 * personas activas y las invitaciones pendientes (Fase 3), como `maxUsers`.
 */
const LIMITS: Record<LimitKind, {
    field: 'maxLines' | 'maxUsers';
    title: string;
    min: number;
    max: number;
    used: (client: AdminClient) => number;
    max_: (client: AdminClient) => number;
    usedNote: (client: AdminClient) => string;
    over: (client: AdminClient, value: number) => string;
    less: string;
    more: string;
    aria: (client: AdminClient) => string;
}> = {
    lines: {
        field: 'maxLines',
        title: 'Máximo de líneas',
        min: 1,
        max: 50,
        used: (client) => client.lines.active,
        max_: (client) => client.lines.max,
        usedNote: (client) => `conectadas: ${client.lines.active}`,
        over: (client, value) => `Tiene ${client.lines.active} líneas conectadas. Bajar a ${value} no desconecta ninguna: las ${client.lines.active} siguen funcionando, solo no podrá conectar otra.`,
        less: 'Una menos',
        more: 'Una más',
        aria: (client) => `Cambiar el máximo de líneas de ${client.name}`,
    },
    users: {
        field: 'maxUsers',
        title: 'Máximo de usuarios',
        min: 1,
        max: 200,
        used: (client) => client.users.active + client.users.pending,
        max_: (client) => client.users.max,
        usedNote: (client) => `${client.users.active} ${plural(client.users.active, 'activo', 'activos')}`
            + (client.users.pending > 0 ? ` · ${client.users.pending} ${plural(client.users.pending, 'invitación', 'invitaciones')}` : ''),
        over: () => 'Bajar por debajo de lo que usa no desactiva a nadie ni anula invitaciones: solo no podrá invitar.',
        less: 'Uno menos',
        more: 'Uno más',
        aria: (client) => `Cambiar el máximo de usuarios de ${client.name}`,
    },
};

const StepButton = ({ label, onClick, disabled, children }: {
    label: string; onClick: () => void; disabled: boolean; children: React.ReactNode;
}) => (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled}
        className="w-9 h-full flex items-center justify-center text-brand-gray-600 hover:bg-brand-bg
            disabled:text-brand-subtle disabled:cursor-not-allowed cursor-pointer">
        {children}
    </button>
);

/** El panel para cambiar el máximo, avisando si queda por debajo de lo que usa. */
const LimitEditor = ({ client, kind, close }: { client: AdminClient; kind: LimitKind; close: () => void }) => {
    const limit = LIMITS[kind];
    const [value, setValue] = useState(limit.max_(client));
    const update = useUpdateAccountLimits();
    const used = limit.used(client);
    const clamp = (next: number) => Math.min(limit.max, Math.max(limit.min, next));

    const save = () => update.mutate({ accountId: client.accountId!, [limit.field]: value }, { onSuccess: close });

    return (
        <div className="grid gap-3">
            <p className="text-sm font-bold text-brand-text">{limit.title}</p>
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center h-[38px] overflow-hidden rounded-[8px] border-[1.5px] border-brand-accent-strong ring-[3px] ring-brand-accent-soft">
                    <StepButton label={limit.less} onClick={() => setValue(clamp(value - 1))} disabled={value <= limit.min}><Minus size={16} /></StepButton>
                    <input
                        aria-label={limit.title}
                        inputMode="numeric"
                        value={value}
                        onChange={(e) => setValue(clamp(Number(e.target.value.replace(/\D/g, '')) || limit.min))}
                        className="w-11 text-center font-mono text-[15px] font-semibold text-brand-text tabular-nums focus:outline-none"
                    />
                    <StepButton label={limit.more} onClick={() => setValue(clamp(value + 1))} disabled={value >= limit.max}><Plus size={16} /></StepButton>
                </div>
                <span className="text-[13px] text-brand-muted">
                    Entre {limit.min} y {limit.max} · en uso: <span className="font-mono text-brand-text">{used}</span>
                </span>
            </div>
            <p className="text-[12.5px] text-brand-muted">{limit.usedNote(client)}</p>
            {value < used && (
                <p className="rounded-[8px] border border-brand-border bg-brand-warning-soft px-3 py-2.5 text-[13px] leading-[1.5] text-brand-strong">
                    {limit.over(client, value)}
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
 * Las columnas «Líneas» y «Usuarios» del panel: en uso / máximo del plan, en
 * ámbar si está por encima, y el máximo se cambia en el sitio.
 */
export const LimitCell = ({ client, kind }: { client: AdminClient; kind: LimitKind }) => {
    const limit = LIMITS[kind];
    const used = limit.used(client);
    const max = limit.max_(client);
    const over = used - max;

    if (!client.accountId) return <span className="font-mono text-[13px] text-brand-subtle tabular-nums">{used} / {max}</span>;

    return (
        <Popover className="relative">
            <PopoverButton aria-label={limit.aria(client)}
                className={`-ml-2 inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border px-2 font-mono text-[13px] font-semibold
                    tabular-nums cursor-pointer transition-colors hover:border-brand-border-strong data-[open]:border-brand-accent-strong
                    ${over > 0 ? 'border-transparent bg-brand-warning-soft text-brand-warning'
                        : used === 0 ? 'border-transparent text-brand-subtle' : 'border-transparent text-brand-text'}`}>
                {used} / {max}
                <Pencil size={12} className="text-brand-subtle" />
            </PopoverButton>
            {over > 0 && <p className="mt-0.5 whitespace-nowrap text-[11.5px] font-semibold text-brand-warning">+{over} sobre el plan</p>}
            <PopoverPanel anchor={{ to: 'bottom start', gap: 8 }}
                className="z-50 w-[330px] rounded-xl border border-brand-border bg-brand-surface p-4 shadow-[0_18px_44px_rgba(14,17,22,0.16)]">
                {({ close }) => <LimitEditor client={client} kind={kind} close={close} />}
            </PopoverPanel>
        </Popover>
    );
};
