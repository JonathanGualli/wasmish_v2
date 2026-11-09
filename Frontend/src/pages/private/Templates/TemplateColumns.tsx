import { type ColumnDef } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import { CategoryPill } from "../../../components/Chat/TemplateFields";
import type { Template } from "../../../models/template.model";
import { languageName } from "../../../utils/templateDisplay";
import { StopRowClick, TemplateNameCell, TemplateStatusPill } from "./TemplateCells";
import { TemplateHeaderCell } from "./TemplateHeaderCell";
import { TemplateLinesCell } from "./TemplateLinesCell";

export const templateColumns: ColumnDef<Template>[] = [
    {
        accessorKey: "name",
        header: "Nombre",
        meta: { skeleton: 'title' },
        cell: ({ row }) => <TemplateNameCell template={row.original} />,
    },
    {
        accessorKey: "category",
        header: "Categoría",
        meta: { skeleton: 'pill' },
        cell: ({ row }) => <CategoryPill category={row.original.category} />,
    },
    {
        accessorKey: "bodyText",
        // El título puede partirse: si no, es él quien fija el ancho de la columna.
        header: () => <span className="whitespace-normal">Cuerpo del mensaje</span>,
        meta: { skeleton: 'title' },
        // Dos líneas: lo bastante para reconocerla, y la fila no crece.
        cell: ({ row }) => (
            <div className="min-w-[130px] max-w-[420px] text-[13.5px] leading-[1.45] text-brand-muted line-clamp-2 [overflow-wrap:anywhere]" title={row.original.bodyText}>
                {row.original.bodyText}
            </div>
        ),
    },
    {
        id: "header",
        header: "Cabecera",
        meta: { skeleton: 'line' },
        cell: ({ row }) => <StopRowClick><TemplateHeaderCell template={row.original} /></StopRowClick>,
    },
    {
        accessorKey: "language",
        header: "Idioma",
        meta: { skeleton: 'line' },
        cell: ({ row }) => <span className="text-[13.5px] text-brand-muted whitespace-nowrap">{languageName(row.original.language)}</span>,
    },
    {
        accessorKey: "status",
        header: "Estado",
        meta: { skeleton: 'pill' },
        // La flecha va con el estado: una columna propia se comía 32 px de relleno.
        cell: ({ row }) => (
            <div className="flex items-center justify-between gap-3">
                <TemplateStatusPill template={row.original} />
                <ChevronRight size={14} className="flex-none text-brand-subtle" />
            </div>
        ),
    },
];

/** La columna de las líneas, tras el nombre: solo con más de una conectada (`hasManyLines`). */
export const templateLinesColumn: ColumnDef<Template> = {
    id: "lines",
    header: "Se envía desde",
    meta: { skeleton: 'pill' },
    cell: ({ row }) => <TemplateLinesCell template={row.original} />,
};
