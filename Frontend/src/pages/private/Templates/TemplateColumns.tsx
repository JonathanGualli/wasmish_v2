import { type ColumnDef } from "@tanstack/react-table";
import type { Template } from "../../../models/template.model";

/** Píldora de estado. Tintes sólidos del manual, no opacidades. */
const STATUS: Record<string, { label: string; className: string }> = {
    APPROVED: { label: "Aprobada",  className: "bg-brand-accent-soft text-brand-accent-strong" },
    PENDING:  { label: "Pendiente", className: "bg-brand-warning-soft text-brand-warning" },
    REJECTED: { label: "Rechazada", className: "bg-brand-danger-soft text-brand-danger" },
    REJECT:   { label: "Rechazada", className: "bg-brand-danger-soft text-brand-danger" },
};

const LANGUAGES: Record<string, string> = {
    es: "Español",
    en: "Inglés",
    en_US: "Inglés",
    pt_BR: "Portugués",
};

export const templateColumns: ColumnDef<Template>[] = [
    {
        accessorKey: "name",
        header: "Nombre",
        // El nombre es el identificador que el usuario copia a su llamada a la
        // API: va en mono, como manda la regla de datos del manual.
        cell: ({ row }) => (
            <div
                className="max-w-[220px] truncate font-mono text-[13px] font-medium text-brand-text"
                title={row.original.name}
            >
                {row.original.name}
            </div>
        ),
    },
    {
        accessorKey: "templateId",
        header: "ID",
        cell: ({ row }) => (
            <span className="font-mono text-[12px] text-brand-subtle tabular-nums">
                {row.original.templateId}
            </span>
        ),
    },
    {
        accessorKey: "bodyText",
        header: "Cuerpo del mensaje",
        cell: ({ row }) => (
            <div className="max-w-[340px] truncate text-brand-muted" title={row.original.bodyText}>
                {row.original.bodyText}
            </div>
        ),
    },
    {
        accessorKey: "language",
        header: "Idioma",
        cell: ({ row }) => (
            <span className="text-brand-muted whitespace-nowrap">
                {LANGUAGES[row.original.language] || row.original.language}
            </span>
        ),
    },
    {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => {
            const s = STATUS[row.original.status];
            return (
                <span className={`inline-flex items-center rounded-full px-2.5 py-1
                    text-[11px] font-bold uppercase tracking-[0.05em] whitespace-nowrap
                    ${s?.className ?? "bg-brand-raised text-brand-muted"}`}>
                    {s?.label ?? row.original.status}
                </span>
            );
        },
    },
];
