import { useMemo, useRef, useState } from "react";
import { useTags } from "../../../../hooks/useTags";
import { useImportPreview, useImportRun } from "../../../../hooks/useContactImport";
import type { TagSelection } from "../../../../components/Tag/TagSelector";
import type { ColumnMapping, ContactsFile, ImportFieldKey, ImportInput } from "../../../../models/contactImport.model";
import {
    IMPORT_BATCH_SIZE, assignColumn, buildImportRows, errorFileName, errorRowsCsv, guessColumnMapping, loadImportCountry,
    packRowGroups, preferredSheetName, saveImportCountry, unusedColumns,
} from "../../../../utils/contactImport";
import { ContactsFileError, readContactsFile, sheetProblem, type FileProblem } from "../../../../utils/contactsFile";
import type { CountryCode } from "../../../../utils/phoneCountry";
import { tagsFromIds } from "../../../../utils/tags";
import { downloadFile } from "../../../../utils/download";

export const IMPORT_STEPS = ['Archivo', 'Columnas', 'Revisar'] as const;
export type ImportStep = 1 | 2 | 3;

/**
 * El estado de «Importar contactos». Todo vive en la página, nada en el
 * navegador: el archivo no se puede guardar en un borrador, así que recargar
 * vuelve al paso 1. Nada se escribe en la BD hasta que se pulsa «Importar».
 */
export const useImportWizard = () => {
    const { data: tags = [] } = useTags();
    const [step, setStep] = useState<ImportStep>(1);
    /** El archivo elegido, aunque no se haya podido leer: su nombre y su peso salen en la tarjeta. */
    const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
    const [file, setFile] = useState<ContactsFile | null>(null);
    const [readProblem, setReadProblem] = useState<FileProblem | null>(null);
    const [isReading, setIsReading] = useState(false);
    const [sheetName, setSheetName] = useState('');
    const [mapping, setMapping] = useState<ColumnMapping | null>(null);
    const [country, setCountryState] = useState<CountryCode>(loadImportCountry);
    const [extraTags, setExtraTags] = useState<TagSelection>({ ids: [], newNames: [] });
    const [consent, setConsent] = useState(false);
    const preview = useImportPreview();
    const run = useImportRun();
    // Si se elige otro archivo mientras se lee el anterior, el anterior no cuenta.
    const readToken = useRef(0);

    const sheet = file?.sheets.find(s => s.name === sheetName) ?? null;
    const problem = readProblem ?? (sheet ? sheetProblem(sheet) : null);
    const rows = useMemo(() => (sheet && mapping ? buildImportRows(sheet, mapping) : []), [sheet, mapping]);
    const unused = useMemo(() => (sheet && mapping ? unusedColumns(sheet, mapping) : []), [sheet, mapping]);
    const extraTagNames = [...tagsFromIds(tags, extraTags.ids).map(tag => tag.name), ...extraTags.newNames];

    const applySheet = (source: ContactsFile, name: string) => {
        setSheetName(name);
        setMapping(guessColumnMapping(source.sheets.find(s => s.name === name)?.header ?? []));
    };

    const chooseFile = async (selected: File) => {
        const token = ++readToken.current;
        setPicked({ name: selected.name, size: selected.size });
        setFile(null);
        setReadProblem(null);
        setConsent(false);
        setIsReading(true);
        try {
            const read = await readContactsFile(selected);
            if (token !== readToken.current) return;
            setFile(read);
            applySheet(read, preferredSheetName(read));
        } catch (error) {
            if (token === readToken.current) setReadProblem(error instanceof ContactsFileError ? error.problem : 'unreadable');
        } finally {
            if (token === readToken.current) setIsReading(false);
        }
    };

    const chooseSheet = (name: string) => {
        if (file) applySheet(file, name);
    };

    const setCountry = (next: CountryCode) => {
        setCountryState(next);
        saveImportCountry(next);
    };

    const setColumn = (key: ImportFieldKey, column: number | null) => setMapping(m => m && assignColumn(m, key, column));

    const goToStep = (next: ImportStep) => {
        // Lo comprobado deja de valer en cuanto se puede cambiar algo.
        if (next < 3) preview.reset();
        setStep(next);
    };

    const review = () => {
        setStep(3);
        preview.mutate({ rows, country, extraTagNames });
    };
    const retryReview = () => preview.variables && preview.mutate(preview.variables);

    /** Guarda lo que se revisó (no lo que haya ahora en pantalla), en tandas que no parten a nadie. */
    const startImport = () => {
        const reviewed = preview.variables;
        if (!preview.data || !reviewed) return;
        const byRow = new Map(reviewed.rows.map(row => [row.row, row]));
        const batches: ImportInput[] = packRowGroups(preview.data.rowGroups, IMPORT_BATCH_SIZE).map(numbers => ({
            country: reviewed.country,
            extraTagNames: reviewed.extraTagNames,
            rows: numbers.map(n => byRow.get(n)!),
        }));
        run.start(batches);
    };

    /** Las filas con error, con todas sus columnas, para corregirlas y volver a importarlas. */
    const downloadErrorRows = () => {
        if (!file || !sheet || !preview.data) return;
        const csv = errorRowsCsv(sheet, preview.data.issues);
        downloadFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), errorFileName(file.name));
    };

    const toImport = preview.data ? preview.data.summary.create + preview.data.summary.update : 0;
    // Si otra pestaña completó alguno entre la revisión y la importación, salen menos: nunca más del total.
    const saved = run.created + run.updated;
    const progress = {
        saved,
        left: Math.max(toImport - saved, 0),
        percent: toImport > 0 ? Math.round(Math.min(saved / toImport, 1) * 100) : 0,
    };

    return {
        step, goToStep, picked, file, sheet, isReading, problem, chooseFile, chooseSheet,
        mapping, setColumn, unused, rows, country, setCountry, extraTags, setExtraTags,
        consent, setConsent, preview, review, retryReview, downloadErrorRows, toImport, run, progress, startImport,
    };
};

export type ImportWizard = ReturnType<typeof useImportWizard>;
