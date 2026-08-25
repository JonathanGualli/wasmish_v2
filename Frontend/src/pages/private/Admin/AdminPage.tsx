import { useState, type ReactNode } from "react";
import { Users, ShieldCheck, MessageSquare, AlertTriangle } from "lucide-react";
import { DataTable } from "../../../components/DataTable/DataTable";
import { PageShell, PageHeader, SectionTitle } from "../../../components/Page/PageShell";
import { adminClientColumns } from "./AdminColumns";
import { useAdminClients, useAdminStats } from "../../../hooks/useAdmin";

interface StatTileProps {
    label: string;
    value: string;
    icon: ReactNode;
    tone?: 'default' | 'accent' | 'danger';
}

/**
 * Cifra de cabecera. El valor va en mono con `tabular-nums`: son números para
 * comparar entre sí, y la regla de datos del manual pide mono para eso.
 */
const StatTile = ({ label, value, icon, tone = 'default' }: StatTileProps) => {
    const valueTone =
        tone === 'accent' ? 'text-brand-accent-strong'
      : tone === 'danger' ? 'text-brand-danger'
      : 'text-brand-text';

    return (
        <div className="rounded-xl border border-brand-border bg-brand-surface p-5">
            <div className="flex items-center gap-2 text-brand-muted">
                <span className="flex-none">{icon}</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">{label}</span>
            </div>
            <p className={`mt-3 font-mono text-[28px] font-bold leading-none tabular-nums ${valueTone}`}>
                {value}
            </p>
        </div>
    );
};

export const AdminPage = () => {
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

    const { data: stats, isLoading: statsLoading } = useAdminStats();
    const { data: clientsPage, isLoading: clientsLoading } =
        useAdminClients(pagination.pageIndex, pagination.pageSize);

    const tile = (value?: number) =>
        statsLoading || value === undefined ? '—' : value.toLocaleString('es-EC');

    return (
        <PageShell width="wide">
            <PageHeader
                icon={<ShieldCheck size={20} />}
                title="Administración"
                description="Estado de la plataforma y actividad de cada cliente. Solo visible para el operador del SaaS."
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
                <StatTile label="Clientes"     value={tile(stats?.totalClients)}     icon={<Users size={16} />} />
                <StatTile label="Con WhatsApp" value={tile(stats?.connectedClients)} icon={<ShieldCheck size={16} />}   tone="accent" />
                <StatTile label="Mensajes 7d"  value={tile(stats?.messages7d)}       icon={<MessageSquare size={16} />} />
                <StatTile label="Fallidos 7d"  value={tile(stats?.failed7d)}         icon={<AlertTriangle size={16} />} tone="danger" />
            </div>

            <SectionTitle description="Cada fila resume la actividad acumulada del cliente.">
                Clientes
            </SectionTitle>
            <DataTable
                data={clientsPage?.clients ?? []}
                columns={adminClientColumns}
                totalCount={clientsPage?.totalCount ?? 0}
                pagination={pagination}
                setPagination={setPagination}
                isLoading={clientsLoading}
            />
        </PageShell>
    );
};
