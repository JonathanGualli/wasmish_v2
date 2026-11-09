import type { ReactNode } from "react";
import { Copy, ExternalLink, Phone, Reply } from "lucide-react";
import { Pill } from "../../../../components/Pill/Pill";
import { CategoryPill } from "../../../../components/Chat/TemplateFields";
import { ExampleHighlightLegend, TemplateBubble, TemplateButtons, type ValueHighlight } from "../../../../components/Chat/TemplatePreview";
import type { Template } from "../../../../models/template.model";
import { formatShortDate } from "../../../../utils/formatChatTime";
import { headerMediaRule } from "../../../../utils/templateHeader";
import { orderedPlaceholders } from "../../../../utils/templatePlaceholders";
import { isSendableTemplate } from "../../../../utils/templateStatus";
import {
    bodyExampleValues, languageName, templateButtonDetails, templateCategoryNote, templateQualityWords,
    templateStatusNote, templateStatusWords, templateVariables, type TemplateButtonDetail, type TemplateQualityWords,
} from "../../../../utils/templateDisplay";
import { TemplateHeaderCell } from "../TemplateHeaderCell";

/** La etiqueta de cada tarjeta: 11/600/0.1em en mayúsculas. */
export const CardLabel = ({ children }: { children: ReactNode }) => (
    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">{children}</span>
);

/** Una tarjeta con borde y su etiqueta arriba; `flush` para las que llevan filas. */
export const DetailCard = ({ label, extra, flush = false, className = '', children }: {
    label: ReactNode;
    extra?: ReactNode;
    flush?: boolean;
    className?: string;
    children: ReactNode;
}) => (
    <section className={`border border-brand-border rounded-xl min-w-0 ${flush ? 'overflow-hidden' : 'px-3.5 sm:px-[18px] pt-3.5 pb-4 grid gap-3'} ${className}`}>
        <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${flush ? 'px-3.5 sm:px-[18px] pt-3.5 pb-2.5' : ''}`}>
            <CardLabel>{label}</CardLabel>
            {extra}
        </div>
        {children}
    </section>
);

const QUALITY_DOT: Record<TemplateQualityWords['dot'], string> = {
    success: 'bg-brand-success',
    yellow: 'bg-brand-quality-medium',
    danger: 'bg-brand-danger',
    subtle: 'bg-brand-subtle',
    border: 'bg-brand-border-strong',
};

const pad = (n: number) => String(n).padStart(2, '0');
const timeOf = (iso: string) => {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const Fact = ({ label, value, note, className = '' }: { label: string; value: ReactNode; note?: string; className?: string }) => (
    <div className={`bg-brand-surface px-3 sm:px-4 pt-3 pb-3.5 grid gap-1.5 sm:gap-[7px] content-start ${className}`}>
        <CardLabel>{label}</CardLabel>
        <div className="flex items-center gap-2 min-h-6 text-[13.5px] sm:text-sm font-semibold text-brand-text">{value}</div>
        {note && <div className="text-[11.5px] sm:text-xs leading-[1.45] text-brand-muted text-pretty">{note}</div>}
    </div>
);

/** La franja de datos: estado, calidad, categoría, idioma y la última modificación en Meta. */
export const TemplateFactStrip = ({ template, neverSent }: { template: Template; neverSent: boolean }) => {
    const status = templateStatusWords(template);
    const quality = templateQualityWords(template, { neverSent });
    const modified = template.metaUpdatedAt;
    return (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-brand-border border border-brand-border rounded-xl overflow-hidden">
            <Fact label="Estado" value={<Pill tone={status.tone}>{status.label}</Pill>} note={templateStatusNote(template)} />
            <Fact label="Calidad" note={quality.note} value={<>
                <span className={`w-[9px] h-[9px] rounded-full flex-none ${QUALITY_DOT[quality.dot]}`} />{quality.label}
            </>} />
            <Fact label="Categoría" value={<CategoryPill category={template.category} />} note={templateCategoryNote(template)} />
            <Fact label="Idioma" value={languageName(template.language)} note={template.language} />
            <Fact label="Modificada en Meta" className="col-span-2 lg:col-span-1"
                value={modified ? formatShortDate(modified) : '—'}
                note={modified ? (template.deletedInMetaAt ? 'la última vez que llegó' : `a las ${timeOf(modified)}`) : undefined} />
        </div>
    );
};

/** La burbuja como le llega al contacto, con los ejemplos que se mandaron a Meta. */
export const TemplatePreviewCard = ({ template }: { template: Template }) => {
    const values = bodyExampleValues(template);
    const keys = orderedPlaceholders(template.bodyText);
    const highlights = Object.fromEntries(keys.map(k => [k, 'example' as ValueHighlight]));
    const missing = keys.find(k => !values[k]?.trim());
    const sendable = isSendableTemplate(template);
    const label = template.deletedInMetaAt ? 'Cómo la veía el contacto'
        : sendable ? 'Cómo la ve el contacto' : 'Cómo la vería el contacto';
    const tag = template.deletedInMetaAt ? 'Ya no se envía' : sendable ? null : 'No se puede enviar';
    return (
        <section className="bg-brand-bg rounded-xl px-3.5 sm:px-5 pt-4 pb-[18px] sm:pb-[22px] min-w-0">
            <div className="flex items-center justify-between gap-2.5">
                <CardLabel>{label}</CardLabel>
                {tag && (
                    <span className="text-[11.5px] font-semibold text-brand-muted bg-brand-surface border border-brand-border rounded-full px-2.5 py-0.5">
                        {tag}
                    </span>
                )}
            </div>
            <div className="mt-[18px] ml-auto w-full max-w-[300px] grid gap-1">
                <TemplateBubble bodyText={template.bodyText ?? ''} values={values} highlights={highlights} template={template} />
                <TemplateButtons buttons={template.buttons} />
            </div>
            {keys.length > 0 && (
                <div className="mt-4"><ExampleHighlightLegend missingKey={missing ? `{{${missing}}}` : null} /></div>
            )}
        </section>
    );
};

/** El archivo que sale en la cabecera, con lo de la columna «Cabecera» de la tabla. */
export const TemplateHeaderFileCard = ({ template, canManage, className }: { template: Template; canManage: boolean; className?: string }) => {
    const rule = headerMediaRule(template);
    const has = Boolean(template.headerMedia);
    // Una borrada sin archivo no tiene nada que subir: ya no se envía.
    if (!rule || (template.deletedInMetaAt && !has)) return null;
    const note = template.deletedInMetaAt
        ? (canManage ? 'Ya no se envía. Puedes quitarlo.' : 'Ya no se envía.')
        : canManage
            ? `Es ${rule.the} ${rule.noun} que sale al enviarla desde el chat o la API. En una campaña se elige al prepararla.`
            : `Es ${rule.the} ${rule.noun} que sale al enviarla desde el chat. ${rule.the === 'la' ? 'La' : 'Lo'} sube quien gestiona las plantillas.`;
    return (
        <DetailCard label="Archivo de la cabecera" className={className}>
            <TemplateHeaderCell template={template} roomy />
            <p className="text-[12.5px] leading-[1.55] text-brand-muted text-pretty">{note}</p>
        </DetailCard>
    );
};

const BUTTON_ICON: Record<TemplateButtonDetail['kind'], ReactNode> = {
    url: <ExternalLink size={15} />,
    phone: <Phone size={15} />,
    reply: <Reply size={15} />,
    code: <Copy size={15} />,
};

/** Cada botón con su destino. */
export const TemplateButtonsCard = ({ template }: { template: Template }) => {
    const buttons = templateButtonDetails(template.buttons);
    if (buttons.length === 0) return null;
    return (
        <DetailCard label="Botones" flush>
            {buttons.map((b, i) => (
                <div key={i} className="grid grid-cols-[30px_minmax(0,1fr)] gap-3 px-3.5 sm:px-[18px] py-3 border-t border-brand-raised">
                    <span className="w-[30px] h-[30px] rounded-[8px] bg-brand-raised text-brand-accent-strong flex items-center justify-center">
                        {BUTTON_ICON[b.kind]}
                    </span>
                    <div className="min-w-0 grid gap-[3px]">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-semibold text-brand-text">{b.text}</span>
                            <span className="text-[12.5px] text-brand-muted">{b.type}</span>
                        </div>
                        {b.dest && (
                            <div className="font-mono text-[12.5px] text-brand-strong [overflow-wrap:anywhere]">
                                {b.dest}
                                {b.destVariable && (
                                    <span className="text-brand-accent-strong bg-brand-accent-soft rounded-[3px] px-[3px]">{b.destVariable}</span>
                                )}
                            </div>
                        )}
                        <div className="text-[12.5px] leading-[1.5] text-brand-muted">{b.note}</div>
                    </div>
                </div>
            ))}
        </DetailCard>
    );
};

/** Las variables, con el ejemplo que se mandó a Meta y dónde están. */
export const TemplateVariablesCard = ({ template }: { template: Template }) => {
    const variables = templateVariables(template);
    if (variables.length === 0) return null;
    return (
        <DetailCard label="Variables" flush extra={
            <span className="hidden sm:inline text-[12.5px] text-brand-muted">
                Con el ejemplo que se mandó a Meta para aprobarla. En cada envío se rellenan con datos reales.
            </span>
        }>
            {variables.map((v, i) => (
                <div key={i} className="grid grid-cols-[56px_minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)_150px] gap-x-2.5 sm:gap-x-3.5
                    items-baseline sm:items-center px-3.5 sm:px-[18px] py-2.5 border-t border-brand-raised">
                    <span className="font-mono text-[12.5px] text-brand-accent-strong [overflow-wrap:anywhere]">{v.key}</span>
                    <span className={`text-[13.5px] sm:text-sm ${v.example ? 'text-brand-text' : 'text-brand-subtle'}`}>
                        {v.example ?? 'Sin ejemplo'}
                        <span className="sm:hidden block text-[11.5px] text-brand-muted">{v.where}</span>
                    </span>
                    <span className="hidden sm:block text-[12.5px] text-brand-muted">{v.where}</span>
                </div>
            ))}
        </DetailCard>
    );
};
