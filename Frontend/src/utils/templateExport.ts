import type { Cell, Row } from 'write-excel-file/browser';
import type { Line } from '../models/line.model';
import type { Template, TemplatesUsage, TemplateUsage } from '../models/template.model';
import { lineLabel } from './lineDisplay';
import { headerMediaRule } from './templateHeader';
import {
    categoryLabel, languageName, rejectionReasonWords, templateButtonDetails, templateQualityWords,
    templateStatusWords, templateVariables,
} from './templateDisplay';

// ---------------------------------------------------------------------------
// Exportar las plantillas a Excel (spec «Exportar las plantillas a Excel»,
// § 5): una fila por plantilla con sus datos de Meta y su uso, con las mismas
// palabras que la pantalla. Solo arma las filas; el archivo lo escribe
// `write-excel-file` en `useTemplatesExport`.
// ---------------------------------------------------------------------------

const NO_USAGE: TemplateUsage = { sent: 0, delivered: 0, read: 0, failed: 0, lastSentAt: null };
const DATE_FORMAT = 'dd/mm/yyyy hh:mm';
const WIDE = 50;

/** Una columna: su cabecera, su ancho en caracteres y la celda de cada plantilla. */
interface ExportColumn {
    header: string;
    width: number;
    cell: (template: Template, usage: TemplateUsage, context: ExportContext) => Cell;
}

interface ExportContext {
    campaigns?: Record<string, number>;
    lines: Line[];
}

/**
 * Todo texto con `type: String`: aunque empiece por «=» (un cuerpo de Meta
 * puede), Excel lo enseña tal cual y no lo toma por una fórmula.
 */
const text = (value: string | null | undefined, { wrap = false } = {}): Cell =>
    value ? { value, type: String, ...(wrap && { wrap: true, alignVertical: 'top' as const }) } : null;

const number = (value: number): Cell => ({ value, type: Number });

/**
 * Excel no guarda zona horaria y la librería escribe la hora UTC: se corre a
 * la hora local, para que el archivo diga la misma hora que la pantalla.
 */
const date = (iso: string | null | undefined): Cell => {
    if (!iso) return null;
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;
    return { value: new Date(at.getTime() - at.getTimezoneOffset() * 60_000), type: Date, format: DATE_FORMAT };
};

const headerKind = (template: Template) =>
    headerMediaRule(template)?.title ?? (template.header?.format === 'TEXT' ? 'Texto' : null);

const headerFile = (template: Template) => {
    if (!headerMediaRule(template)) return null;
    return template.headerMedia ? template.headerMedia.filename ?? 'Guardado' : 'Falta';
};

// Con dónde está cada una: el {{1}} de un botón no es el {{1}} del cuerpo.
const variablesText = (template: Template) =>
    templateVariables(template).map(({ key, example, where }) => `${where}: ${key} = ${example ?? 'sin ejemplo'}`).join('\n');

const buttonsText = (template: Template) =>
    templateButtonDetails(template.buttons)
        .map(({ type, text: label, dest, destVariable }) => `${type}: ${label}${dest ? ` → ${dest}${destVariable ?? ''}` : ''}`)
        .join('\n');

/** Las líneas conectadas de su WABA, las mismas que enseña la columna «Líneas». */
const linesText = (template: Template, lines: Line[]) =>
    lines.filter(line => line.status === 'active' && line.waBusinessId === template.waBusinessId).map(lineLabel).join(', ');

const COLUMNS: ExportColumn[] = [
    { header: 'Nombre', width: 28, cell: t => text(t.name) },
    { header: 'Idioma', width: 18, cell: t => text(languageName(t.language)) },
    { header: 'Categoría', width: 14, cell: t => text(categoryLabel(t.category)) },
    { header: 'Categoría anterior', width: 14, cell: t => text(categoryLabel(t.previousCategory)) },
    { header: 'Estado', width: 20, cell: t => text(templateStatusWords(t).label) },
    {
        header: 'Calidad', width: 16,
        cell: (t, usage) => {
            const label = templateQualityWords(t, { neverSent: usage.sent === 0 }).label;
            return text(label === '—' ? null : label);
        },
    },
    { header: 'Motivo del rechazo', width: 30, cell: t => text(rejectionReasonWords(t)) },
    { header: 'Borrada en Meta', width: 17, cell: t => date(t.deletedInMetaAt) },
    { header: 'Cabecera', width: 12, cell: t => text(headerKind(t)) },
    { header: 'Texto de la cabecera', width: 30, cell: t => text(t.header?.format === 'TEXT' ? t.header.text : null, { wrap: true }) },
    { header: 'Archivo de la cabecera', width: 24, cell: t => text(headerFile(t)) },
    { header: 'Cuerpo', width: WIDE, cell: t => text(t.bodyText, { wrap: true }) },
    { header: 'Pie', width: 30, cell: t => text(t.footerText, { wrap: true }) },
    { header: 'Variables', width: 30, cell: t => text(variablesText(t), { wrap: true }) },
    { header: 'Botones', width: 40, cell: t => text(buttonsText(t), { wrap: true }) },
    { header: 'Líneas', width: 24, cell: (t, _usage, { lines }) => text(linesText(t, lines)) },
    { header: 'Envíos', width: 10, cell: (_t, usage) => number(usage.sent) },
    { header: 'Entregados', width: 11, cell: (_t, usage) => number(usage.delivered) },
    { header: 'Leídos', width: 10, cell: (_t, usage) => number(usage.read) },
    { header: 'Fallidos', width: 10, cell: (_t, usage) => number(usage.failed) },
    { header: 'Último envío', width: 17, cell: (_t, usage) => date(usage.lastSentAt) },
    { header: 'Campañas', width: 11, cell: (t, _usage, { campaigns }) => number(campaigns?.[t.templateId] ?? 0) },
    { header: 'Última modificación en Meta', width: 17, cell: t => date(t.metaUpdatedAt) },
    { header: 'ID de Meta', width: 20, cell: t => text(t.templateId) },
];

// «Campañas» solo le sale a quien tiene `campaigns.manage` (el backend no le
// manda `campaigns` a los demás).
const columnsFor = (withCampaigns: boolean) =>
    withCampaigns ? COLUMNS : COLUMNS.filter(column => column.header !== 'Campañas');

/** Los anchos de las columnas, en caracteres, en el orden de `templateExportRows`. */
export const templateExportColumns = (withCampaigns: boolean) =>
    columnsFor(withCampaigns).map(({ width }) => ({ width }));

/**
 * Las filas del Excel: la cabecera en negrita y una fila por plantilla, en el
 * orden recibido (el de la tabla con sus filtros). Un dato que falta va vacío.
 */
export const templateExportRows = (templates: Template[], data: TemplatesUsage, lines: Line[]): Row[] => {
    const columns = columnsFor(data.campaigns !== undefined);
    const context: ExportContext = { campaigns: data.campaigns, lines };
    const header: Row = columns.map(({ header: value }) => ({ value, type: String, fontWeight: 'bold' }));
    return [
        header,
        ...templates.map(template => {
            const usage = data.usage[template.templateId] ?? NO_USAGE;
            return columns.map(column => column.cell(template, usage, context));
        }),
    ];
};

/** `plantillas-wasmish-2026-11-09.xlsx`, con la fecha local. */
export const templateExportFileName = (now: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `plantillas-wasmish-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.xlsx`;
};
