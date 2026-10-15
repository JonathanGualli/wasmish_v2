import type { ColumnDef } from "@tanstack/react-table";
import { MessageSquare } from "lucide-react";
import type { CampaignRecipient } from "../../../../models/campaign.model";
import { recipientTime } from "../../../../utils/campaignDisplay";
import { RecipientContact, RecipientState } from "./RecipientCells";

/** La fila de carga en el móvil (`RecipientMobileRow`: nombre, hora y estado). */
export const recipientMobileSkeleton = { trailing: 'time', pills: 1 } as const;

export const recipientColumns: ColumnDef<CampaignRecipient>[] = [
    { id: 'contact', header: 'Contacto', meta: { skeleton: 'title' }, cell: ({ row }) => <RecipientContact recipient={row.original} /> },
    { id: 'state', header: 'Estado del mensaje', meta: { skeleton: 'pill' }, cell: ({ row }) => <RecipientState recipient={row.original} /> },
    {
        id: 'time',
        header: 'Hora',
        meta: { skeleton: 'line' },
        cell: ({ row }) => <span className="font-mono text-xs text-brand-gray-600 tabular-nums">{recipientTime(row.original)}</span>,
    },
    {
        id: 'chat',
        header: '',
        meta: { skeleton: 'none' },
        cell: ({ row }) => row.original.conversationId && (
            <span title="Abrir la conversación" className="text-brand-subtle"><MessageSquare size={16} /></span>
        ),
    },
];
