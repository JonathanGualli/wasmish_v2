import { useNavigate } from "react-router-dom";
import { Check, Download, Send } from "lucide-react";
import { CustomButton } from "../../../../components/Button/Button";
import { MetricGrid } from "../../../../components/MetricGrid/MetricGrid";
import { TagChip } from "../../../../components/Tag/TagChip";
import { useCampaignDraft } from "../../../../hooks/useCampaignDraft";
import { useNewCampaign } from "../../../../hooks/useNewCampaign";
import { useTags } from "../../../../hooks/useTags";
import type { ContactsNavigationState } from "../../../../models/contact.model";
import { CampaignPaths, ContactsPath } from "../../../../models/routes.models";
import { pluralize } from "../../../../utils/campaignDisplay";
import { CAMPAIGN_MAX_RECIPIENTS, newCampaignDraft } from "../../../../utils/campaignDraft";
import { findTagByName, joinTagNames } from "../../../../utils/tags";
import { DraftConflictDialog } from "../../Campaigns/DraftConflictDialog";
import type { ImportWizard } from "./useImportWizard";

/**
 * Terminado: las cifras finales y lo que se suele hacer después, mandarles una
 * campaña. Van en la campaña todos los del archivo, también los que ya
 * estaban completos: para quien importa, «estos» son la lista que acaba de subir.
 */
export const ImportResult = ({ wizard }: { wizard: ImportWizard }) => {
    const navigate = useNavigate();
    const { data: tags = [] } = useTags();
    const draftStore = useCampaignDraft();
    const newCampaign = useNewCampaign(draftStore);
    const { run, preview, downloadErrorRows } = wizard;

    const contactIds = run.contactIds;
    const errors = preview.data?.summary.errors ?? 0;
    const extraTagNames = preview.variables?.extraTagNames ?? [];
    const tooMany = contactIds.length > CAMPAIGN_MAX_RECIPIENTS;

    const createCampaign = () => newCampaign.start(() => {
        draftStore.save(newCampaignDraft({ mode: 'ids', contactIds }, contactIds.length));
        navigate(CampaignPaths.create);
    });

    // Con etiquetas para todos, la lista sale filtrada por ellas: son los que se acaban de importar.
    const viewContacts = () => {
        const tagIds = extraTagNames.map(name => findTagByName(tags, name)?.id).filter((id): id is string => Boolean(id));
        const state: ContactsNavigationState = tagIds.length > 0 ? { tagIds } : {};
        navigate(ContactsPath, { state });
    };

    return (
        <div className="max-w-[600px] mx-auto py-6 sm:py-12 grid gap-6">
            <div className="flex items-center gap-3.5">
                <span className="w-11 h-11 flex-none rounded-full bg-brand-accent-soft text-brand-accent-strong flex items-center justify-center">
                    <Check size={22} strokeWidth={2.8} />
                </span>
                <div className="min-w-0">
                    <h2 className="text-[22px] font-bold tracking-[-0.02em] text-brand-text">Importación terminada</h2>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-brand-gray-600">
                        {extraTagNames.length > 0 ? (
                            <>
                                {extraTagNames.length === 1 ? 'Todos llevan la etiqueta' : 'Todos llevan las etiquetas'}
                                {extraTagNames.map(name => <TagChip key={name} name={name} />)}
                            </>
                        ) : (
                            `${pluralize(contactIds.length, 'contacto del archivo está', 'contactos del archivo están')} en Wasmish.`
                        )}
                    </div>
                </div>
            </div>

            <MetricGrid
                columns="grid-cols-2 sm:grid-cols-4"
                metrics={[
                    { label: 'Creados', value: run.created, note: 'nuevos en Wasmish', tone: run.created > 0 ? 'success' : undefined },
                    { label: 'Completados', value: run.updated, note: 'con lo que les faltaba' },
                    { label: 'Sin cambios', value: run.unchanged, note: 'ya lo tenían todo' },
                    { label: 'Con error', value: errors, note: 'no entraron', tone: errors > 0 ? 'danger' : undefined },
                ]}
            />

            <div className="grid gap-2">
                <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="h-11">
                        <CustomButton onClick={createCampaign} disabled={tooMany || contactIds.length === 0}>
                            <Send size={16} />Crear campaña con {contactIds.length === 1 ? 'este' : `estos ${contactIds.length.toLocaleString('es-EC')}`}
                        </CustomButton>
                    </div>
                    <div className="h-11">
                        <CustomButton variant="outline" onClick={viewContacts}>Ver en Contactos</CustomButton>
                    </div>
                </div>
                {tooMany && (
                    <p className="text-[13px] leading-normal text-brand-gray-600">
                        Una campaña admite hasta <span className="font-mono">{CAMPAIGN_MAX_RECIPIENTS.toLocaleString('es-EC')}</span> contactos
                        y el archivo tiene <span className="font-mono">{contactIds.length.toLocaleString('es-EC')}</span>. Elígelos por partes
                        desde Contactos{extraTagNames.length > 0 && <>, filtrando por {extraTagNames.length === 1 ? 'la etiqueta' : 'las etiquetas'} {joinTagNames(extraTagNames)}</>}.
                    </p>
                )}
            </div>

            {errors > 0 && (
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-brand-raised pt-4 text-[13px] text-brand-gray-600">
                    <span>{errors === 1 ? '1 fila no entró.' : `${errors.toLocaleString('es-EC')} filas no entraron.`}</span>
                    <button type="button" onClick={downloadErrorRows}
                        className="flex items-center gap-1.5 font-semibold text-brand-accent-strong cursor-pointer hover:underline">
                        <Download size={14} />Descargar filas con error
                    </button>
                </div>
            )}

            <DraftConflictDialog {...newCampaign.conflictDialog} />
        </div>
    );
};
