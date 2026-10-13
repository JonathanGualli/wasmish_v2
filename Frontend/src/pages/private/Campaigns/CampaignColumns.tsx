import type { ColumnDef } from "@tanstack/react-table";
import type { Campaign } from "../../../models/campaign.model";
import { formatDateTime } from "../../../utils/campaignDisplay";
import { CampaignProgressCell, CampaignResults, CampaignStatusPill } from "./CampaignCells";
import { LineChip } from "../../../components/Line/LineChip";

const lineColumn: ColumnDef<Campaign> = {
    id: 'line',
    header: 'Línea',
    cell: ({ row }) => <LineChip lineId={row.original.lineId} wide />,
};

/** Las columnas de la lista; la de la línea, solo con más de una (`showLines`). */
export const campaignColumns = (showLines: boolean): ColumnDef<Campaign>[] => [
    {
        id: 'name',
        header: 'Campaña',
        cell: ({ row }) => (
            <div className="min-w-0">
                <div className="max-w-[280px] truncate text-sm font-semibold text-brand-text">{row.original.name}</div>
                <div className="font-mono text-[11.5px] text-brand-muted truncate mt-0.5">{row.original.template.name}</div>
            </div>
        ),
    },
    ...(showLines ? [lineColumn] : []),
    {
        id: 'date',
        header: 'Fecha',
        cell: ({ row }) => (
            <span className="font-mono text-xs text-brand-gray-600 tabular-nums whitespace-nowrap">
                {formatDateTime(row.original.createdAt)}
            </span>
        ),
    },
    { id: 'status', header: 'Estado', cell: ({ row }) => <CampaignStatusPill campaign={row.original} /> },
    { id: 'progress', header: 'Progreso', cell: ({ row }) => <CampaignProgressCell campaign={row.original} /> },
    { id: 'results', header: 'Resultados', cell: ({ row }) => <CampaignResults campaign={row.original} /> },
];
