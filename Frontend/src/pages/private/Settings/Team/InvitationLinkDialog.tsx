import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { AlertTriangle, Check, Copy, Link2 } from "lucide-react";
import type { TeamInvitation } from "../../../../models/team.model";
import { CustomButton } from "../../../../components/Button/Button";
import { Callout } from "../../../../components/Callout/Callout";
import { LineSwatch } from "../../../../components/Line/LineSwatch";
import { useLines } from "../../../../hooks/useLines";
import { useCopyToClipboard } from "../../../../hooks/useCopyToClipboard";
import { formatLineDate, lineLabel } from "../../../../utils/lineDisplay";
import { ROLE_LABEL } from "../../../../utils/roleDisplay";
import { invitationUrl } from "./teamDisplay";

/**
 * La invitación recién creada (diseño: marco 2e): el enlace se enseña UNA vez,
 * como una API key nueva. Wasmish no manda correos: lo manda quien invita.
 */
export const InvitationLinkDialog = ({ invitation, token, onClose }: {
    invitation: TeamInvitation;
    token: string;
    onClose: () => void;
}) => {
    const { lineById, colorOf } = useLines();
    const { copied, copy } = useCopyToClipboard(2000);
    const url = invitationUrl(token);
    const lines = invitation.lineIds.map(id => lineById(id)).filter(line => line !== undefined);

    return (
        <Dialog open onClose={onClose} className="relative z-[60]">
            <DialogBackdrop className="fixed inset-0 bg-brand-ink/50" />
            <div className="fixed inset-0 flex items-center justify-center p-4">
                <DialogPanel className="w-full max-w-[540px] bg-brand-surface border border-brand-border rounded-2xl
                    shadow-[0_18px_40px_rgba(14,17,22,0.12)] p-6 grid grid-cols-[minmax(0,1fr)] gap-4">
                    <div className="flex items-start gap-3.5">
                        <div className="flex-none w-10 h-10 rounded-[10px] bg-brand-accent-soft text-brand-accent-strong flex items-center justify-center">
                            <Link2 size={18} />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-lg font-bold tracking-[-0.015em] text-brand-text">Invitación creada</DialogTitle>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] text-brand-muted">
                                <span className="text-brand-strong break-all">{invitation.email}</span>
                                <span>· {ROLE_LABEL[invitation.role]}</span>
                                {lines.map(line => (
                                    <span key={line.id} className="inline-flex items-center gap-1.5 font-semibold text-brand-strong">
                                        <LineSwatch colorClass={colorOf(line.id)} size="sm" />{lineLabel(line)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-[10px] border border-brand-border-strong bg-brand-bg py-1.5 pl-3.5 pr-1.5">
                        <span className="flex-1 min-w-0 font-mono text-[13px] text-brand-text break-all">{url}</span>
                        <div className="flex-none h-9">
                            <CustomButton variant="secondary" onClick={() => copy(url)}>
                                {copied ? <><Check size={15} />Copiado</> : <><Copy size={15} />Copiar</>}
                            </CustomButton>
                        </div>
                    </div>

                    <Callout tone="warning" icon={<AlertTriangle size={16} />} title="Copia el enlace ahora: no se volverá a mostrar.">
                        Wasmish no envía correos; mándaselo por WhatsApp, correo o donde quieras. Si se pierde, vuelve a invitar el mismo correo.
                    </Callout>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] text-brand-muted">Caduca el {formatLineDate(invitation.expiresAt)}, en 7 días.</span>
                        <div className="ml-auto h-10"><CustomButton variant="outline" onClick={onClose}>Listo</CustomButton></div>
                    </div>
                </DialogPanel>
            </div>
        </Dialog>
    );
};
