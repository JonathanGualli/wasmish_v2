import { AlertCircle, ArrowRight, Download, FileSpreadsheet, FileUp } from "lucide-react";
import { Callout } from "../../../../components/Callout/Callout";
import { CustomButton } from "../../../../components/Button/Button";
import { SelectField } from "../../../../components/SelectField/SelectField";
import { useFilePicker } from "../../../../hooks/useFilePicker";
import { IMPORT_MAX_ROWS, sheetSize, templateSheet } from "../../../../utils/contactImport";
import { CONTACTS_FILE_ACCEPT, fileProblemCopy } from "../../../../utils/contactsFile";
import { COUNTRY_OPTIONS, countryPhoneExample, type CountryCode } from "../../../../utils/phoneCountry";
import { formatFileSize } from "../../../../utils/templateHeader";
import { downloadFile } from "../../../../utils/download";
import type { ImportWizard } from "./useImportWizard";

const TEMPLATE_URL = '/plantilla-contactos.xlsx';

/** Lo que se dice bajo el nombre del archivo: su tamaño en filas o, si no se pudo leer, en bytes. */
const fileMeta = (wizard: ImportWizard) => {
    const { picked, sheet, problem } = wizard;
    if (!sheet) return picked ? formatFileSize(picked.size) : '';
    if (problem === 'empty') return sheet.header.length > 0 ? 'Solo la fila de cabecera' : 'No tiene nada escrito';
    return problem ? sheetSize(sheet) : `${sheetSize(sheet)} · leído en tu navegador`;
};

const DropZone = ({ isDragging, onPick }: { isDragging: boolean; onPick: () => void }) => (
    <div className={`border-[1.5px] border-dashed rounded-xl px-6 py-9 grid justify-items-center gap-2.5 text-center transition-colors
        ${isDragging ? 'border-brand-success bg-brand-green-50' : 'border-brand-border-strong bg-brand-bg'}`}>
        <span className="w-12 h-12 rounded-xl bg-brand-surface border border-brand-border text-brand-gray-600 flex items-center justify-center">
            <FileUp size={22} />
        </span>
        <span className="hidden md:block text-[15px] font-semibold text-brand-text">Arrastra tu archivo aquí</span>
        <div className="h-10"><CustomButton variant="outline" onClick={onPick}>Elegir archivo</CustomButton></div>
        <span className="text-[12.5px] leading-normal text-brand-muted">
            Excel (.xlsx) o CSV · hasta <span className="font-mono">{IMPORT_MAX_ROWS.toLocaleString('es-EC')}</span> filas ·
            se lee en tu navegador; nada se guarda hasta el último paso
        </span>
    </div>
);

const FileCard = ({ wizard, onPick }: { wizard: ImportWizard; onPick: () => void }) => {
    const { picked, isReading, problem } = wizard;
    const extension = picked?.name.split('.').pop()?.toUpperCase().slice(0, 4) ?? '';
    return (
        <div className={`border rounded-xl bg-brand-surface px-4 py-3.5 flex items-center gap-3.5
            ${problem ? 'border-brand-danger' : 'border-brand-border'}`}>
            <span className={`w-11 h-11 flex-none rounded-[9px] flex items-center justify-center font-mono text-[10px] font-bold
                ${problem ? 'bg-brand-danger-soft text-brand-danger' : 'bg-brand-accent-soft text-brand-accent-strong'}`}>
                {extension}
            </span>
            <div className="flex-1 min-w-0 grid gap-0.5">
                <span className="text-sm font-semibold text-brand-text [overflow-wrap:anywhere]">{picked?.name}</span>
                <span className="text-[12.5px] text-brand-muted">{isReading ? 'Leyendo…' : fileMeta(wizard)}</span>
            </div>
            <div className="flex-none h-9">
                <CustomButton variant="outline" onClick={onPick} disabled={isReading}>{problem ? 'Elegir otro' : 'Cambiar'}</CustomButton>
            </div>
        </div>
    );
};

/**
 * Paso 1: el archivo y el país de los números. El archivo se lee entero aquí,
 * al elegirlo: los errores de formato y de tamaño salen al momento.
 */
export const FileStep = ({ wizard }: { wizard: ImportWizard }) => {
    const { picked, file, sheet, problem, chooseFile, chooseSheet, country, setCountry } = wizard;
    const picker = useFilePicker(selected => void chooseFile(selected));
    const copy = problem ? fileProblemCopy(problem, sheet?.rows.length) : null;
    const example = countryPhoneExample(country);
    // La plantilla trae una hoja de instrucciones: con ella no se pregunta.
    const showSheets = Boolean(file && file.sheets.length > 1 && !templateSheet(file));

    return (
        <div className="max-w-[760px] grid gap-5">
            <Callout
                icon={<FileSpreadsheet size={16} />}
                title="La forma más fácil: usa nuestra plantilla"
                action={
                    <div className="h-10">
                        <CustomButton variant="outline" onClick={() => downloadFile(TEMPLATE_URL, 'plantilla-contactos.xlsx')}>
                            <Download size={15} />Descargar plantilla
                        </CustomButton>
                    </div>
                }
            >
                Las columnas ya están puestas y el teléfono no se estropea. Excel suele convertir los números largos en{' '}
                <span className="font-mono text-xs text-brand-strong bg-brand-surface rounded px-1.5 py-px">5,93991E+11</span> o les
                quita el 0 del principio.
            </Callout>

            <div className="grid gap-2" {...picker.dropProps}>
                <span className="text-[13px] font-semibold text-brand-strong">Tu archivo</span>
                {picked ? <FileCard wizard={wizard} onPick={picker.open} /> : <DropZone isDragging={picker.isDragging} onPick={picker.open} />}
                {copy && (
                    <p className="flex gap-2 items-start text-[13px] leading-normal text-brand-danger">
                        <AlertCircle size={14} className="flex-none mt-0.5" />
                        <span><b className="font-semibold">{copy.title}</b> {copy.help}</span>
                    </p>
                )}
                <input {...picker.inputProps} accept={CONTACTS_FILE_ACCEPT} aria-label="Archivo de contactos" />
            </div>

            {showSheets && file && sheet && (
                <div className="md:w-[280px]">
                    <SelectField
                        label="Hoja del archivo"
                        value={sheet.name}
                        options={file.sheets.map(s => ({ value: s.name, label: s.name }))}
                        onChange={chooseSheet}
                    />
                </div>
            )}

            <div className="grid md:grid-cols-[280px_minmax(0,1fr)] gap-x-5 gap-y-3 items-end">
                <SelectField<CountryCode> label="País de los números" value={country} options={COUNTRY_OPTIONS} onChange={setCountry} />
                <div className="grid gap-1.5 text-[13px] leading-normal text-brand-gray-600 md:pb-1">
                    {example && (
                        <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[12.5px] text-brand-text bg-brand-bg rounded px-1.5 py-0.5">{example.local}</span>
                            <ArrowRight size={13} className="text-brand-subtle" />
                            <span className="font-mono text-[12.5px] text-brand-accent-strong">{example.international}</span>
                        </span>
                    )}
                    <span>Solo para los que vienen sin código de país. Los que ya lo traen se dejan como están.</span>
                </div>
            </div>
        </div>
    );
};
