import { useNavigate } from "react-router-dom";
import { Info, Pencil, XCircle } from "lucide-react";
import { Callout } from "../../../../components/Callout/Callout";
import { ContactsPath } from "../../../../models/routes.models";
import type { ContactsNavigationState } from "../../../../models/contact.model";
import { pluralize } from "../../../../utils/campaignDisplay";
import type { CampaignWizard } from "./useCampaignWizard";
import { AudiencePanel } from "./Audience";

/**
 * Paso 1: a quién. Los números salen de la vista previa del backend, que
 * repite la selección hecha en Contactos: si desde entonces llegaron contactos
 * nuevos que coinciden, se nota aquí.
 */
export const RecipientsStep = ({ wizard }: { wizard: CampaignWizard }) => {
    const navigate = useNavigate();
    const { draft, preview, previewInput } = wizard;
    if (!draft || !previewInput) return null;

    const counts = preview?.recipients;
    const recipientsError = preview?.errors.find(e => e.field === 'recipients');
    const changedSinceSaved = counts && counts.selected !== draft.selectedCount;

    const changeSelection = () => {
        const state: ContactsNavigationState = { campaignPick: 'edit' };
        navigate(ContactsPath, { state });
    };

    return (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8">
            <div className="grid gap-[18px] content-start">
                {changedSinceSaved && (
                    <Callout icon={<Info size={16} />} title={`Antes eran ${draft.selectedCount.toLocaleString('es-EC')}; ahora son ${counts.selected.toLocaleString('es-EC')}.`}>
                        Desde que guardaste el borrador cambiaron los contactos que coinciden con la selección.
                    </Callout>
                )}

                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">Destinatarios</div>
                        <div className="mt-2 flex items-baseline gap-3">
                            <span className="font-mono text-[44px] sm:text-[52px] font-semibold tracking-[-0.03em] leading-none tabular-nums text-brand-text">
                                {counts ? counts.selected.toLocaleString('es-EC') : '—'}
                            </span>
                            <span className="text-[15px] text-brand-gray-600">contactos seleccionados</span>
                        </div>
                    </div>
                    <button type="button" onClick={changeSelection}
                        className="sm:ml-auto flex items-center justify-center gap-2 h-11 sm:h-10 px-4 rounded-[8px]
                            border border-brand-border-strong text-sm font-semibold text-brand-strong cursor-pointer
                            hover:bg-brand-bg transition-colors">
                        <Pencil size={14} />Cambiar selección
                    </button>
                </div>

                {counts && (
                    <p className="-mt-1.5 text-sm text-brand-gray-600">
                        Recibirán el mensaje:{' '}
                        <span className={`font-mono text-[15px] font-semibold ${counts.toSend === 0 ? 'text-brand-danger' : 'text-brand-text'}`}>
                            {counts.toSend.toLocaleString('es-EC')}
                        </span>
                    </p>
                )}

                {counts && counts.withoutPhone > 0 && (
                    <Callout icon={<Info size={16} />} title={`${pluralize(counts.withoutPhone, 'contacto no tiene', 'contactos no tienen')} teléfono.`}>
                        Escribieron con su nombre de usuario. Les llega igual; solo importa si una variable usa el teléfono.
                    </Callout>
                )}
                {counts && counts.duplicates > 0 && (
                    <Callout icon={<Info size={16} />} title={`${pluralize(counts.duplicates, 'contacto repetido', 'contactos repetidos')} se enviará una sola vez.`} />
                )}
                {counts && counts.notFound > 0 && (
                    <Callout icon={<Info size={16} />} title={`${pluralize(counts.notFound, 'contacto ya no existe', 'contactos ya no existen')} y no se cuenta.`} />
                )}

                {recipientsError && (
                    <Callout tone="danger" icon={<XCircle size={16} />} title="Nadie recibiría este envío">
                        {recipientsError.message}
                    </Callout>
                )}
            </div>

            <AudiencePanel input={{
                recipients: previewInput.recipients,
                excludeOptedOut: previewInput.excludeOptedOut,
                templateId: previewInput.templateId,
            }} />
        </div>
    );
};
