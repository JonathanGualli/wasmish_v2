import { type ColumnDef } from "@tanstack/react-table";
import type { Template } from "../../../models/template.model";

export const templateColumns: ColumnDef<Template>[] = [
    {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }) => {
            const value = row.original.name;
            return (
                <div className="max-w-[200px] truncate font-bold text-brand-accent-strong" title={value}>{value}</div>
            );
        }
    },
    {
        accessorKey: "templateId",
        header: "Plantilla ID",
        cell: ({ row }) => (
            <span className="text-brand-muted">{row.original.templateId}</span>
        ),
    },
    {
        accessorKey: "bodyText",
        header: "Descripción",
        cell: ({ row }) => {
            const value = row.original.bodyText;
            return (
                <div
                className="max-w-[300px] truncate"
                title={value}
                >
                {value}
                </div>
            );
        }
    },
    {
        accessorKey: "language",
        header: "Idioma",
        cell: ({ row }) => {
            const lang = row.original.language;
            const labels: Record<string, string> = {
                es: "Español",
                en: "Ingles",
                en_US: "Ingles",
                pt_BR: "Portugues",
            }
            return <span className="text-brand-muted">{labels[lang] || lang}</span>
        }
    },
    {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => {
            const status = row.original.status;
            const labels: Record<string, string> = {
                "APPROVED": "Aprobado",
                "PENDING": "Pendiente",
                "REJECTED": "Rechazado",
                "REJECT": "Rechazado",
            }
            const styles: Record<string, string> = {
                "APPROVED": "bg-brand-accent/10 text-brand-accent-strong",
                "PENDING": "bg-brand-indigo/10 text-brand-indigo",
                "REJECTED": "bg-brand-danger/10 text-brand-danger",
                "REJECT": "bg-brand-danger/10 text-brand-danger",
            }
            return (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || "bg-brand-raised text-brand-muted"}`}>
                    {labels[status] || status}
                </span>
            );
        }
    },
]
