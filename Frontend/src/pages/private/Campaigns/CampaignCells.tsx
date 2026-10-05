import type { ReactNode } from "react";
import { Check, Pause } from "lucide-react";
import type { Campaign, CampaignStatus } from "../../../models/campaign.model";
import { Pill } from "../../../components/Pill/Pill";
import { ProgressBar } from "../../../components/ProgressBar/ProgressBar";
import { CAMPAIGN_STATUS, campaignProgress, isCampaignActive } from "../../../utils/campaignDisplay";

const Count = ({ value, danger = false }: { value: number; danger?: boolean }) => (
    <span className={`font-mono text-[13px] font-semibold tabular-nums ${danger ? 'text-brand-danger' : 'text-brand-text'}`}>
        {value.toLocaleString('es-EC')}
    </span>
);

const PROGRESS_NOTE: Partial<Record<CampaignStatus, string>> = {
    queued: ' · empieza al terminar el anterior',
    cancelled: ' · el resto no se envió',
};

/** «230 de 441», con la barra si la campaña todavía avanza. */
export const CampaignProgressCell = ({ campaign }: { campaign: Campaign }) => {
    const { done, total, percent } = campaignProgress(campaign.stats);
    const active = isCampaignActive(campaign.status);
    const note = PROGRESS_NOTE[campaign.status] ?? '';

    return (
        <div className="grid gap-1.5 min-w-[150px]">
            {active && <ProgressBar percent={percent} active={campaign.status === 'sending'} />}
            <span className="text-xs text-brand-muted">
                <span className="font-mono tabular-nums text-brand-strong">{done.toLocaleString('es-EC')}</span> de{' '}
                <span className="font-mono tabular-nums text-brand-strong">{total.toLocaleString('es-EC')}</span>{note}
            </span>
        </div>
    );
};

export const CampaignResults = ({ campaign }: { campaign: Campaign }) => (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-brand-muted whitespace-nowrap">
        <span><Count value={campaign.stats.delivered} /> entregados</span>
        <span><Count value={campaign.stats.read} /> leídos</span>
        <span><Count value={campaign.stats.failed} danger={campaign.stats.failed > 0} /> fallidos</span>
    </div>
);

/** Un punto que late: la campaña está saliendo ahora mismo. */
const LiveDot = () => (
    <span className="relative flex w-1.5 h-1.5" aria-hidden>
        <span className="absolute inset-0 rounded-full bg-brand-info animate-ping" />
        <span className="relative w-1.5 h-1.5 rounded-full bg-brand-info" />
    </span>
);

const STATUS_ICON: Partial<Record<CampaignStatus, ReactNode>> = {
    sending: <LiveDot />,
    paused: <Pause size={11} strokeWidth={3} aria-hidden />,
    completed: <Check size={12} strokeWidth={3} aria-hidden />,
};

/** El estado y, si se creó en modo de prueba, «Prueba»: nada llegó a WhatsApp. */
export const CampaignStatusPill = ({ campaign }: { campaign: Campaign }) => {
    const { label, tone } = CAMPAIGN_STATUS[campaign.status];
    return (
        <span className="inline-flex flex-wrap gap-1.5">
            <Pill tone={tone} icon={STATUS_ICON[campaign.status]}>{label}</Pill>
            {campaign.dryRun && <Pill tone="neutral">Prueba</Pill>}
        </span>
    );
};
