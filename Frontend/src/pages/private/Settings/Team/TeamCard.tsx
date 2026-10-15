import { useState, type ReactNode } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { AlertCircle, CheckCircle2, MoreHorizontal, UserMinus, UserPlus, X } from "lucide-react";
import type { InvitationInput, TeamInvitation, TeamMember } from "../../../../models/team.model";
import { TEAM_ERROR } from "../../../../models/team.model";
import { CustomButton } from "../../../../components/Button/Button";
import { Callout } from "../../../../components/Callout/Callout";
import { ConfirmDialog } from "../../../../components/Dialog/ConfirmDialog";
import { LineSwatch } from "../../../../components/Line/LineSwatch";
import { useAuthContext } from "../../../../context/auth.context";
import { useLines } from "../../../../hooks/useLines";
import { useTeam } from "../../../../hooks/useTeam";
import { apiErrorOf, type ApiError } from "../../../../utils/apiError";
import { initials } from "../../../../utils/initials";
import { lineLabel } from "../../../../utils/lineDisplay";
import { ROLE_LABEL } from "../../../../utils/roleDisplay";
import { SettingsCard } from "../SettingsCard";
import { MemberDialog } from "./MemberDialog";
import { InvitationLinkDialog } from "./InvitationLinkDialog";
import { expiryText, invitedText, userLimitText, usersText } from "./teamDisplay";
import { useDelayedLoading } from "../../../../hooks/useDelayedLoading";
import { SettingsListSkeleton } from "../SettingsListSkeleton";
import { AVATAR_SM } from "../../../../components/Skeleton/SkeletonListRow";

type DialogState =
    | { kind: 'invite' }
    | { kind: 'edit'; member: TeamMember }
    | { kind: 'link'; invitation: TeamInvitation; token: string }
    | { kind: 'deactivate'; member: TeamMember }
    | null;

// Persona · Rol · Líneas · Estado · menú (diseño «Wasmish Equipo», marco 2b).
const ROW_GRID = 'sm:grid sm:grid-cols-[minmax(0,1.7fr)_116px_minmax(0,1.3fr)_112px_32px] sm:gap-4 sm:items-center';

const MenuEntry = ({ onClick, danger = false, disabled = false, hint, children }: {
    onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string; children: ReactNode;
}) => (
    <MenuItem disabled={disabled}>
        <button type="button" onClick={onClick} disabled={disabled}
            className="w-full text-left grid gap-px rounded-[8px] px-3 py-2.5 max-sm:min-h-12 cursor-pointer
                data-[focus]:bg-brand-bg disabled:cursor-not-allowed">
            <span className={`text-sm ${danger ? 'font-semibold text-brand-danger' : disabled ? 'font-medium text-brand-subtle' : 'font-medium text-brand-text'}`}>
                {children}
            </span>
            {hint && <span className="text-xs leading-[1.45] text-brand-muted">{hint}</span>}
        </button>
    </MenuItem>
);

const RowMenu = ({ label, children }: { label: string; children: ReactNode }) => (
    <Menu>
        {({ open }) => (
            <>
                <MenuButton aria-label={label}
                    className={`w-8 h-8 max-sm:w-11 max-sm:h-11 rounded-[8px] flex items-center justify-center text-brand-gray-600
                        hover:bg-brand-bg transition-colors cursor-pointer ${open ? 'bg-brand-bg' : ''}`}>
                    <MoreHorizontal size={16} />
                </MenuButton>
                {open && <div aria-hidden className="sm:hidden fixed inset-0 z-40 bg-brand-ink/50" />}
                <MenuItems
                    className="absolute z-50 right-[18px] top-[52px] w-[280px] rounded-xl border border-brand-border bg-brand-surface p-1.5
                        shadow-[0_18px_44px_rgba(14,17,22,0.16)] focus:outline-none
                        max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full
                        max-sm:rounded-b-none max-sm:rounded-t-[20px] max-sm:px-4 max-sm:pt-4 max-sm:pb-7">
                    {children}
                </MenuItems>
            </>
        )}
    </Menu>
);

/** Las líneas de una persona o invitación: con color, o «Todas las líneas» para owner y admin. */
const LinesList = ({ role, lineIds, muted = false }: { role: string; lineIds: string[]; muted?: boolean }) => {
    const { lineById, colorOf } = useLines();
    if (role === 'owner' || role === 'admin') return <span className="text-[13px] text-brand-gray-600">Todas las líneas</span>;
    const lines = lineIds.map(id => lineById(id)).filter(line => line !== undefined);
    if (lines.length === 0) return <span className="text-[13px] text-brand-subtle">Sin líneas</span>;
    return (
        <span className="flex flex-wrap gap-x-3.5 gap-y-1.5 min-w-0">
            {lines.map(line => (
                <span key={line.id} className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${muted ? 'text-brand-muted' : 'text-brand-strong'}`}>
                    <LineSwatch colorClass={colorOf(line.id)} size="sm" />{lineLabel(line)}
                </span>
            ))}
        </span>
    );
};

/**
 * Ajustes → Equipo (Fase 3; diseño «Wasmish Equipo - Usuarios, roles y
 * acceso», marcos 2a a 2i): quién entra a la cuenta, con qué rol y a qué
 * líneas, las invitaciones pendientes y las plazas del plan. Solo para owner
 * y admin (`team.manage`).
 */
export const TeamCard = () => {
    const { user } = useAuthContext();
    const { lineById } = useLines();
    const team = useTeam();
    const loading = useDelayedLoading(team.isLoading);
    const [dialog, setDialog] = useState<DialogState>(null);
    const [done, setDone] = useState<{ title: string; body?: string } | null>(null);
    const [failure, setFailure] = useState<{ error: ApiError; retry: () => void } | null>(null);

    const { members, invitations, maxUsers, seatsUsed } = team;
    const activeCount = members.filter(member => member.status === 'active').length;
    const full = seatsUsed >= maxUsers;
    const canManage = (member: TeamMember) =>
        member.role !== 'owner' && member.id !== user?.id;

    const linesNames = (role: string, lineIds: string[]) => (role === 'admin'
        ? 'todas las líneas'
        : lineIds.map(id => lineById(id)).filter(line => line !== undefined).map(lineLabel).join(', '));

    const run = (action: () => void) => {
        setFailure(null);
        setDone(null);
        action();
    };

    const reportFailure = (error: unknown, retry: () => void) => setFailure({ error: apiErrorOf(error), retry });

    const submitInvite = (input: InvitationInput) => run(() => team.invite.mutate(input, {
        onSuccess: ({ invitation, token }) => setDialog({ kind: 'link', invitation, token }),
    }));

    const reinvite = (invitation: TeamInvitation) => run(() => team.invite.mutate(
        { email: invitation.email, role: invitation.role, lineIds: invitation.lineIds },
        {
            onSuccess: ({ invitation: renewed, token }) => setDialog({ kind: 'link', invitation: renewed, token }),
            onError: (error) => reportFailure(error, () => reinvite(invitation)),
        },
    ));

    const revoke = (invitation: TeamInvitation) => run(() => team.revokeInvitation.mutate(invitation.id, {
        onSuccess: () => setDone({ title: `Invitación de ${invitation.email} anulada.`, body: 'Su plaza quedó libre.' }),
        onError: (error) => reportFailure(error, () => revoke(invitation)),
    }));

    const submitEdit = (member: TeamMember, input: InvitationInput) => run(() => team.updateMember.mutate(
        { id: member.id, change: { role: input.role, lineIds: input.lineIds } },
        {
            onSuccess: () => {
                setDialog(null);
                setDone({
                    title: `Rol de ${member.name} actualizado.`,
                    body: `Ya ve ${linesNames(input.role, input.lineIds)}, también en sus pestañas abiertas.`,
                });
            },
        },
    ));

    const setStatus = (member: TeamMember, status: 'active' | 'inactive') => run(() => team.updateMember.mutate(
        { id: member.id, change: { status } },
        {
            onSuccess: () => {
                setDialog(null);
                setDone(status === 'inactive'
                    ? { title: `${member.name} ya no entra a Wasmish.`, body: 'Sus mensajes y conversaciones se quedan.' }
                    : { title: `${member.name} vuelve a entrar a Wasmish.` });
            },
            onError: (error) => {
                if (status === 'active') reportFailure(error, () => setStatus(member, status));
            },
        },
    ));

    const dialogError = (mutation: { isError: boolean; error: unknown }) => (mutation.isError ? apiErrorOf(mutation.error) : null);
    const freeSeats = Math.max(maxUsers - seatsUsed, 0);

    return (
        <SettingsCard>
            <div className="grid gap-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-[17px] font-bold tracking-[-0.01em] text-brand-text">Equipo</h2>
                        <p className="mt-1 max-w-[560px] text-sm leading-[1.5] text-brand-muted">
                            Las personas que entran a esta cuenta. Todas ven todos los contactos; las conversaciones, solo las de sus líneas.
                        </p>
                    </div>
                    {!loading.pending && (
                        <div className="flex-none grid justify-items-end gap-1">
                            <span className={`rounded-full px-3 py-1.5 font-mono text-[12.5px] font-semibold tabular-nums
                                ${full && maxUsers > 1 ? 'bg-brand-warning-soft text-brand-warning' : 'bg-brand-bg text-brand-strong'}`}>
                                {seatsUsed} de {usersText(maxUsers)}
                            </span>
                            {!loading.pending && invitations.length > 0 && (
                                <span className="text-xs text-brand-muted">
                                    {activeCount} {activeCount === 1 ? 'activo' : 'activos'} · {invitations.length} {invitations.length === 1 ? 'invitación' : 'invitaciones'}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {done && (
                    <Callout tone="info" icon={<CheckCircle2 size={16} />} title={done.title}
                        action={
                            <button type="button" onClick={() => setDone(null)} aria-label="Cerrar el aviso"
                                className="flex text-brand-subtle hover:text-brand-gray-600 cursor-pointer"><X size={14} /></button>
                        }>
                        {done.body}
                    </Callout>
                )}
                {failure && (
                    <Callout tone={failure.error.code === TEAM_ERROR.busy ? 'warning' : 'danger'} icon={<AlertCircle size={16} />}
                        action={
                            <div className="flex items-center gap-3">
                                {failure.error.code === TEAM_ERROR.busy && (
                                    <button type="button" onClick={failure.retry}
                                        className="text-[13px] font-semibold text-brand-accent-strong cursor-pointer">Reintentar</button>
                                )}
                                <button type="button" onClick={() => setFailure(null)} aria-label="Cerrar el aviso"
                                    className="flex text-brand-subtle hover:text-brand-gray-600 cursor-pointer"><X size={14} /></button>
                            </div>
                        }>
                        {failure.error.message}
                    </Callout>
                )}

                {loading.pending && (
                    <SettingsListSkeleton label="Cargando el equipo" visible={loading.visible} rows={4}
                        avatar={AVATAR_SM} rowClassName="px-[18px] py-[13px] max-sm:px-3.5" />
                )}
                {team.isError && (
                    <p className="text-sm text-brand-danger">
                        No se pudo cargar el equipo.{' '}
                        <button type="button" onClick={team.refresh} className="font-semibold text-brand-accent-strong cursor-pointer">Reintentar</button>
                    </p>
                )}

                {!loading.pending && members.length > 0 && (
                    <div className="rounded-[10px] border border-brand-border divide-y divide-brand-raised max-sm:[&>*:nth-child(2)]:border-t-0">
                        <div className={`hidden ${ROW_GRID} rounded-t-[10px] bg-brand-bg px-[18px] py-[9px]
                            text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted`}>
                            <span>Persona</span><span>Rol</span><span>Líneas</span><span>Estado</span><span />
                        </div>
                        {members.map(member => {
                            const you = member.id === user?.id;
                            const off = member.status === 'inactive';
                            return (
                                <div key={member.id} className={`relative ${ROW_GRID} flex flex-col gap-2.5 bg-brand-surface px-[18px] py-[13px]
                                    max-sm:px-3.5 last:rounded-b-[10px]`}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`flex-none w-[34px] h-[34px] rounded-[9px] text-xs font-bold flex items-center justify-center
                                            ${you ? 'bg-brand-accent text-brand-ink' : off ? 'bg-brand-bg text-brand-subtle' : 'bg-brand-border text-brand-strong'}`}>
                                            {initials(member.name)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[14.5px] font-semibold truncate ${off ? 'text-brand-muted' : 'text-brand-text'}`}>{member.name}</span>
                                                {you && (
                                                    <span className="flex-none rounded-full bg-brand-accent-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-brand-accent-strong">Tú</span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 text-[13px] text-brand-muted truncate">{member.email}</div>
                                        </div>
                                    </div>
                                    <div className="flex">
                                        {member.role === 'owner' ? (
                                            <span className="rounded-full bg-brand-deep px-2.5 py-[3px] text-[11px] font-bold uppercase tracking-[0.05em] text-white">Owner</span>
                                        ) : (
                                            <span className={`text-sm font-medium ${off ? 'text-brand-muted' : 'text-brand-strong'}`}>{ROLE_LABEL[member.role]}</span>
                                        )}
                                    </div>
                                    <LinesList role={member.role} lineIds={member.lineIds} muted={off} />
                                    <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${off ? 'text-brand-muted' : 'text-brand-accent-strong'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${off ? 'bg-brand-border-strong' : 'bg-brand-success'}`} />
                                        {off ? 'Desactivada' : 'Activa'}
                                    </span>
                                    <div className="max-sm:absolute max-sm:right-2 max-sm:top-2">
                                        {canManage(member) && (
                                            <RowMenu label={`Acciones de ${member.name}`}>
                                                {off && (
                                                    <MenuEntry onClick={() => setStatus(member, 'active')} disabled={full}
                                                        hint={full ? userLimitText(maxUsers) : `Ocupa una plaza: quedarías en ${seatsUsed + 1} de ${maxUsers}.`}>
                                                        Reactivar
                                                    </MenuEntry>
                                                )}
                                                <MenuEntry onClick={() => { team.updateMember.reset(); setDialog({ kind: 'edit', member }); }}
                                                    hint={off ? undefined : 'Se aplica al momento en sus pestañas abiertas.'}>
                                                    Cambiar rol y líneas…
                                                </MenuEntry>
                                                {!off && (
                                                    <>
                                                        <div className="my-1 border-t border-brand-raised" />
                                                        <MenuEntry onClick={() => { team.updateMember.reset(); setDialog({ kind: 'deactivate', member }); }} danger>
                                                            Desactivar…
                                                        </MenuEntry>
                                                    </>
                                                )}
                                            </RowMenu>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!loading.pending && invitations.length > 0 && (
                    <div className="grid gap-2.5">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand-strong">
                            Invitaciones pendientes
                            <span className="font-mono text-xs font-medium text-brand-muted">{invitations.length}</span>
                            <span className="sm:ml-auto text-[12.5px] font-medium text-brand-muted">Ocupan plaza hasta que se aceptan, anulan o caducan</span>
                        </div>
                        <div className="rounded-[10px] border border-dashed border-brand-border-strong divide-y divide-brand-raised">
                            {invitations.map(invitation => {
                                const expiry = expiryText(invitation.expiresAt);
                                return (
                                    <div key={invitation.id} className={`relative ${ROW_GRID} flex flex-col gap-2.5 px-[18px] py-[13px] max-sm:px-3.5`}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="flex-none w-[34px] h-[34px] rounded-[9px] border-[1.5px] border-dashed border-brand-subtle
                                                text-brand-muted flex items-center justify-center">
                                                <UserPlus size={15} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[14.5px] font-semibold text-brand-strong truncate">{invitation.email}</div>
                                                <div className="mt-0.5 text-[13px] text-brand-muted">{invitedText(invitation)}</div>
                                            </div>
                                        </div>
                                        <span className="text-sm font-medium text-brand-strong">{ROLE_LABEL[invitation.role]}</span>
                                        <LinesList role={invitation.role} lineIds={invitation.lineIds} />
                                        <span className={`text-[12.5px] font-semibold ${expiry.soon ? 'text-brand-warning' : 'text-brand-gray-600'}`}>{expiry.text}</span>
                                        <div className="max-sm:absolute max-sm:right-2 max-sm:top-2">
                                            <RowMenu label={`Acciones de la invitación de ${invitation.email}`}>
                                                <MenuEntry onClick={() => reinvite(invitation)} hint="Crea un enlace nuevo. El anterior deja de valer.">
                                                    Volver a invitar
                                                </MenuEntry>
                                                <div className="my-1 border-t border-brand-raised" />
                                                <MenuEntry onClick={() => revoke(invitation)} danger hint="Libera su plaza.">
                                                    Anular invitación
                                                </MenuEntry>
                                            </RowMenu>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {!loading.pending && !team.isError && (
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="h-10 w-full sm:w-auto max-sm:h-12">
                            <CustomButton disabled={full} onClick={() => { team.invite.reset(); setDialog({ kind: 'invite' }); }}>
                                <UserPlus size={16} />Invitar a alguien
                            </CustomButton>
                        </div>
                        <p className={`flex-1 min-w-[260px] text-[13px] leading-[1.55] ${full ? 'text-brand-strong' : 'text-brand-muted'}`}>
                            {!full
                                ? 'Wasmish no envía correos: al invitar te damos un enlace para que se lo mandes tú. Caduca a los 7 días.'
                                : maxUsers === 1
                                    ? 'Tu plan permite 1 usuario. Pide más usuarios para invitar a tu equipo.'
                                    : userLimitText(maxUsers)}
                        </p>
                    </div>
                )}
            </div>

            {dialog?.kind === 'invite' && (
                <MemberDialog mode="invite" subtitle={`Quedan ${freeSeats} de ${maxUsers} plazas en tu plan.`}
                    isSaving={team.invite.isPending} error={dialogError(team.invite)}
                    onSubmit={submitInvite} onClose={() => setDialog(null)} />
            )}
            {dialog?.kind === 'edit' && (
                <MemberDialog mode="edit" member={dialog.member}
                    isSaving={team.updateMember.isPending} error={dialogError(team.updateMember)}
                    onSubmit={(input) => submitEdit(dialog.member, input)} onClose={() => setDialog(null)} />
            )}
            {dialog?.kind === 'link' && (
                <InvitationLinkDialog invitation={dialog.invitation} token={dialog.token} onClose={() => setDialog(null)} />
            )}
            <ConfirmDialog
                open={dialog?.kind === 'deactivate'}
                tone="danger"
                icon={<UserMinus size={18} />}
                title={dialog?.kind === 'deactivate' ? `Desactivar a ${dialog.member.name}` : ''}
                description="Dejará de entrar a Wasmish en el momento. Sus mensajes y conversaciones se quedan."
                confirmLabel="Desactivar"
                isLoading={team.updateMember.isPending}
                onConfirm={() => dialog?.kind === 'deactivate' && setStatus(dialog.member, 'inactive')}
                onCancel={() => setDialog(null)}
            >
                <div className="rounded-[10px] bg-brand-bg px-3.5 py-[11px] text-[13.5px] text-brand-strong">
                    Libera su plaza: quedarás en {Math.max(seatsUsed - 1, 0)} de {usersText(maxUsers)}. Puedes reactivarlo después.
                </div>
                {dialog?.kind === 'deactivate' && team.updateMember.isError && (
                    <p role="alert" className="text-[13px] text-brand-danger">{apiErrorOf(team.updateMember.error).message}</p>
                )}
            </ConfirmDialog>
        </SettingsCard>
    );
};
