import { CircleDollarSign, FlaskConical, Info } from "lucide-react";
import { AuthField } from "../../../../components/Auth/AuthField";
import { Callout } from "../../../../components/Callout/Callout";
import { CategoryPill } from "../../../../components/Chat/TemplateFields";
import type { CampaignFill } from "../../../../models/campaign.model";
import { VARIABLE_SOURCE_LABEL, pluralize } from "../../../../utils/campaignDisplay";
import type { CampaignWizard } from "./useCampaignWizard";
import { MessagePreview } from "./MessagePreview";

/** «"herramientas" para todos» o «Nombre del contacto, o "cliente"». */
const describeFill = (fill: CampaignFill) =>
    fill.source === 'fixed'
        ? `«${fill.value?.trim()}» para todos`
        : `${VARIABLE_SOURCE_LABEL[fill.source]}, o «${fill.fallback?.trim()}»`;

const SummaryRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <>
        <dt className="text-sm text-brand-muted">{label}</dt>
        <dd className="text-sm text-brand-strong min-w-0">{children}</dd>
    </>
);

/** Paso 3: el nombre de la campaña y lo que se va a mandar, antes de mandarlo. */
export const ReviewStep = ({ wizard }: { wizard: CampaignWizard }) => {
    const { draft, template, preview, update, fieldError } = wizard;
    if (!draft || !template || !preview) return null;

    const { recipients } = preview;
    const isMarketing = template.category === 'MARKETING';

    return (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8">
            <div className="grid gap-6 content-start">
                <AuthField
                    label="Nombre de la campaña"
                    value={draft.name}
                    onChange={e => update({ name: e.target.value })}
                    maxLength={80}
                    error={fieldError('name')}
                    hint="Solo lo ves tú, en «Campañas». Los contactos no lo reciben."
                />

                <dl className="grid grid-cols-[110px_minmax(0,1fr)] sm:grid-cols-[130px_minmax(0,1fr)] gap-x-4 gap-y-3.5
                    items-baseline border-t border-brand-border pt-5">
                    <SummaryRow label="Plantilla">
                        <span className="inline-flex flex-wrap items-center gap-2">
                            <span className="font-mono font-semibold text-brand-text">{template.name}</span>
                            <CategoryPill category={template.category} />
                        </span>
                    </SummaryRow>
                    <SummaryRow label="Destinatarios">
                        <span className="font-mono text-[22px] font-semibold tabular-nums text-brand-text">
                            {recipients.toSend.toLocaleString('es-EC')}
                        </span>
                        {recipients.excludedOptedOut > 0 && (
                            <span className="text-[13px] text-brand-muted">
                                {' · '}{pluralize(recipients.selected, 'seleccionado', 'seleccionados')},{' '}
                                {pluralize(recipients.excludedOptedOut, 'excluido', 'excluidos')} por baja de publicidad
                            </span>
                        )}
                        {isMarketing && !draft.excludeOptedOut && recipients.optedOut > 0 && (
                            <span className="text-[13px] text-brand-warning">
                                {' · '}{pluralize(recipients.optedOut, 'pidió', 'pidieron')} no recibir publicidad: WhatsApp los rechazará
                            </span>
                        )}
                    </SummaryRow>
                    {draft.variables.length + draft.buttons.length > 0 && (
                        <SummaryRow label="Variables">
                            <ul className="grid gap-1 leading-[1.6]">
                                {draft.variables.map(v => (
                                    <li key={v.key}><span className="font-mono text-[12.5px]">{`{{${v.key}}}`}</span> {describeFill(v)}</li>
                                ))}
                                {draft.buttons.map(b => (
                                    <li key={b.index}>Botón «{template.buttons?.[b.index]?.text}»: {describeFill(b)}</li>
                                ))}
                            </ul>
                        </SummaryRow>
                    )}
                </dl>

                {preview.dryRun && (
                    <Callout icon={<FlaskConical size={16} />} title="Modo de prueba: esta campaña no llegará a WhatsApp.">
                        El servidor tiene <span className="font-mono">CAMPAIGN_DRY_RUN</span> encendido y no llama a Meta. Sirve para
                        ver el recorrido completo, pero no comprueba la conexión de WhatsApp.
                    </Callout>
                )}

                {isMarketing ? (
                    <Callout tone="warning" icon={<CircleDollarSign size={16} />} title="WhatsApp cobra cada mensaje de marketing entregado.">
                        Lo que ya salió no se puede deshacer; mientras se envía, puedes pausar o cancelar lo que falte.
                    </Callout>
                ) : (
                    <Callout icon={<Info size={16} />} title="Lo que ya salió no se puede deshacer.">
                        Mientras se envía, puedes pausar o cancelar lo que falte.
                    </Callout>
                )}
            </div>

            <div className="lg:border-l lg:border-brand-border lg:pl-8">
                <MessagePreview
                    template={template}
                    variables={draft.variables}
                    samples={preview.samples}
                    fallbacks={preview.fallbacks}
                    selectable={false}
                />
            </div>
        </div>
    );
};
