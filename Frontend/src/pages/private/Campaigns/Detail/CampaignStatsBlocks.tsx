import type { Campaign, FailureReason } from "../../../../models/campaign.model";
import { ProgressBar } from "../../../../components/ProgressBar/ProgressBar";
import { MetricGrid, type Metric } from "../../../../components/MetricGrid/MetricGrid";
import { campaignProgress, failureLabel, formatDuration, pluralize } from "../../../../utils/campaignDisplay";

const Label = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">{children}</div>
);

const formatCount = (n: number) => n.toLocaleString('es-EC');

const progressNote = (campaign: Campaign) => {
    switch (campaign.status) {
        case 'queued':
            return 'Empieza cuando termine la campaña anterior de tu cuenta.';
        case 'paused':
            return `Los ${formatCount(campaign.stats.pending)} pendientes esperan; al reanudar sigue donde quedó.`;
        default:
            return campaign.estimatedSecondsLeft
                ? `Faltan ${formatDuration(campaign.estimatedSecondsLeft)} · puedes cerrar la pantalla, la campaña sigue.`
                : 'Puedes cerrar la pantalla, la campaña sigue.';
    }
};

/** Cuánto lleva una campaña que todavía avanza, y qué esperar. */
export const CampaignProgressCard = ({ campaign }: { campaign: Campaign }) => {
    const { done, total, percent } = campaignProgress(campaign.stats);
    const note = progressNote(campaign);

    return (
        <div className="border border-brand-border rounded-xl px-[18px] py-3.5 grid gap-2.5">
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2.5">
                <span className="text-sm text-brand-muted">
                    <span className="font-mono text-lg font-semibold tabular-nums text-brand-text">{formatCount(done)}</span> de{' '}
                    <span className="font-mono text-lg font-semibold tabular-nums text-brand-text">{formatCount(total)}</span> procesados
                </span>
                <span className="sm:ml-auto text-[13px] text-brand-muted">{note}</span>
            </div>
            <ProgressBar percent={percent} active={campaign.status === 'sending'} size="md" />
        </div>
    );
};

/** Las cifras de la campaña. Cada una con su aclaración, porque «enviado» y «entregado» no son lo mismo. */
export const CampaignMetrics = ({ campaign }: { campaign: Campaign }) => {
    const { stats } = campaign;
    const metrics: Metric[] = [
        { label: 'Destinatarios', value: stats.total, note: 'total' },
        { label: 'Enviados', value: stats.sent, note: 'Meta los aceptó' },
        { label: 'Entregados', value: stats.delivered, note: 'en el teléfono', tone: stats.delivered > 0 ? 'info' : undefined },
        { label: 'Leídos', value: stats.read, note: 'doble check azul', tone: stats.read > 0 ? 'success' : undefined },
        {
            label: 'Fallidos', value: stats.failed, tone: stats.failed > 0 ? 'danger' : undefined,
            note: stats.interrupted > 0 ? `+${formatCount(stats.interrupted)} interrumpidos` : 'con motivo',
        },
        { label: 'Omitidos', value: stats.skipped, note: 'baja o borrados' },
    ];
    if (stats.cancelled > 0) metrics.push({ label: 'Cancelados', value: stats.cancelled, note: 'no se enviaron', tone: 'muted' });
    else if (stats.pending > 0) metrics.push({ label: 'Pendientes', value: stats.pending, note: 'en cola', tone: 'muted' });

    return <MetricGrid metrics={metrics} columns="grid-cols-2 sm:grid-cols-4 lg:grid-flow-col lg:auto-cols-fr" />;
};

/** De los enviados, cuántos llegaron y cuántos se leyeron. */
export const CampaignFunnel = ({ campaign }: { campaign: Campaign }) => {
    const { sent, delivered, read } = campaign.stats;
    const bars = [
        { label: 'Enviados', value: sent, color: 'bg-brand-deep' },
        { label: 'Entregados', value: delivered, color: 'bg-brand-info' },
        { label: 'Leídos', value: read, color: 'bg-brand-success' },
    ];
    return (
        <div className="border border-brand-border rounded-xl px-[18px] py-3.5 grid gap-2.5 content-start">
            <Label>De enviados a leídos</Label>
            {bars.map(b => {
                const percent = sent > 0 ? Math.round((b.value / sent) * 100) : 0;
                return (
                    <div key={b.label} className="grid grid-cols-[84px_minmax(0,1fr)_100px] gap-3 items-center">
                        <span className="text-[13px] text-brand-strong">{b.label}</span>
                        <div className="h-[18px] bg-brand-bg rounded overflow-hidden">
                            <div className={`h-full rounded ${b.color}`} style={{ width: `${percent}%` }} />
                        </div>
                        <span className="text-xs text-brand-muted text-right">
                            <span className="font-mono text-[13px] font-semibold text-brand-text">{formatCount(b.value)}</span>
                            {' · '}<span className="font-mono">{percent}%</span>
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

/** Los fallidos agrupados por motivo, del más frecuente al menos. */
export const FailureReasons = ({ reasons, interrupted }: { reasons: FailureReason[]; interrupted: number }) => (
    <div className="border border-brand-border rounded-xl px-[18px] py-3.5 grid gap-2 content-start">
        <Label>Por qué fallaron</Label>
        {reasons.map(r => (
            <div key={r.code ?? 'none'} className="flex gap-2.5 items-baseline">
                <span className="w-7 flex-none text-right font-mono text-[13px] font-semibold text-brand-danger">{formatCount(r.count)}</span>
                <span className="flex-1 min-w-0 text-[13px] leading-[1.45] text-brand-strong">{failureLabel(r.code, r.detail)}</span>
                {r.code && <span className="flex-none font-mono text-[11px] text-brand-subtle">{r.code}</span>}
            </div>
        ))}
        {interrupted > 0 && (
            <p className="mt-0.5 pt-2 border-t border-brand-bg text-[12.5px] leading-[1.45] text-brand-muted">
                Además, {pluralize(interrupted, 'interrumpido', 'interrumpidos')}: no se sabe si llegaron y no se reintentan para no duplicar.
            </p>
        )}
    </div>
);
