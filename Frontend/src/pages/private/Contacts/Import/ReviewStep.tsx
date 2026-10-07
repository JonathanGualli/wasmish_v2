import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, ChevronDown, Download, Info } from "lucide-react";
import { Callout } from "../../../../components/Callout/Callout";
import { Checkbox } from "../../../../components/Checkbox/Checkbox";
import { CustomButton } from "../../../../components/Button/Button";
import { MetricGrid, type Metric } from "../../../../components/MetricGrid/MetricGrid";
import { Pill } from "../../../../components/Pill/Pill";
import { TagChip } from "../../../../components/Tag/TagChip";
import { importError } from "../../../../hooks/useContactImport";
import type { ImportIssue, ImportRow, ImportSampleEntry, ImportSummary } from "../../../../models/contactImport.model";
import { pluralize } from "../../../../utils/campaignDisplay";
import { cellText, nothingToImportText, sampleNote } from "../../../../utils/contactImport";
import { initials } from "../../../../utils/initials";
import { formatInternationalPhone } from "../../../../utils/phoneCountry";
import { tagKey } from "../../../../utils/tags";
import type { ImportWizard } from "./useImportWizard";

/** Cuántos problemas se enseñan por pestaña; el resto está en el archivo que se descarga. */
const ISSUES_SHOWN = 50;

const reviewMetrics = (s: ImportSummary): Metric[] => [
    { label: 'Nuevos', value: s.create, note: 'No existían: se crearán.', tone: s.create > 0 ? 'success' : undefined },
    { label: 'Se completarán', value: s.update, note: 'Solo se rellena lo vacío.' },
    { label: 'Sin cambios', value: s.unchanged, note: 'Ya tienen todo lo del archivo.' },
    { label: 'Repetidos', value: s.duplicates, note: 'El mismo número otra vez: queda uno.' },
    { label: 'Con error', value: s.errors, note: 'No se importarán.', tone: s.errors > 0 ? 'danger' : undefined },
    { label: 'Con aviso', value: s.warnings, note: 'Se importan; mira el aviso.', tone: s.warnings > 0 ? 'warning' : undefined },
];

const ISSUE_TABS = { error: 'Errores', warning: 'Avisos' } as const;

/**
 * Los errores y avisos, fila a fila: el valor que lo causó y por qué. En
 * móvil empieza plegado, detrás de un botón, para que el resumen se lea primero.
 */
const IssuesCard = ({ issues, rows, onDownload }: { issues: ImportIssue[]; rows: ImportRow[]; onDownload: () => void }) => {
    const errors = issues.filter(i => i.type === 'error');
    const warnings = issues.filter(i => i.type === 'warning');
    const [tab, setTab] = useState<ImportIssue['type']>(errors.length > 0 ? 'error' : 'warning');
    const [expanded, setExpanded] = useState(false);
    const rowsByNumber = useMemo(() => new Map(rows.map(r => [r.row, r])), [rows]);

    const current = tab === 'error' ? errors : warnings;
    const hidden = current.length - Math.min(current.length, ISSUES_SHOWN);
    const counts = { error: errors.length, warning: warnings.length };

    return (
        <>
            <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                aria-expanded={expanded}
                className="md:hidden flex items-center justify-between min-h-12 px-3.5 border border-brand-border rounded-xl
                    text-sm font-semibold text-brand-text cursor-pointer"
            >
                Ver {[errors.length > 0 && pluralize(errors.length, 'error', 'errores'), warnings.length > 0 && pluralize(warnings.length, 'aviso', 'avisos')]
                    .filter(Boolean).join(' y ')}
                <ChevronDown size={16} className={`text-brand-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            <div className={`${expanded ? '' : 'hidden'} md:block border border-brand-border rounded-xl overflow-hidden`}>
                <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-2 border-b border-brand-raised">
                    {(Object.keys(ISSUE_TABS) as ImportIssue['type'][]).map(type => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setTab(type)}
                            aria-pressed={tab === type}
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer
                                ${tab === type ? 'bg-brand-accent-soft text-brand-accent-strong' : 'bg-brand-raised text-brand-gray-600 hover:text-brand-text'}`}
                        >
                            {ISSUE_TABS[type]}<span className="font-mono">{counts[type].toLocaleString('es-EC')}</span>
                        </button>
                    ))}
                    {errors.length > 0 && (
                        <div className="ml-auto h-9">
                            <CustomButton variant="outline" onClick={onDownload}><Download size={14} />Descargar filas con error</CustomButton>
                        </div>
                    )}
                </div>

                {current.slice(0, ISSUES_SHOWN).map(issue => {
                    const value = cellText(rowsByNumber.get(issue.row)?.[issue.field]).trim();
                    return (
                        <div key={`${issue.row}-${issue.field}-${issue.message}`}
                            className="grid grid-cols-[56px_minmax(0,1fr)] md:grid-cols-[64px_minmax(0,150px)_minmax(0,1fr)] gap-x-3.5 gap-y-1
                                items-center px-3.5 py-2.5 border-b border-brand-bg text-[13px]">
                            <span className="font-mono text-xs text-brand-muted">Fila {issue.row}</span>
                            <span className={`justify-self-start max-w-full truncate font-mono text-xs bg-brand-bg rounded px-1.5 py-0.5
                                ${value ? 'text-brand-text' : 'text-brand-subtle'}`}>
                                {value || '(vacío)'}
                            </span>
                            <span className="col-start-2 md:col-start-auto text-brand-strong">{issue.message}</span>
                        </div>
                    );
                })}

                <p className="px-3.5 py-2.5 bg-brand-bg text-[12.5px] leading-normal text-brand-gray-600">
                    {hidden > 0 && `Y ${hidden.toLocaleString('es-EC')} más. `}
                    {tab === 'error'
                        ? 'Corrígelas en el archivo descargado y vuelve a importarlo: los que ya entraron no se duplican.'
                        : 'Se importan igual: sin ese dato, recortado o tal cual, según el aviso.'}
                </p>
            </div>
        </>
    );
};

/** Un contacto como quedará: lo que ya tiene más lo que se le añade. Las etiquetas para todos, marcadas. */
const SampleCard = ({ entry, issues, extraTagKeys }: { entry: ImportSampleEntry; issues: ImportIssue[]; extraTagKeys: Set<string> }) => {
    const name = entry.current?.name ?? entry.fields.name ?? null;
    const company = entry.current?.company ?? entry.fields.company;
    const tags = [...(entry.current?.tagNames ?? []), ...entry.tagNames];
    const phone = formatInternationalPhone(entry.phone);
    const note = sampleNote(entry, issues);

    return (
        <div className="bg-brand-surface border border-brand-border rounded-xl px-3.5 py-3 grid gap-2">
            <div className="flex items-center gap-2.5">
                <span className="w-[34px] h-[34px] flex-none rounded-[9px] bg-brand-raised text-brand-gray-600 text-xs font-bold
                    flex items-center justify-center">
                    {initials(name ?? '')}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-brand-text truncate">{name ?? phone}</div>
                    {name && <div className="font-mono text-[11.5px] text-brand-muted truncate">{phone}</div>}
                </div>
                <Pill tone={entry.action === 'create' ? 'positive' : 'neutral'}>{entry.action === 'create' ? 'Nuevo' : 'Se completa'}</Pill>
            </div>
            {company && <div className="text-[12.5px] text-brand-gray-600">{company}</div>}
            {tags.length > 0 && (
                <div className="flex flex-wrap gap-[5px]">
                    {tags.map(tag => <TagChip key={tag} name={tag} highlight={extraTagKeys.has(tagKey(tag))} />)}
                </div>
            )}
            {note && <p className="text-xs leading-normal text-brand-gray-600 border-t border-brand-raised pt-2">{note}</p>}
        </div>
    );
};

/**
 * Paso 3: qué pasará con cada fila, comprobado en el backend con el mismo
 * plan que la importación, sin guardar nada. Importar pide el consentimiento.
 */
export const ReviewStep = ({ wizard }: { wizard: ImportWizard }) => {
    const { preview, consent, setConsent, retryReview, downloadErrorRows, toImport } = wizard;

    if (preview.isError) {
        const { title, detail } = importError(preview.error);
        return (
            <div className="max-w-[760px]">
                <Callout tone="danger" icon={<AlertCircle size={16} />} title={`No se pudo comprobar el archivo. ${title}`}
                    action={<div className="h-10"><CustomButton variant="outline" onClick={retryReview}>Volver a comprobar</CustomButton></div>}>
                    {detail}
                </Callout>
            </div>
        );
    }
    if (!preview.data || !preview.variables) {
        return (
            <p className="py-16 text-center text-sm text-brand-muted">
                Comprobando {pluralize(preview.variables?.rows.length ?? 0, 'fila', 'filas')}… Todavía no se guarda nada.
            </p>
        );
    }

    const { summary, issues, sample } = preview.data;
    const extraTagKeys = new Set(preview.variables.extraTagNames.map(tagKey));

    return (
        <div className={`grid gap-8 ${sample.length > 0 ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
            <div className="grid gap-3.5 content-start">
                <MetricGrid metrics={reviewMetrics(summary)} columns="grid-cols-2 md:grid-cols-3" />

                {toImport === 0 && (
                    <Callout icon={<Info size={16} />} title="No hay nada que importar.">{nothingToImportText(summary)}</Callout>
                )}
                {summary.optedOutExisting > 0 && (
                    <Callout tone="warning" icon={<AlertTriangle size={16} />}
                        title={`${pluralize(summary.optedOutExisting, 'contacto ya existía y pidió', 'contactos ya existían y pidieron')} no recibir publicidad.`}>
                        Importar no lo cambia: siguen de baja de publicidad.
                    </Callout>
                )}

                {issues.length > 0 && <IssuesCard issues={issues} rows={preview.variables.rows} onDownload={downloadErrorRows} />}

                {toImport > 0 && (
                    <label className={`flex gap-3 items-start rounded-xl border px-3.5 py-3 cursor-pointer transition-colors
                        ${consent ? 'border-brand-green-200 bg-brand-green-50' : 'border-brand-warning bg-brand-warning-soft'}`}>
                        <span className="mt-px">
                            <Checkbox checked={consent} onChange={() => setConsent(!consent)}
                                label="Estos contactos aceptaron recibir mensajes de mi negocio por WhatsApp" />
                        </span>
                        <span className="grid gap-0.5 min-w-0">
                            <span className="text-sm font-semibold text-brand-text">Estos contactos aceptaron recibir mensajes de mi negocio por WhatsApp</span>
                            <span className="text-[12.5px] leading-normal text-brand-gray-600">
                                Escribir a quien no lo pidió trae bloqueos y denuncias, y eso baja la calidad de tu número de WhatsApp.
                            </span>
                        </span>
                    </label>
                )}
            </div>

            {sample.length > 0 && (
                // En móvil se lee el resumen y nada más: los ejemplos no caben sin empujarlo todo.
                <aside className="hidden lg:grid gap-3 content-start bg-brand-bg border border-brand-border rounded-xl p-5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">Así quedarán</span>
                    {sample.map(entry => <SampleCard key={entry.phone} entry={entry} issues={issues} extraTagKeys={extraTagKeys} />)}
                </aside>
            )}
        </div>
    );
};
