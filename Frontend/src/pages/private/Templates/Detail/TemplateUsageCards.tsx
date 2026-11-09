import { Link } from "react-router-dom";
import { ChevronRight, Send } from "lucide-react";
import { MetricGrid, MetricGridSkeleton } from "../../../../components/MetricGrid/MetricGrid";
import { Pill } from "../../../../components/Pill/Pill";
import type { AccountRole } from "../../../../models/user.mode";
import type { Template, TemplateCampaign, TemplateUsage } from "../../../../models/template.model";
import { CampaignPaths } from "../../../../models/routes.models";
import { CAMPAIGN_STATUS, isCampaignActive } from "../../../../utils/campaignDisplay";
import { formatActivityTime, formatDayLabel, formatShortDate } from "../../../../utils/formatChatTime";
import { usageSegments, type UsageSegment } from "../../../../utils/templateDisplay";
import { DetailCard } from "./TemplateDetailCards";

const METRIC_COLUMNS = 'grid-cols-2 sm:grid-cols-4';
const METRIC_LABELS = ['Enviados', 'Entregados', 'Leídos', 'Fallidos'];

const SEGMENT_COLOR: Record<UsageSegment['key'], string> = {
    read: 'bg-brand-success',
    delivered: 'bg-brand-info',
    unconfirmed: 'bg-brand-border-strong',
    failed: 'bg-brand-danger',
};

/**
 * De quién es el uso: owner y admin ven toda la cuenta; el supervisor, sus
 * líneas; el agente, además, solo sus conversaciones y las sin asignar
 * (`conversationScope` del backend). Que no parezca el total si no lo es.
 */
const usageScope = (role?: AccountRole) => {
    if (role === 'agent') return { title: 'Tu uso', sub: 'En tus líneas y tus conversaciones; no es el total de la cuenta.' };
    if (role === 'supervisor') return { title: 'Tu uso', sub: 'En tus líneas; no es el total de la cuenta.' };
    return { title: 'Uso', sub: 'Desde siempre, en toda la cuenta.' };
};

const emptyText = (template: Template) => {
    if (template.deletedInMetaAt) return 'Y ya no se podrá: se borró en Meta.';
    if (template.status !== 'APPROVED') return 'Y no se podrá hasta que WhatsApp la apruebe.';
    return 'Cuando se envíe desde un chat, una campaña o la API, aquí verás cuántos mensajes llegaron y cuántos se leyeron.';
};

/** «Hoy · 10:14», «Ayer · 17:52» o «12 may 2026, 09:31». */
const lastSentLabel = (iso: string) => {
    const day = formatDayLabel(iso);
    if (day === 'Hoy' || day === 'Ayer') return formatActivityTime(iso);
    const d = new Date(iso);
    return `${formatShortDate(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const roundPercent = (percent: number) => (percent > 0 && percent < 1 ? '<1 %' : `${Math.round(percent)} %`);

/** Cuántas veces se envió y cómo le fue; mientras llega, la forma de las cifras. */
export const TemplateUsageCard = ({ template, usage, role, failed, onRetry }: {
    template: Template;
    /** `undefined` mientras llega. */
    usage?: TemplateUsage;
    role?: AccountRole;
    /** No se pudo traer el detalle (se enseña lo de la lista). */
    failed: boolean;
    onRetry: () => void;
}) => {
    const { title, sub } = usageScope(role);
    const has = Boolean(usage && usage.sent > 0);
    const segments = usage ? usageSegments(usage) : [];
    return (
        <DetailCard label={title} extra={<>
            {sub && (has || !usage) && <span className="text-[12.5px] text-brand-muted">{sub}</span>}
            {has && usage?.lastSentAt && (
                <span className="sm:ml-auto text-[12.5px] text-brand-muted">
                    Último envío <span className="font-mono text-brand-strong">{lastSentLabel(usage.lastSentAt)}</span>
                </span>
            )}
        </>}>
            {!usage && failed && (
                <p className="text-[13px] text-brand-muted">
                    No se pudo traer el uso.{' '}
                    <button type="button" onClick={onRetry} className="font-semibold text-brand-accent-strong hover:underline cursor-pointer">Reintentar</button>
                </p>
            )}
            {!usage && !failed && <>
                <MetricGridSkeleton labels={METRIC_LABELS} columns={METRIC_COLUMNS} />
                <span aria-hidden className="h-3.5 rounded bg-brand-bg" />
            </>}
            {usage && has && <>
                <MetricGrid columns={METRIC_COLUMNS} metrics={[
                    { label: 'Enviados', value: usage.sent, note: 'Meta los aceptó' },
                    { label: 'Entregados', value: usage.delivered, note: 'en el teléfono, con los leídos', tone: 'info' },
                    { label: 'Leídos', value: usage.read, note: 'doble check azul', tone: 'success' },
                    { label: 'Fallidos', value: usage.failed, note: 'no llegaron', tone: usage.failed > 0 ? 'danger' : undefined },
                ]} />
                <div className="grid gap-2">
                    <div className="flex h-3 sm:h-3.5 rounded overflow-hidden gap-0.5" aria-hidden>
                        {segments.map(s => <span key={s.key} className={SEGMENT_COLOR[s.key]} style={{ width: `${s.percent}%` }} />)}
                    </div>
                    <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-xs text-brand-strong">
                        {segments.map(s => (
                            <span key={s.key} className="flex items-center gap-1.5">
                                <span className={`w-2.5 h-2.5 rounded-[3px] ${SEGMENT_COLOR[s.key]}`} />
                                {s.label} <span className="font-mono text-brand-muted">{roundPercent(s.percent)}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </>}
            {usage && !has && (
                <div className="flex gap-3.5 items-center p-[18px] border border-dashed border-brand-border-strong rounded-[10px]">
                    <span className="w-[38px] h-[38px] rounded-[10px] bg-brand-raised text-brand-muted flex items-center justify-center flex-none">
                        <Send size={18} />
                    </span>
                    <div className="min-w-0">
                        <div className="text-[14.5px] font-semibold text-brand-text">Todavía no se ha enviado</div>
                        <div className="text-[13px] leading-[1.55] text-brand-muted mt-0.5 text-pretty">{emptyText(template)}</div>
                    </div>
                </div>
            )}
        </DetailCard>
    );
};

/** Las campañas que la usaron, con el enlace a cada una. Solo con `campaigns.manage`. */
export const TemplateCampaignsCard = ({ template, campaigns }: { template: Template; campaigns?: TemplateCampaign[] }) => {
    if (!campaigns?.length) return null;
    return (
        <DetailCard label="Campañas que la usaron" flush extra={
            <span className="font-mono text-xs text-brand-muted">{campaigns.length}</span>
        }>
            {campaigns.map(c => {
                const status = CAMPAIGN_STATUS[c.status];
                // Una campaña activa con una plantilla borrada la manda igual, y Meta la rechaza.
                const willFail = Boolean(template.deletedInMetaAt) && isCampaignActive(c.status);
                return (
                    <Link key={c.id} to={CampaignPaths.detail(c.id)}
                        className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_120px_132px_14px] gap-x-3.5 gap-y-0.5
                            items-center px-3.5 sm:px-[18px] py-[11px] min-h-14 border-t border-brand-raised hover:bg-brand-bg transition-colors">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-brand-accent-strong truncate">{c.name}</div>
                            {willFail && <div className="text-[12.5px] text-brand-danger mt-0.5">Va a fallar: su plantilla ya no está en Meta.</div>}
                            <div className="sm:hidden font-mono text-[11.5px] text-brand-muted mt-0.5">{formatShortDate(c.createdAt)}</div>
                        </div>
                        <div><Pill tone={status?.tone ?? 'neutral'}>{status?.label ?? c.status}</Pill></div>
                        <span className="hidden sm:block font-mono text-[12.5px] text-brand-strong">{formatShortDate(c.createdAt)}</span>
                        <ChevronRight size={14} className="hidden sm:block text-brand-subtle" />
                    </Link>
                );
            })}
        </DetailCard>
    );
};
