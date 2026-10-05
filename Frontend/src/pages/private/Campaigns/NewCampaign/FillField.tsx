import type { ReactNode } from "react";
import { AuthField } from "../../../../components/Auth/AuthField";
import { SelectField } from "../../../../components/SelectField/SelectField";
import type { CampaignFill, VariableSource } from "../../../../models/campaign.model";
import { VARIABLE_SOURCE_LABEL, VARIABLE_SOURCE_NOUN, pluralize } from "../../../../utils/campaignDisplay";

const SOURCE_OPTIONS = (Object.keys(VARIABLE_SOURCE_LABEL) as VariableSource[])
    .map(value => ({ value, label: VARIABLE_SOURCE_LABEL[value] }));

interface FillFieldProps {
    /** Qué se rellena: «{{1}}», «{{nombre}}», «Botón». */
    tag: string;
    /** Dónde aparece, para saber cuál es cuál. */
    context: ReactNode;
    fill: CampaignFill;
    onChange: (fill: CampaignFill) => void;
    /** El nombre del texto fijo: «Texto para todos», «Final del enlace». */
    fixedLabel: string;
    /** Cuántos destinatarios no tienen el dato y usarán la reserva. */
    fallbackCount?: number;
    error?: string;
}

/**
 * Una variable o un botón del envío: de dónde sale el valor y, si sale del
 * contacto, qué se pone cuando no lo tiene (Meta rechaza una variable vacía).
 */
export const FillField = ({ tag, context, fill, onChange, fixedLabel, fallbackCount = 0, error }: FillFieldProps) => {
    const isFixed = fill.source === 'fixed';
    const noun = fill.source === 'fixed' ? '' : VARIABLE_SOURCE_NOUN[fill.source];

    return (
        <div className={`border rounded-xl px-4 py-3.5 grid gap-3 ${error ? 'border-brand-danger-border' : 'border-brand-border'}`}>
            <div className="flex items-start gap-2.5 min-w-0">
                <span className="flex-none font-mono text-xs font-semibold text-brand-accent-strong bg-brand-green-50 rounded-[5px] px-1.5 py-0.5">
                    {tag}
                </span>
                <span className="text-[13px] leading-[1.5] text-brand-muted min-w-0">{context}</span>
            </div>

            <div className="grid sm:grid-cols-[210px_minmax(0,1fr)] gap-3">
                <SelectField
                    label="Origen"
                    value={fill.source}
                    options={SOURCE_OPTIONS}
                    onChange={source => onChange({ ...fill, source })}
                />
                {isFixed ? (
                    <AuthField
                        label={fixedLabel}
                        value={fill.value ?? ''}
                        onChange={e => onChange({ ...fill, value: e.target.value })}
                        maxLength={1024}
                        error={error}
                    />
                ) : (
                    <AuthField
                        label="Valor de reserva · obligatorio"
                        placeholder={`Si no tiene ${noun}`}
                        value={fill.fallback ?? ''}
                        onChange={e => onChange({ ...fill, fallback: e.target.value })}
                        maxLength={1024}
                        error={error}
                    />
                )}
            </div>

            {!isFixed && fallbackCount > 0 && fill.fallback?.trim() && (
                <div className="flex items-center gap-2 text-[12.5px] text-brand-strong">
                    <span className="w-3.5 flex-none border-b-[1.5px] border-dashed border-brand-accent-strong" />
                    {pluralize(fallbackCount, `contacto no tiene ${noun}`, `contactos no tienen ${noun}`)}: verán «{fill.fallback.trim()}».
                </div>
            )}
        </div>
    );
};
