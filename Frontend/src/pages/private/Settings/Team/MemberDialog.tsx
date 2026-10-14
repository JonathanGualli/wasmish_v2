import { useState } from "react";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { AlertCircle, Eye, UserPlus, UserCog, Zap } from "lucide-react";
import type { AssignableRole, InvitationInput, TeamMember } from "../../../../models/team.model";
import { TEAM_ERROR } from "../../../../models/team.model";
import { CustomButton } from "../../../../components/Button/Button";
import { CustomInput } from "../../../../components/Input/Input";
import { Checkbox } from "../../../../components/Checkbox/Checkbox";
import { LineSwatch } from "../../../../components/Line/LineSwatch";
import { useLines } from "../../../../hooks/useLines";
import { lineLabel, lineNumber } from "../../../../utils/lineDisplay";
import { initials } from "../../../../utils/initials";
import type { ApiError } from "../../../../utils/apiError";
import { ROLE_OPTIONS } from "./teamDisplay";

interface Props {
    /** `invite`: correo, rol y líneas. `edit`: el rol y las líneas de `member`. */
    mode: 'invite' | 'edit';
    member?: TeamMember | null;
    /** «Quedan 1 de 5 plazas en tu plan.» */
    subtitle?: string;
    isSaving: boolean;
    error: ApiError | null;
    onSubmit: (input: InvitationInput) => void;
    onClose: () => void;
}

/**
 * Invitar a alguien o cambiarle el rol y las líneas (diseño «Wasmish Equipo»,
 * marcos 2c, 2d y 2f). El admin ve todas las líneas, así que no las elige; el
 * supervisor y el agente, al menos una.
 */
export const MemberDialog = ({ mode, member = null, subtitle, isSaving, error, onSubmit, onClose }: Props) => {
    const { activeLines, colorOf } = useLines();
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<AssignableRole>(member && member.role !== 'owner' ? member.role : 'agent');
    const [lineIds, setLineIds] = useState<string[]>(member?.lineIds ?? (activeLines.length === 1 ? [activeLines[0].id] : []));

    const needsLines = role !== 'admin';
    const valid = (mode === 'edit' || email.trim().length > 0) && (!needsLines || lineIds.length > 0);
    const emailError = error?.code === TEAM_ERROR.emailTaken ? error.message : null;
    const otherError = error && !emailError ? error : null;

    const toggleLine = (id: string) =>
        setLineIds(current => (current.includes(id) ? current.filter(lineId => lineId !== id) : [...current, id]));

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid || isSaving) return;
        onSubmit({ email: email.trim(), role, lineIds: needsLines ? lineIds : [] });
    };

    return (
        <Dialog open onClose={() => !isSaving && onClose()} className="relative z-[60]">
            <DialogBackdrop className="fixed inset-0 bg-brand-ink/50" />
            <div className="fixed inset-0 overflow-y-auto">
                <div className="min-h-full flex items-center justify-center p-4">
                    <DialogPanel as="form" onSubmit={submit}
                        className="w-full max-w-[540px] bg-brand-surface border border-brand-border rounded-2xl
                            shadow-[0_18px_40px_rgba(14,17,22,0.12)] p-6 grid grid-cols-[minmax(0,1fr)] gap-[18px]">
                        <div className="flex items-start gap-3.5">
                            <div className="flex-none w-10 h-10 rounded-[10px] bg-brand-accent-soft text-brand-accent-strong flex items-center justify-center">
                                {mode === 'invite' ? <UserPlus size={18} /> : <UserCog size={18} />}
                            </div>
                            <div className="min-w-0">
                                <DialogTitle className="text-lg font-bold tracking-[-0.015em] text-brand-text">
                                    {mode === 'invite' ? 'Invitar a alguien' : 'Cambiar rol y líneas'}
                                </DialogTitle>
                                {subtitle && <p className="mt-0.5 text-[13.5px] text-brand-muted">{subtitle}</p>}
                            </div>
                        </div>

                        {mode === 'invite' ? (
                            <div className="grid gap-1.5">
                                <CustomInput label="Correo" type="email" value={email} autoFocus
                                    onChange={(e) => setEmail(e.target.value)} invalid={Boolean(emailError)} placeholder="nombre@negocio.com" />
                                {emailError && <span className="text-[13px] text-brand-danger">{emailError}</span>}
                            </div>
                        ) : member && (
                            <div className="flex items-center gap-3 rounded-[10px] bg-brand-bg px-3.5 py-3">
                                <div className="flex-none w-[34px] h-[34px] rounded-[9px] bg-brand-border text-brand-strong text-xs font-bold flex items-center justify-center">
                                    {initials(member.name)}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[14.5px] font-semibold text-brand-text truncate">{member.name}</div>
                                    <div className="text-[13px] text-brand-muted truncate">{member.email}</div>
                                </div>
                            </div>
                        )}

                        <div className="grid gap-2" role="radiogroup" aria-label="Rol">
                            <span className="text-[13px] font-semibold text-brand-strong">Rol</span>
                            {ROLE_OPTIONS.map(option => {
                                const selected = option.role === role;
                                return (
                                    <button key={option.role} type="button" role="radio" aria-checked={selected}
                                        onClick={() => setRole(option.role)}
                                        className={`flex items-start gap-3 rounded-[10px] border px-3.5 py-[11px] text-left cursor-pointer transition-colors
                                            ${selected ? 'border-brand-accent-strong bg-brand-green-50' : 'border-brand-border bg-brand-surface hover:bg-brand-bg'}`}>
                                        <span aria-hidden className={`flex-none mt-0.5 w-4 h-4 rounded-full bg-brand-surface box-border
                                            ${selected ? 'border-[5px] border-brand-accent-strong' : 'border-[1.5px] border-brand-subtle'}`} />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold text-brand-text">{option.label}</span>
                                            <span className="mt-0.5 block text-[13px] leading-[1.45] text-brand-gray-600">{option.description}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {needsLines ? (
                            <div className="grid gap-2">
                                <div className="flex flex-wrap items-baseline gap-x-2">
                                    <span className="text-[13px] font-semibold text-brand-strong">Líneas</span>
                                    <span className="text-[12.5px] text-brand-muted">Al menos una. Solo verá las conversaciones de estas.</span>
                                </div>
                                <div className="rounded-[10px] border border-brand-border overflow-hidden divide-y divide-brand-raised">
                                    {activeLines.map(line => (
                                        <div key={line.id} onClick={() => toggleLine(line.id)}
                                            className="flex items-center gap-3 bg-brand-surface px-3.5 py-[11px] cursor-pointer hover:bg-brand-bg">
                                            <Checkbox checked={lineIds.includes(line.id)} onChange={() => toggleLine(line.id)} label={lineLabel(line)} />
                                            <LineSwatch colorClass={colorOf(line.id)} size="sm" />
                                            <span className="min-w-0 truncate text-[13.5px] font-semibold text-brand-strong">{lineLabel(line)}</span>
                                            <span className="ml-auto font-mono text-[12.5px] text-brand-muted">{lineNumber(line)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2.5 rounded-[10px] bg-brand-bg px-3.5 py-[11px] text-[13.5px] text-brand-strong">
                                <Eye size={16} className="flex-none text-brand-muted" />
                                Verá todas las líneas, también las que se conecten después.
                            </div>
                        )}

                        {mode === 'edit' && (
                            <div className="flex items-center gap-2.5 text-[13.5px] text-brand-gray-600">
                                <Zap size={15} className="flex-none text-brand-accent-strong" />
                                Se aplica al momento en sus pestañas abiertas.
                            </div>
                        )}

                        {otherError && (
                            <div role="alert" className={`flex items-start gap-2 text-[13px] ${otherError.code === TEAM_ERROR.busy ? 'text-brand-warning' : 'text-brand-danger'}`}>
                                <AlertCircle size={15} className="flex-none mt-px" />
                                <span>{otherError.message}</span>
                            </div>
                        )}

                        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
                            {mode === 'invite' && <span className="sm:mr-auto text-[12.5px] text-brand-muted">Caduca a los 7 días.</span>}
                            <div className="h-10 sm:ml-auto"><CustomButton variant="outline" type="button" onClick={onClose} disabled={isSaving}>Cancelar</CustomButton></div>
                            <div className="h-10">
                                <CustomButton type="submit" isLoading={isSaving} disabled={!valid}>
                                    {mode === 'invite' ? 'Crear invitación' : 'Guardar'}
                                </CustomButton>
                            </div>
                        </div>
                    </DialogPanel>
                </div>
            </div>
        </Dialog>
    );
};
