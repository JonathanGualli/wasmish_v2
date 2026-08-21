import { useState, type ReactNode } from "react";
import { Users, ShieldCheck, MessageSquare, AlertTriangle } from "lucide-react";
import { DataTable } from "../../../components/DataTable/DataTable";
import { adminClientColumns } from "./AdminColumns";
import { useAdminClients, useAdminStats } from "../../../hooks/useAdmin";

interface StatTileProps {
    label: string;
    value: string;
    icon: ReactNode;
    tone?: 'default' | 'accent' | 'danger';
}

const StatTile = ({ label, value, icon, tone = 'default' }: StatTileProps) => {
    const valueTone =
        tone === 'accent' ? 'text-brand-accent-strong'
      : tone === 'danger' ? 'text-brand-danger'
      : 'text-brand-text';

    return (
        <div className="rounded-xl border border-brand-border bg-brand-surface p-4 shadow-sm">
            <div className="flex items-center gap-2 text-brand-muted">
                {icon}
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
            </div>
            <p className={`mt-2 text-2xl font-bold tabular-nums ${valueTone}`}>{value}</p>
        </div>
    );
}

export const AdminPage = () => {

    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

    const { data: stats, isLoading: statsLoading } = useAdminStats();
    const { data: clientsPage, isLoading: clientsLoading } = useAdminClients(pagination.pageIndex, pagination.pageSize);

    const tile = (value?: number) =>
        statsLoading || value === undefined ? '—' : value.toLocaleString('es-EC');

    return (
        <div className="m-6 flex flex-col gap-6">

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Clientes"      value={tile(stats?.totalClients)}     icon={<Users size={16} />} />
                <StatTile label="Con WhatsApp"  value={tile(stats?.connectedClients)} icon={<ShieldCheck size={16} />}    tone="accent" />
                <StatTile label="Mensajes 7d"   value={tile(stats?.messages7d)}       icon={<MessageSquare size={16} />} />
                <StatTile label="Fallidos 7d"   value={tile(stats?.failed7d)}         icon={<AlertTriangle size={16} />}  tone="danger" />
            </div>

            <div className="rounded-xl border border-brand-border bg-brand-surface p-6 shadow">
                <h1 className="mb-5 text-xl font-semibold text-brand-text">Clientes</h1>
                <DataTable
                    data={clientsPage?.clients ?? []}
                    columns={adminClientColumns}
                    totalCount={clientsPage?.totalCount ?? 0}
                    pagination={pagination}
                    setPagination={setPagination}
                    isLoading={clientsLoading}
                />
            </div>

        </div>
    );
}
