import { Check } from "lucide-react";
import { SelectField } from "../../../../components/SelectField/SelectField";
import { TagSelector } from "../../../../components/Tag/TagSelector";
import type { ColumnMapping, ContactsSheet } from "../../../../models/contactImport.model";
import { IMPORT_FIELDS, columnExamples, columnLabel, usedColumns } from "../../../../utils/contactImport";
import type { ImportWizard } from "./useImportWizard";

/** El valor de «No usar» en el desplegable (las columnas van por su número). */
const NO_COLUMN = '';

// En escritorio, una tabla de tres columnas; en móvil, una tarjeta por dato.
const ROW_GRID = 'md:grid-cols-[150px_minmax(0,230px)_minmax(0,1fr)]';

type Field = (typeof IMPORT_FIELDS)[number];

const FieldRow = ({ field, sheet, value, options, onChange }: {
    field: Field;
    sheet: ContactsSheet;
    value: ColumnMapping[Field['key']];
    options: { value: string; label: string }[];
    onChange: (column: number | null) => void;
}) => {
    const missing = Boolean(field.required) && value.column === null;
    const examples = value.column === null ? [] : columnExamples(sheet, value.column);

    return (
        <div className={`grid gap-2 ${ROW_GRID} md:gap-4 md:items-center p-3 md:px-0 md:py-2.5
            border border-brand-border rounded-xl md:border-0 md:border-b md:border-brand-raised md:rounded-none`}>
            <div className="flex md:grid items-baseline gap-x-1.5 gap-y-0.5">
                <span className="text-sm font-semibold text-brand-text">{field.label}</span>
                {field.note && <span className={`text-xs ${missing ? 'text-brand-danger' : 'text-brand-muted'}`}>{field.note}</span>}
            </div>
            <SelectField
                labelHidden
                label={`${field.label}: de qué columna sale`}
                value={value.column === null ? NO_COLUMN : String(value.column)}
                options={options}
                onChange={v => onChange(v === NO_COLUMN ? null : Number(v))}
                // La marca de que la emparejó Wasmish por el nombre; al cambiarla a mano, se va.
                icon={value.auto ? <Check size={14} strokeWidth={2.6} className="text-brand-success" aria-label="Emparejada sola" /> : undefined}
                invalid={missing}
            />
            <div className="flex flex-wrap gap-[5px] min-w-0">
                {examples.map((example, i) => (
                    <span key={i} className="max-w-full truncate font-mono text-[11.5px] text-brand-strong bg-brand-bg rounded px-1.5 py-[3px]">
                        {example}
                    </span>
                ))}
                {value.column === null && (
                    <span className={`text-[12.5px] ${missing ? 'text-brand-danger' : 'text-brand-subtle'}`}>
                        {missing ? 'No encontramos una columna con teléfonos. Elige cuál es.' : 'No se importa'}
                    </span>
                )}
                {value.column !== null && examples.length === 0 && <span className="text-[12.5px] text-brand-subtle">La columna está vacía</span>}
            </div>
        </div>
    );
};

/**
 * Paso 2: de qué columna sale cada dato. Llega emparejado por el nombre de
 * las cabeceras; los ejemplos de la derecha son para ver de un vistazo si
 * cada columna es la que se quería.
 */
export const ColumnsStep = ({ wizard }: { wizard: ImportWizard }) => {
    const { sheet, mapping, setColumn, unused, extraTags, setExtraTags } = wizard;
    if (!sheet || !mapping) return null;

    const options = [
        { value: NO_COLUMN, label: 'No usar' },
        ...usedColumns(sheet).map(i => ({ value: String(i), label: columnLabel(sheet, i) })),
    ];

    return (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8">
            <div className="grid gap-2.5 md:gap-0 content-start">
                <div className={`hidden md:grid ${ROW_GRID} gap-4 pb-2.5 border-b border-brand-raised
                    text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted`}>
                    <span>Dato en Wasmish</span><span>Sale de la columna</span><span>Así viene en tu archivo</span>
                </div>
                {IMPORT_FIELDS.map(field => (
                    <FieldRow
                        key={field.key}
                        field={field}
                        sheet={sheet}
                        value={mapping[field.key]}
                        options={options}
                        onChange={column => setColumn(field.key, column)}
                    />
                ))}
            </div>

            <aside className="grid gap-6 content-start bg-brand-bg border border-brand-border rounded-xl p-5">
                <div className="grid gap-2">
                    <TagSelector
                        label={<>Etiquetas para todos<span className="ml-1.5 text-xs font-normal text-brand-subtle">opcional</span></>}
                        value={extraTags}
                        onChange={setExtraTags}
                    />
                    <span className="text-[12.5px] leading-normal text-brand-gray-600">
                        Se añaden a cada contacto de este archivo. Así los encuentras después con el filtro de Contactos.
                    </span>
                </div>
                <div className="grid gap-2">
                    <span className="text-[13px] font-semibold text-brand-strong">Columnas que no se usan</span>
                    {unused.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {unused.map(i => (
                                <span key={i} className="text-[12.5px] text-brand-muted bg-brand-surface border border-dashed border-brand-border-strong rounded-[6px] px-2 py-1">
                                    {columnLabel(sheet, i)}
                                </span>
                            ))}
                        </div>
                    )}
                    <span className="text-[12.5px] leading-normal text-brand-muted">
                        {unused.length > 0
                            ? 'Se ignoran. Si alguna trae un dato útil, elígela en el dato que le toca.'
                            : 'Todas las columnas del archivo se usan.'}
                    </span>
                </div>
            </aside>
        </div>
    );
};
