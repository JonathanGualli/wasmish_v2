import type { ColumnDef } from "@tanstack/react-table";
import type { AdminClient } from "../../../models/admin.model";

const formatDate = (value: string | null) => {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric'});
}

const formatRelative = (value: string | null) => {
    if (!value) return '—';
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 1)  return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24)   return `hace ${hours} h`;
    return `hace ${Math.round(hours / 24)} d`;
}

export const adminClientColumns: ColumnDef<AdminClient>[] = [
    {
        header: 'Cliente',
        accessorKey: 'name',
        cell: ({ row }) => (
            <div className="flex flex-col">
                <span className="font-medium text-brand-text">{row.original.name}</span>
                <span className="text-xs text-brand-subtle">{row.original.email}</span>
            </div>
        ),
    },
    {
        header: 'WhatsApp',
        accessorKey: 'whatsappConnected',
        cell: ({ row }) => (
            row.original.whatsappConnected ? (
                <div className="flex flex-col gap-1">
                    <span className="w-fit rounded-full bg-brand-accent/10 px-2 py-0.5 text-xs font-medium text-brand-accent-strong">
                        Conectado
                    </span>
                    <span className="text-xs text-brand-subtle tabular-nums">WABA {row.original.waBusinessId}</span>
                </div>
            ) : (
                <span className="w-fit rounded-full bg-brand-raised px-2 py-0.5 text-xs font-medium text-brand-muted">
                    Sin conectar
                </span>
            )
        ),
    },
    {
        header: 'Convs',
        accessorKey: 'conversations',
        cell: ({ row }) => <span className="tabular-nums">{row.original.conversations}</span>,
    },
    {
        header: 'Mensajes',
        accessorKey: 'messages',
        cell: ({ row }) => <span className="tabular-nums">{row.original.messages.toLocaleString('es-EC')}</span>,
    },
    {
        header: 'Fallidos',
        accessorKey: 'failed',
        cell: ({ row }) => (
            <span className={`tabular-nums ${row.original.failed > 0 ? 'font-medium text-brand-danger' : 'text-brand-muted'}`}>
                {row.original.failed}
            </span>
        ),
    },
    {
        header: 'Últ. actividad',
        accessorKey: 'lastActivityAt',
        cell: ({ row }) => <span className="text-brand-muted">{formatRelative(row.original.lastActivityAt)}</span>,
    },
    {
        header: 'Alta',
        accessorKey: 'createdAt',
        cell: ({ row }) => <span className="text-brand-muted">{formatDate(row.original.createdAt)}</span>,
    },
];
