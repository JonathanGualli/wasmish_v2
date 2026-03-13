import { type ColumnDef } from "@tanstack/react-table";
import type { Template } from "../../../models/template.model";

export const templateColumns: ColumnDef<Template>[] = [
    {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }) => {
            const value = row.original.name;
            return (
                <div className="max-w-[200px] truncate font-bold text-blue-600" title={value}>{value}</div>
            );
        } 
    },
    {
        accessorKey: "templateId",
        header: "Plantilla ID",
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
                pt_BR: "Portugues",
            }
            return labels[lang] || lang
        }
    },
    {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => {
            const status = row.original.status;
            const labels: Record<string, string> = {
                "APPROVED": "Aprobado",
                "REJECT": "Rechazado",
            }
            return labels[status] || status
        }
    },
]