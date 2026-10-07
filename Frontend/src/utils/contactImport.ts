import type {
    CellValue, ColumnMapping, ContactsFile, ContactsSheet, ImportContactFields, ImportFieldKey, ImportIssue, ImportRow,
    ImportSampleEntry, ImportSummary,
} from '../models/contactImport.model';
import { DEFAULT_COUNTRY, isCountryCode, type CountryCode } from './phoneCountry';
import { pluralize } from './campaignDisplay';

/** El máximo de filas de un archivo: el mismo que el backend (`IMPORT_MAX_ROWS`). */
export const IMPORT_MAX_ROWS = 10_000;

/**
 * Filas por tanda. El backend admite 500; con tandas más chicas la barra de
 * progreso avanza más fino y un corte de conexión hace repetir menos.
 */
export const IMPORT_BATCH_SIZE = 200;

/** Lo más largo que admite el backend en una celda; lo que pase de ahí se recorta antes de mandarlo. */
const MAX_CELL_LENGTH = 5000;

interface ImportField {
    key: ImportFieldKey;
    label: string;
    /** La aclaración bajo el nombre: «obligatorio», «se junta al nombre». */
    note?: string;
    required?: boolean;
    /** Cabeceras que son este dato, tal cual (sin mayúsculas ni tildes). */
    synonyms: string[];
    /** Palabras que, sueltas dentro de una cabecera, lo delatan: «Teléfono celular». */
    keywords: string[];
}

/** Los datos de un contacto que se pueden importar, en el orden en que se enseñan. */
export const IMPORT_FIELDS: readonly ImportField[] = [
    {
        key: 'phone', label: 'Teléfono', note: 'obligatorio', required: true,
        synonyms: ['telefono', 'telefonos', 'celular', 'movil', 'whatsapp', 'numero', 'telf', 'tel', 'cel', 'phone', 'mobile'],
        keywords: ['telefono', 'celular', 'movil', 'whatsapp'],
    },
    {
        key: 'name', label: 'Nombre',
        synonyms: ['nombre', 'nombres', 'nombre completo', 'nombres y apellidos', 'nombre y apellido', 'cliente', 'contacto', 'name'],
        keywords: ['nombre', 'nombres'],
    },
    {
        key: 'lastName', label: 'Apellido', note: 'se junta al nombre',
        synonyms: ['apellido', 'apellidos', 'last name', 'surname'],
        keywords: ['apellido', 'apellidos'],
    },
    {
        key: 'email', label: 'Email',
        synonyms: ['email', 'e mail', 'mail', 'correo', 'correo electronico'],
        keywords: ['email', 'correo'],
    },
    {
        key: 'company', label: 'Empresa',
        synonyms: ['empresa', 'razon social', 'compania', 'negocio', 'organizacion', 'company'],
        keywords: ['empresa', 'negocio'],
    },
    {
        key: 'tags', label: 'Etiquetas', note: 'separadas por comas',
        synonyms: ['etiquetas', 'etiqueta', 'grupo', 'grupos', 'segmento', 'categoria', 'tags'],
        keywords: ['etiquetas', 'etiqueta'],
    },
    {
        key: 'notes', label: 'Notas',
        synonyms: ['notas', 'nota', 'observaciones', 'observacion', 'comentarios', 'comentario', 'notes'],
        keywords: ['notas', 'observaciones'],
    },
];

export const IMPORT_FIELD_LABEL = Object.fromEntries(IMPORT_FIELDS.map(f => [f.key, f.label])) as Record<ImportFieldKey, string>;

// --- Celdas y columnas -------------------------------------------------------

/** Una celda como texto, para enseñarla. */
export const cellText = (value: CellValue | undefined) => (value === null || value === undefined ? '' : String(value));

export const isEmptyCell = (value: CellValue | undefined) => cellText(value).trim() === '';

/** «A», «B»… «AA»: como las llama Excel. */
const columnLetter = (index: number) => {
    let letters = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    return letters;
};

/** El nombre de una columna; sin cabecera, su letra: «Columna C». */
export const columnLabel = (sheet: ContactsSheet, index: number) => sheet.header[index]?.trim() || `Columna ${columnLetter(index)}`;

/** Las columnas con algo: cabecera o algún dato. Las que están vacías del todo no cuentan. */
export const usedColumns = (sheet: ContactsSheet) => {
    const width = Math.max(sheet.header.length, ...sheet.rows.map(r => r.cells.length));
    return Array.from({ length: width }, (_, i) => i)
        .filter(i => !isEmptyCell(sheet.header[i]) || sheet.rows.some(r => !isEmptyCell(r.cells[i])));
};

/** Los primeros valores de una columna, para que se vea si es la que se quería. */
export const columnExamples = (sheet: ContactsSheet, column: number, count = 3) =>
    sheet.rows.map(r => cellText(r.cells[column]).trim()).filter(Boolean).slice(0, count);

/** La hoja «Contactos» de la plantilla, si el archivo la tiene. */
export const templateSheet = (file: ContactsFile) => file.sheets.find(s => normalizeHeader(s.name) === 'contactos');

/** La hoja que se usa al abrir el archivo: la de la plantilla o, si no, la primera que tenga filas. */
export const preferredSheetName = (file: ContactsFile) =>
    (templateSheet(file) ?? file.sheets.find(s => s.rows.length > 0) ?? file.sheets[0]).name;

// --- Emparejar columnas ------------------------------------------------------

/** Sin mayúsculas, tildes ni signos: «Teléfono (celular)» → «telefono celular». */
const normalizeHeader = (text: string) =>
    text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const emptyMapping = (): ColumnMapping =>
    Object.fromEntries(IMPORT_FIELDS.map(f => [f.key, { column: null, auto: false }])) as ColumnMapping;

/**
 * A qué dato va cada columna, por el nombre de la cabecera. Primero las que
 * se llaman igual que un sinónimo; luego las que contienen una palabra que
 * delata un solo dato. «Nombre de la empresa» tiene dos («nombre» y
 * «empresa») y se queda sin emparejar: mejor elegirla a mano que adivinar mal.
 */
export const guessColumnMapping = (header: string[]): ColumnMapping => {
    const mapping = emptyMapping();
    const normalized = header.map(h => normalizeHeader(h ?? ''));
    const taken = new Set<number>();
    const assign = (key: ImportFieldKey, column: number) => {
        mapping[key] = { column, auto: true };
        taken.add(column);
    };

    for (const field of IMPORT_FIELDS) {
        const column = normalized.findIndex((h, i) => !taken.has(i) && field.synonyms.includes(h));
        if (column >= 0) assign(field.key, column);
    }
    normalized.forEach((h, column) => {
        if (!h || taken.has(column)) return;
        const words = h.split(' ');
        const matching = IMPORT_FIELDS.filter(f => f.keywords.some(k => words.includes(k)));
        if (matching.length === 1 && mapping[matching[0].key].column === null) assign(matching[0].key, column);
    });
    return mapping;
};

/** Lleva una columna a un dato. Una columna va a un solo dato: si otro la tenía, se la quita. */
export const assignColumn = (mapping: ColumnMapping, key: ImportFieldKey, column: number | null): ColumnMapping => {
    const next = { ...mapping };
    if (column !== null) {
        for (const field of IMPORT_FIELDS) {
            if (next[field.key].column === column) next[field.key] = { column: null, auto: false };
        }
    }
    next[key] = { column, auto: false };
    return next;
};

/** Las columnas del archivo que no van a ningún dato. */
export const unusedColumns = (sheet: ContactsSheet, mapping: ColumnMapping) => {
    const mapped = new Set(Object.values(mapping).map(m => m.column));
    return usedColumns(sheet).filter(i => !mapped.has(i));
};

// --- Filas y tandas ----------------------------------------------------------

const toRowValue = (value: CellValue) => (typeof value === 'string' ? value.slice(0, MAX_CELL_LENGTH) : value);

/** Las filas del archivo emparejadas a los datos de Wasmish, como las pide el backend. */
export const buildImportRows = (sheet: ContactsSheet, mapping: ColumnMapping): ImportRow[] =>
    sheet.rows.map(({ row, cells }) => {
        const importRow: ImportRow = { row };
        for (const field of IMPORT_FIELDS) {
            const column = mapping[field.key].column;
            if (column !== null && !isEmptyCell(cells[column])) importRow[field.key] = toRowValue(cells[column]);
        }
        return importRow;
    });

/**
 * Las tandas de la importación, como números de fila. Las filas de un mismo
 * teléfono (un grupo) van siempre en la misma tanda. Un teléfono repetido en
 * más filas que una tanda entera se queda con las primeras: de las demás solo
 * se usaría lo que estas no traen.
 */
export const packRowGroups = (groups: number[][], size: number) => {
    const batches: number[][] = [];
    let current: number[] = [];
    for (const group of groups) {
        const rows = group.slice(0, size);
        if (current.length + rows.length > size) {
            batches.push(current);
            current = [];
        }
        current.push(...rows);
    }
    if (current.length > 0) batches.push(current);
    return batches;
};

// --- Filas con error, para corregirlas ---------------------------------------

/**
 * Una celda de CSV. Lo que empieza por = + - @ lleva un ' delante: Excel lo
 * tomaría por una fórmula. El backend entiende un teléfono con el ' delante,
 * así que el archivo corregido se puede volver a importar tal cual.
 */
const csvCell = (value: CellValue | undefined) => {
    const text = cellText(value);
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * Las filas con error, con todas las columnas del archivo y una más con el
 * motivo. Separado por «;» y con BOM, que es lo que abre bien el Excel en
 * español (con «,» lo pone todo en una columna, y sin BOM rompe las tildes).
 */
export const errorRowsCsv = (sheet: ContactsSheet, issues: ImportIssue[]) => {
    const reasons = new Map<number, string[]>();
    for (const issue of issues.filter(i => i.type === 'error')) {
        reasons.set(issue.row, [...(reasons.get(issue.row) ?? []), `${IMPORT_FIELD_LABEL[issue.field]}: ${issue.message}`]);
    }
    const width = Math.max(sheet.header.length, ...sheet.rows.map(r => r.cells.length));
    const pad = (cells: CellValue[]) => Array.from({ length: width }, (_, i) => cells[i] ?? null);
    const lines = [
        [...pad(sheet.header), 'Errores'],
        ...sheet.rows.filter(r => reasons.has(r.row)).map(r => [...pad(r.cells), reasons.get(r.row)!.join(' ')]),
    ];
    return `\uFEFF${lines.map(cells => cells.map(csvCell).join(';')).join('\r\n')}`;
};

/** «clientes.xlsx» → «clientes-errores.csv». */
export const errorFileName = (fileName: string) => `${fileName.replace(/\.[^.]+$/, '')}-errores.csv`;

// --- El país, recordado ------------------------------------------------------

// Fuera de los borradores a propósito: es una preferencia, no un dato del
// archivo, y cerrar sesión no la tiene que olvidar.
const COUNTRY_KEY = 'wasmish:import-country';

export const loadImportCountry = (): CountryCode => {
    try {
        const saved = localStorage.getItem(COUNTRY_KEY);
        return isCountryCode(saved) ? saved : DEFAULT_COUNTRY;
    } catch {
        return DEFAULT_COUNTRY;
    }
};

export const saveImportCountry = (country: CountryCode) => {
    try {
        localStorage.setItem(COUNTRY_KEY, country);
    } catch { /* sin storage: la próxima vez vuelve a Ecuador */ }
};

// --- Textos ------------------------------------------------------------------

/** «el nombre», «el email»… para las frases de la muestra. */
const FIELD_THE: Record<keyof ImportContactFields, string> = {
    name: 'el nombre', email: 'el email', company: 'la empresa', notes: 'la nota',
};

/** «a», «a y b», «a, b y c». */
const joinWithAnd = (parts: string[]) =>
    parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;

/**
 * La explicación bajo un contacto de ejemplo: lo que trae el archivo y no se
 * aplica, lo que se le añade a uno existente y los avisos de sus filas.
 */
export const sampleNote = (entry: ImportSampleEntry, issues: ImportIssue[]) => {
    const sentences: string[] = [];
    for (const [field, value] of Object.entries(entry.ignored) as [keyof ImportContactFields, string][]) {
        if (field !== 'notes') sentences.push(`En el archivo: «${value}». Se queda ${FIELD_THE[field]} que ya tiene.`);
    }
    if (entry.action === 'update') {
        const added = (Object.keys(entry.fields) as (keyof ImportContactFields)[]).map(f => FIELD_THE[f]);
        if (entry.tagNames.length === 1) added.push(`la etiqueta ${entry.tagNames[0]}`);
        if (entry.tagNames.length > 1) added.push(`${entry.tagNames.length} etiquetas`);
        if (added.length > 0) sentences.push(`Se le añade ${joinWithAnd(added)}.`);
    }
    issues
        .filter(i => i.type === 'warning' && entry.rows.includes(i.row))
        .forEach(i => sentences.push(`Fila ${i.row}: ${i.message}`));
    return sentences.join(' ');
};

/** Por qué no hay nada que importar: todos ya están completos, o tienen error. */
export const nothingToImportText = ({ unchanged, errors }: ImportSummary) => {
    const parts = [
        unchanged > 0 && (unchanged === 1
            ? 'El contacto del archivo ya está en Wasmish con todo lo que trae'
            : `Los ${unchanged.toLocaleString('es-EC')} contactos del archivo ya están en Wasmish con todo lo que trae`),
        errors > 0 && (unchanged > 0
            ? `${errors === 1 ? 'la fila restante tiene' : `las ${errors.toLocaleString('es-EC')} filas restantes tienen`} error`
            : `${errors === 1 ? 'La única fila tiene' : `Las ${errors.toLocaleString('es-EC')} filas tienen`} error`),
    ].filter(Boolean) as string[];
    const fix = errors === 0 ? '' : errors === 1 ? ' Corrígela y vuelve a intentarlo.' : ' Corrígelas y vuelve a intentarlo.';
    return `${parts.join(', y ')}.${fix}`;
};

/** «1 327 filas · 7 columnas». */
export const sheetSize = (sheet: ContactsSheet) =>
    `${pluralize(sheet.rows.length, 'fila', 'filas')} · ${pluralize(usedColumns(sheet).length, 'columna', 'columnas')}`;
