/** Una celda tal como se lee del archivo. Las fechas y los sí/no ya vienen como texto. */
export type CellValue = string | number | null;

/** Una fila del archivo, con su número de fila (el de Excel: la 1 suele ser la cabecera). */
export interface SheetRow {
    row: number;
    cells: CellValue[];
}

/** Una hoja del archivo: la cabecera y las filas con algo escrito. */
export interface ContactsSheet {
    name: string;
    header: string[];
    rows: SheetRow[];
}

/** El archivo leído en el navegador. Un CSV tiene una sola hoja. */
export interface ContactsFile {
    name: string;
    sheets: ContactsSheet[];
}

/** Los datos de Wasmish a los que se puede llevar una columna. */
export type ImportFieldKey = 'phone' | 'name' | 'lastName' | 'email' | 'company' | 'tags' | 'notes';

/** De qué columna sale cada dato (`null` = no se usa) y si lo emparejó Wasmish solo. */
export type ColumnMapping = Record<ImportFieldKey, { column: number | null; auto: boolean }>;

/** Una fila ya emparejada, como la pide el backend. */
export type ImportRow = { row: number } & Partial<Record<ImportFieldKey, CellValue>>;

export interface ImportInput {
    rows: ImportRow[];
    /** El país de los números que vienen sin código (ISO: EC, CO…). */
    country: string;
    /** «Etiquetas para todos». */
    extraTagNames: string[];
}

export interface ImportIssue {
    row: number;
    type: 'error' | 'warning';
    /** El dato que lo causó: la pantalla enseña su valor al lado del motivo. */
    field: ImportFieldKey;
    message: string;
}

export interface ImportSummary {
    rows: number;
    create: number;
    update: number;
    unchanged: number;
    /** Las filas que se juntaron con otra del mismo teléfono. */
    duplicates: number;
    errors: number;
    /** Filas con algún aviso. */
    warnings: number;
    /** Los que ya existían y están de baja de publicidad. */
    optedOutExisting: number;
}

/** Los datos de texto de un contacto que trae el archivo. */
export type ImportContactFields = Partial<Record<'name' | 'email' | 'company' | 'notes', string>>;

/** Un contacto de ejemplo para «Así quedarán». */
export interface ImportSampleEntry {
    action: 'create' | 'update';
    phone: string;
    rows: number[];
    /** Lo que se le pone (a uno existente, solo lo que le faltaba). */
    fields: ImportContactFields;
    tagNames: string[];
    /** Lo que el archivo trae distinto de lo que ya tiene: no se aplica. */
    ignored: ImportContactFields;
    /** Lo que ya tiene, si existe. */
    current: { name: string | null; email: string | null; company: string | null; tagNames: string[] } | null;
}

export interface ImportPreview {
    summary: ImportSummary;
    issues: ImportIssue[];
    sample: ImportSampleEntry[];
    /** Las filas de cada contacto: las de un mismo teléfono van juntas en la misma tanda. */
    rowGroups: number[][];
}

/** Lo que devuelve una tanda de la importación. */
export interface ImportBatchResult {
    summary: ImportSummary & { created: number; updated: number; unchanged: number };
    contactIds: string[];
}
