import { useState } from "react";
import { TemplateBubble, TemplateButtons, ValueHighlightLegend, type ValueHighlight } from "../../../../components/Chat/TemplatePreview";
import type { CampaignSample, CampaignVariable } from "../../../../models/campaign.model";
import type { Template } from "../../../../models/template.model";
import { VARIABLE_SOURCE_NOUN, pluralize } from "../../../../utils/campaignDisplay";
import { initials } from "../../../../utils/initials";

interface MessagePreviewProps {
    template: Template;
    variables: CampaignVariable[];
    /** El mensaje ya relleno para los primeros contactos (vacío si falta algo por completar). */
    samples: CampaignSample[];
    /** Cuántos usarán la reserva, por clave. */
    fallbacks: Record<string, number>;
    /** Elegir entre los ejemplos («Ver como»); si no, solo el primero. */
    selectable?: boolean;
    /** De dónde sale el archivo de la cabecera («Imagen de la plantilla»). */
    headerNote?: string | null;
}

const sampleBubble = (sample: CampaignSample) => {
    const values: Record<string, string> = {};
    const highlights: Record<string, ValueHighlight> = {};
    Object.entries(sample.values).forEach(([key, resolved]) => {
        values[key] = resolved.value;
        highlights[key] = resolved.usedFallback ? 'fallback' : 'value';
    });
    return { values, highlights };
};

/**
 * Cómo le llega el mensaje a cada contacto, con cada dato resaltado según de
 * dónde salió. Mientras falte algo por completar no hay ejemplos: se ve la
 * plantilla con los textos fijos puestos y los huecos a la vista.
 */
export const MessagePreview = ({ template, variables, samples, fallbacks, selectable = true, headerNote }: MessagePreviewProps) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const sample = samples.find(s => s.contactId === selectedId) ?? samples[0];

    const fixedValues = Object.fromEntries(variables.filter(v => v.source === 'fixed').map(v => [v.key, v.value ?? '']));
    const { values, highlights } = sample ? sampleBubble(sample) : { values: fixedValues, highlights: undefined };

    // Los que no tienen el dato reciben la reserva: se enseña también ese mensaje.
    const withFallback = variables.filter(v => v.source !== 'fixed' && (fallbacks[v.key] ?? 0) > 0 && v.fallback?.trim());
    const fallbackValues = { ...values, ...Object.fromEntries(withFallback.map(v => [v.key, v.fallback!.trim()])) };
    const fallbackHighlights: Record<string, ValueHighlight> = {
        ...highlights,
        ...Object.fromEntries(withFallback.map(v => [v.key, 'fallback' as const])),
    };
    const single = withFallback.length === 1 ? withFallback[0] : null;
    const fallbackTitle = single && single.source !== 'fixed'
        ? `Así lo verán los ${pluralize(fallbacks[single.key], 'contacto', 'contactos')} sin ${VARIABLE_SOURCE_NOUN[single.source]}:`
        : 'Así lo verán quienes no tengan esos datos:';

    return (
        <div className="grid gap-3 content-start">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">
                {selectable || !sample ? 'Vista previa' : `Así le llega a ${sample.displayName}`}
            </span>

            {selectable && samples.length > 1 && (
                <div className="grid gap-1.5">
                    <div className="flex items-center gap-2">
                        <span className="text-[12.5px] text-brand-muted">Ver como</span>
                        <div className="flex gap-1">
                            {samples.map(s => (
                                <button
                                    key={s.contactId}
                                    type="button"
                                    title={s.displayName}
                                    aria-pressed={s === sample}
                                    onClick={() => setSelectedId(s.contactId)}
                                    className={`w-9 h-9 lg:w-[30px] lg:h-[30px] rounded-[8px] border text-[11px] font-bold cursor-pointer
                                        transition-colors flex items-center justify-center
                                        ${s === sample
                                            ? 'bg-brand-deep border-brand-deep text-brand-accent'
                                            : 'bg-brand-surface border-brand-border text-brand-gray-600 hover:bg-brand-bg'}`}
                                >
                                    {initials(s.displayName)}
                                </button>
                            ))}
                        </div>
                    </div>
                    {sample && (
                        <span className="text-xs text-brand-muted">
                            <span className="font-semibold text-brand-text">{sample.displayName}</span> · uno de los primeros de la selección
                        </span>
                    )}
                </div>
            )}

            <div className="justify-self-end w-full max-w-[300px] grid gap-1">
                <TemplateBubble bodyText={template.bodyText ?? ''} values={values} highlights={highlights} template={template} />
                <TemplateButtons buttons={template.buttons} />
                {headerNote && <span className="justify-self-end text-xs text-brand-muted">{headerNote}</span>}
            </div>

            {sample && withFallback.length > 0 && (
                <div className="grid gap-2 mt-1">
                    <span className="text-xs text-brand-muted">{fallbackTitle}</span>
                    <div className="justify-self-end w-full max-w-[300px]">
                        <TemplateBubble bodyText={template.bodyText ?? ''} values={fallbackValues} highlights={fallbackHighlights} />
                    </div>
                </div>
            )}

            {sample && <div className="mt-2"><ValueHighlightLegend /></div>}
        </div>
    );
};
