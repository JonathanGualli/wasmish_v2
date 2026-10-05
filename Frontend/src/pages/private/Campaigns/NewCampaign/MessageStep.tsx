import { AlertTriangle, Info, RefreshCw } from "lucide-react";
import { Callout } from "../../../../components/Callout/Callout";
import { Checkbox } from "../../../../components/Checkbox/Checkbox";
import { TemplatePicker } from "../../../../components/Chat/TemplateFields";
import { formatTimeAgo, pluralize } from "../../../../utils/campaignDisplay";
import { placeholderContext } from "../../../../utils/templatePlaceholders";
import { headerSourceNote } from "../../../../utils/templateHeader";
import type { Template } from "../../../../models/template.model";
import type { CampaignFill } from "../../../../models/campaign.model";
import { bulkDisabledReason, type CampaignWizard } from "./useCampaignWizard";
import { FillField } from "./FillField";
import { MessagePreview } from "./MessagePreview";
import { HeaderMediaField } from "../../../../components/HeaderMediaField/HeaderMediaField";

/** La sincronización más reciente: cualquier plantilla se toca en cada una. */
const lastSyncedAt = (templates: Template[]) =>
    templates.reduce<string | null>((latest, t) => (t.updatedAt && (!latest || t.updatedAt > latest) ? t.updatedAt : latest), null);

const Context = ({ before, tag, after }: { before: string; tag: string; after: string }) => (
    <>{before}<b className="font-semibold text-brand-text">{tag}</b>{after}</>
);

/**
 * Los que pidieron no recibir publicidad, con una plantilla de marketing: se
 * excluyen salvo que se desmarque. Con una de utilidad no se avisa, porque a
 * ellos también les llega.
 */
const OptOutNotice = ({ wizard }: { wizard: CampaignWizard }) => {
    const { draft, preview, update } = wizard;
    const counts = preview?.recipients;
    if (!draft || !counts || counts.optedOut === 0) return null;

    const nobodyLeft = draft.excludeOptedOut && counts.toSend === 0;
    return (
        <Callout
            tone={nobodyLeft ? 'danger' : 'warning'}
            icon={<AlertTriangle size={16} />}
            title={`${pluralize(counts.optedOut, 'contacto pidió', 'contactos pidieron')} no recibir publicidad.`}
        >
            {nobodyLeft
                ? 'Son todos los seleccionados: así nadie recibiría esta campaña. Elige una plantilla de utilidad o cambia la selección.'
                : draft.excludeOptedOut
                    ? 'No se les enviará esta plantilla de marketing.'
                    : 'WhatsApp rechazará el mensaje y quedarán como fallidos.'}
            <label className="mt-2.5 flex items-center gap-2.5 cursor-pointer">
                <Checkbox
                    checked={draft.excludeOptedOut}
                    onChange={() => update({ excludeOptedOut: !draft.excludeOptedOut })}
                    label="Excluirlos de esta campaña"
                />
                <span className="text-sm font-semibold text-brand-text">Excluirlos de esta campaña</span>
            </label>
        </Callout>
    );
};

/** Paso 2: qué plantilla y de dónde sale cada variable. */
export const MessageStep = ({ wizard }: { wizard: CampaignWizard }) => {
    const { draft, template, templates, preview, fieldError } = wizard;
    if (!draft) return null;

    const syncedAt = lastSyncedAt(templates);
    const hasFields = draft.variables.length > 0 || draft.buttons.length > 0;
    const toSend = preview?.recipients.toSend ?? 0;
    // Solo del teléfono se sabe de antemano cuántos no lo tienen: los que
    // escribieron con su nombre de usuario.
    const missingCount = (fill: CampaignFill) => (fill.source === 'phone' ? preview?.recipients.withoutPhone : undefined);

    return (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8">
            <div className="grid gap-5 content-start">
                <div className="grid gap-2">
                    <TemplatePicker
                        templates={templates}
                        selected={template}
                        onSelect={wizard.selectTemplate}
                        disabledReason={bulkDisabledReason}
                        hint={fieldError('templateId') ? undefined : 'Solo aparecen las aprobadas'}
                    />
                    {fieldError('templateId') && <p className="text-xs text-brand-danger">{fieldError('templateId')}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-brand-muted">
                        <span>¿Falta una?{syncedAt && <> Se sincronizaron <span className="font-mono">{formatTimeAgo(syncedAt)}</span>.</>}</span>
                        <button type="button" onClick={wizard.syncTemplates} disabled={wizard.isSyncing}
                            className="flex items-center gap-1.5 font-semibold text-brand-accent-strong cursor-pointer
                                disabled:text-brand-subtle disabled:cursor-wait">
                            <RefreshCw size={13} className={wizard.isSyncing ? 'animate-spin' : ''} />
                            {wizard.isSyncing ? 'Sincronizando…' : 'Sincronizar plantillas'}
                        </button>
                    </div>
                </div>

                {template && (
                    <HeaderMediaField
                        template={template}
                        override={draft.headerMedia ?? null}
                        upload={wizard.headerUpload}
                        onRevert={wizard.resetHeaderToTemplate}
                        saveAsDefault={{ checked: Boolean(draft.saveHeaderAsDefault), onToggle: wizard.toggleSaveHeaderAsDefault }}
                        error={fieldError('headerMedia')}
                    />
                )}

                {template?.category === 'MARKETING' && <OptOutNotice wizard={wizard} />}

                {template && !hasFields && (
                    <Callout icon={<Info size={16} />} title="Esta plantilla no tiene variables.">
                        {`${pluralize(toSend, 'contacto recibirá', 'contactos recibirán')} exactamente el mismo texto. No hay nada más que completar.`}
                    </Callout>
                )}

                {template && hasFields && (
                    <div className="grid gap-3">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-[13px] font-semibold text-brand-strong">Variables</span>
                            <span className="text-[12.5px] text-brand-muted">De dónde sale cada dato. Meta rechaza una variable vacía.</span>
                        </div>

                        {draft.variables.map(variable => {
                            const tag = `{{${variable.key}}}`;
                            const { before, after } = placeholderContext(template.bodyText ?? '', variable.key);
                            return (
                                <FillField
                                    key={variable.key}
                                    tag={tag}
                                    context={<Context before={before} tag={tag} after={after} />}
                                    fill={variable}
                                    onChange={fill => wizard.setVariable(variable.key, fill)}
                                    fixedLabel="Texto para todos"
                                    fallbackCount={preview?.fallbacks[variable.key]}
                                    missingCount={missingCount(variable)}
                                    error={fieldError(`variables.${variable.key}`)}
                                />
                            );
                        })}

                        {draft.buttons.map(button => {
                            const definition = template.buttons?.[button.index];
                            const prefix = definition?.url?.split('{{')[0];
                            return (
                                <FillField
                                    key={`button-${button.index}`}
                                    tag="Botón"
                                    context={prefix
                                        ? <>«{definition?.text}» → <span className="font-mono">{prefix}</span><b className="font-semibold text-brand-text">…</b></>
                                        : <>«{definition?.text}» · código a copiar</>}
                                    fill={button}
                                    onChange={fill => wizard.setButton(button.index, fill)}
                                    fixedLabel={prefix ? 'Final del enlace' : 'Código para todos'}
                                    fallbackCount={preview?.fallbacks[`button.${button.index}`]}
                                    missingCount={missingCount(button)}
                                    error={fieldError(`buttons.${button.index}`)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="lg:border-l lg:border-brand-border lg:pl-8">
                {template ? (
                    <MessagePreview
                        template={wizard.headerTemplate ?? template}
                        variables={draft.variables}
                        samples={preview?.samples ?? []}
                        fallbacks={preview?.fallbacks ?? {}}
                        headerNote={wizard.headerUpload.pending ? 'Subiendo…' : headerSourceNote(template, wizard.headerSource)}
                    />
                ) : (
                    <p className="hidden lg:block pt-10 text-center text-[13px] text-brand-subtle">
                        Elige una plantilla para ver cómo le llega a cada contacto.
                    </p>
                )}
            </div>
        </div>
    );
};
