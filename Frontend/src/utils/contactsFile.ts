import type { CellValue, ContactsFile, ContactsSheet, SheetRow } from '../models/contactImport.model';
import { IMPORT_MAX_ROWS, isEmptyCell } from './contactImport';

/** Por qué no sirve un archivo. Los tres primeros salen al leerlo; los otros, de la hoja elegida. */
export type FileProblem = 'xls' | 'unsupported' | 'unreadable' | 'empty' | 'tooManyRows';

/** No se pudo leer: es un .xls, no es un Excel ni un CSV, o está roto. */
export class ContactsFileError extends Error {
    readonly problem: FileProblem;
    constructor(problem: 'xls' | 'unsupported' | 'unreadable') {
        super(problem);
        this.problem = problem;
    }
}

/** Qué decir de cada problema: el título en negrita, qué hacer, y la pista del pie. */
export const fileProblemCopy = (problem: FileProblem, rowCount = 0) => {
    switch (problem) {
        case 'xls':
            return {
                title: 'Ese archivo es .xls, de una versión antigua de Excel.',
                help: 'Ábrelo y guárdalo como .xlsx (Archivo › Guardar como).',
                footer: 'Elige un archivo .xlsx o .csv.',
            };
        case 'unsupported':
            return { title: 'Ese archivo no es un Excel ni un CSV.', help: 'Elige un archivo .xlsx o .csv.', footer: 'Elige un archivo .xlsx o .csv.' };
        case 'unreadable':
            return {
                title: 'No se pudo leer el archivo.',
                help: 'Puede estar dañado. Ábrelo en Excel, guárdalo otra vez y vuelve a elegirlo.',
                footer: 'Elige otro archivo.',
            };
        case 'empty':
            return {
                title: 'El archivo no tiene contactos.',
                help: 'No hay ninguna fila debajo de la cabecera. Rellena la plantilla y vuelve a elegirla.',
                footer: 'Elige un archivo con contactos.',
            };
        case 'tooManyRows':
            return {
                title: `El archivo tiene ${rowCount.toLocaleString('es-EC')} filas: el máximo es ${IMPORT_MAX_ROWS.toLocaleString('es-EC')}.`,
                help: 'Divídelo en dos e impórtalos por separado; no se duplica nadie.',
                footer: 'Elige un archivo más pequeño.',
            };
    }
};

/** Lo que impide importar una hoja ya leída, o `null`. */
export const sheetProblem = (sheet: ContactsSheet): FileProblem | null => {
    if (sheet.rows.length === 0) return 'empty';
    if (sheet.rows.length > IMPORT_MAX_ROWS) return 'tooManyRows';
    return null;
};

const fileExtension = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** Una celda de Excel en algo que se pueda mandar: las fechas como 2026-10-06, los sí/no en palabras. */
const toCell = (value: unknown): CellValue => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (typeof value === 'number' || typeof value === 'string') return value;
    return String(value);
};

/**
 * Una hoja a partir de sus filas, en orden. La cabecera es la primera fila
 * con algo escrito (puede haber un título encima); las filas vacías no
 * cuentan, pero cada una conserva su número, para decir «Fila 14» como Excel.
 */
const toSheet = (name: string, data: unknown[][]): ContactsSheet => {
    const rows: SheetRow[] = data
        .map((cells, index) => ({ row: index + 1, cells: cells.map(toCell) }))
        .filter(r => r.cells.some(cell => !isEmptyCell(cell)));
    const [header, ...body] = rows;
    return { name, header: header?.cells.map(cell => (cell === null ? '' : String(cell))) ?? [], rows: body };
};

/** El texto de un CSV: UTF-8 si lo es; si no, el Windows-1252 con el que guarda Excel en español. */
const decodeCsv = (buffer: ArrayBuffer) => {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
        return new TextDecoder('windows-1252').decode(buffer);
    }
};

const readCsv = async (file: File): Promise<ContactsSheet> => {
    const [{ default: Papa }, buffer] = await Promise.all([import('papaparse'), file.arrayBuffer()]);
    // Papa adivina el separador: «,» o el «;» del Excel en español.
    const { data } = Papa.parse<string[]>(decodeCsv(buffer), { skipEmptyLines: false });
    return toSheet(file.name, data);
};

const readXlsx = async (file: File): Promise<ContactsSheet[]> => {
    const { default: readExcelFile } = await import('read-excel-file/browser');
    try {
        const sheets = await readExcelFile(file);
        return sheets.map(({ sheet, data }) => toSheet(sheet, data));
    } catch (error) {
        // Un .xls renombrado a .xlsx también llega aquí.
        if ((error as { code?: string }).code === 'XLS_FILE_NOT_SUPPORTED') throw new ContactsFileError('xls');
        throw new ContactsFileError('unreadable');
    }
};

/** Lee el archivo entero en el navegador: no se sube nada hasta la vista previa. */
export const readContactsFile = async (file: File): Promise<ContactsFile> => {
    const extension = fileExtension(file.name);
    if (extension === 'xls') throw new ContactsFileError('xls');
    if (extension === 'xlsx') return { name: file.name, sheets: await readXlsx(file) };
    if (extension === 'csv' || file.type === 'text/csv') {
        try {
            return { name: file.name, sheets: [await readCsv(file)] };
        } catch {
            throw new ContactsFileError('unreadable');
        }
    }
    throw new ContactsFileError('unsupported');
};

/** Lo que acepta el selector de archivos. */
export const CONTACTS_FILE_ACCEPT = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
