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
            <div className="flex flex-col min-w-0">
                <span className="font-semibold text-brand-text truncate">{row.original.name}</span>
                <span className="text-[13px] text-brand-muted truncate">{row.original.email}</span>
            </div>
        ),
    },
    {
        header: 'WhatsApp',
        accessorKey: 'whatsappConnected',
        cell: ({ row }) => (
            row.original.whatsappConnected ? (
                <div className="flex flex-col gap-1.5">
                    <span className="w-fit rounded-full bg-brand-accent-soft px-2.5 py-1
                        text-[11px] font-bold uppercase tracking-[0.05em] text-brand-accent-strong">
                        Conectado
                    </span>
                    <span className="font-mono text-[12px] text-brand-subtle tabular-nums">
                        WABA {row.original.waBusinessId}
                    </span>
                </div>
            ) : (
                <span className="w-fit rounded-full bg-brand-raised px-2.5 py-1
                    text-[11px] font-bold uppercase tracking-[0.05em] text-brand-muted">
                    Sin conectar
                </span>
            )
        ),
    },
    {
        header: 'Convs',
        accessorKey: 'conversations',
        cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{row.original.conversations}</span>,
    },
    {
        header: 'Mensajes',
        accessorKey: 'messages',
        cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{row.original.messages.toLocaleString('es-EC')}</span>,
    },
    {
        header: 'Fallidos',
        accessorKey: 'failed',
        cell: ({ row }) => (
            <span className={`font-mono text-[13px] tabular-nums ${row.original.failed > 0 ? 'font-bold text-brand-danger' : 'text-brand-subtle'}`}>
                {row.original.failed}
            </span>
        ),
    },
    {
        header: 'Últ. actividad',
        accessorKey: 'lastActivityAt',
        cell: ({ row }) => <span className="text-brand-muted whitespace-nowrap">{formatRelative(row.original.lastActivityAt)}</span>,
    },
    {
        header: 'Alta',
        accessorKey: 'createdAt',
        cell: ({ row }) => <span className="text-brand-muted whitespace-nowrap">{formatDate(row.original.createdAt)}</span>,
    },
];
