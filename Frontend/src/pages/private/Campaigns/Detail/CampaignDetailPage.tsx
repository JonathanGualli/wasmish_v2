import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, ChevronLeft, FlaskConical, Info, Pause, Play, XCircle } from "lucide-react";
import { PageShell } from "../../../../components/Page/PageShell";
import { BlankState } from "../../../../components/BlankState/BlankState";
import { Callout } from "../../../../components/Callout/Callout";
import { CustomButton } from "../../../../components/Button/Button";
import { ConfirmDialog } from "../../../../components/Dialog/ConfirmDialog";
import { DataTable } from "../../../../components/DataTable/DataTable";
import { CategoryPill } from "../../../../components/Chat/TemplateFields";
import { useModalContext } from "../../../../components/Modal/context/UseModalContext";
import {
    campaignErrors, useCampaign, useCampaignFailures, useCampaignMutations, useCampaignRecipients,
} from "../../../../hooks/useCampaigns";
import { CampaignPaths, ChatsPath, SettingsPath, TemplatesPath } from "../../../../models/routes.models";
import type { Campaign, CampaignRecipient, RecipientState } from "../../../../models/campaign.model";
import type { ChatsNavigationState } from "../../../../models/conversation.mode";
import type { PillTone } from "../../../../components/Pill/Pill";
import {
    RECIPIENT_STATE, campaignProgress, formatDateTime, formatTimeAgo, isCampaignActive, pauseReasonTarget, pluralize,
    recipientStateCounts,
} from "../../../../utils/campaignDisplay";
import { CampaignStatusPill } from "../CampaignCells";
import { CampaignFunnel, CampaignMetrics, CampaignProgressCard, FailureReasons } from "./CampaignStatsBlocks";
import { recipientColumns } from "./RecipientColumns";
import { RecipientMobileRow } from "./RecipientCells";

const FIRST_PAGE = { pageIndex: 0, pageSize: 20 };
// El punto de color de cada filtro: el mismo que la píldora de ese estado.
const TONE_DOT: Record<PillTone, string> = {
    positive: 'bg-brand-success',
    info: 'bg-brand-info',
    warning: 'bg-brand-warning',
    danger: 'bg-brand-danger',
    neutral: 'bg-brand-subtle',
    outline: 'bg-brand-border-strong',
};

const STATE_ORDER: RecipientState[] = ['pending', 'sent', 'delivered', 'read', 'failed', 'skipped', 'cancelled', 'interrupted'];

/** Creado en modo de prueba: que nadie lea «Enviado» como «llegó». */
const DryRunNotice = () => (
    <Callout icon={<FlaskConical size={16} />} title="Envío de prueba: nada llegó a WhatsApp.">
        Se creó con el modo de prueba del servidor (<span className="font-mono">CAMPAIGN_DRY_RUN</span>), que no llama a Meta:
        los mensajes quedan como enviados y solo se simula el rechazo de quien pidió no recibir publicidad.
    </Callout>
);

/** Por qué está pausado o cancelado, y qué hacer. */
const StatusNotice = ({ campaign }: { campaign: Campaign }) => {
    if (campaign.status === 'paused' && campaign.pauseReason) {
        const target = pauseReasonTarget(campaign.pauseReason.code);
        const link = target && (
            <Link to={target === 'settings' ? SettingsPath : TemplatesPath} className="text-[13px] font-semibold text-brand-accent-strong hover:underline">
                {target === 'settings' ? 'Ir a Ajustes' : 'Ir a Plantillas'}
            </Link>
        );
        return (
            <Callout tone="warning" icon={<AlertTriangle size={16} />} title="Se pausó solo." action={link}>
                {campaign.pauseReason.message} Cuando esté arreglado, pulsa «Reanudar»: ningún pendiente se perdió.
            </Callout>
        );
    }
    if (campaign.status === 'paused') {
        return <Callout icon={<Info size={16} />} title="Pausado por ti." />;
    }
    if (campaign.status === 'cancelled' && campaign.finishedAt) {
        return (
            <Callout icon={<Info size={16} />} title={`Lo cancelaste el ${formatDateTime(campaign.finishedAt)}.`}>
                {campaign.stats.cancelled > 0 && `Los ${pluralize(campaign.stats.cancelled, 'destinatario', 'destinatarios')} que faltaban no se enviaron.`}
            </Callout>
        );
    }
    return null;
};

/**
 * El detalle de un envío: cómo va, qué pasó con cada destinatario y por qué
 * falló lo que falló. Se actualiza solo por SSE mientras avanza, y también
 * después: las entregas y lecturas llegan durante horas.
 */
export const CampaignDetailPage = () => {
    const { id = null } = useParams();
    const navigate = useNavigate();
    const [stateFilter, setStateFilter] = useState<RecipientState | null>(null);
    const [pagination, setPagination] = useState(FIRST_PAGE);
    const [confirmingCancel, setConfirmingCancel] = useState(false);

    const { data: campaign, isError, dataUpdatedAt, refetch } = useCampaign(id);
    const recipients = useCampaignRecipients(id, stateFilter, pagination.pageIndex, pagination.pageSize);
    const { data: failureReasons } = useCampaignFailures(id, (campaign?.stats.failed ?? 0) > 0);
    const { pause, resume, cancel } = useCampaignMutations();
    const { setState: showNotice, setContent: setNoticeContent } = useModalContext();

    const notifyError = (err: unknown) => {
        setNoticeContent(<p className="text-sm text-brand-danger">{campaignErrors(err)[0].message}</p>);
        showNotice(true);
    };

    if (isError && !campaign) {
        return (
            <PageShell width="wide">
                <BlankState
                    tone="danger"
                    icon={<AlertCircle size={22} />}
                    title="No encontramos este envío"
                    action={<CustomButton variant="outline" onClick={() => navigate(CampaignPaths.list)}>Volver a Envíos</CustomButton>}
                >
                    Puede que la dirección esté mal o que no sea de tu cuenta.
                </BlankState>
            </PageShell>
        );
    }
    if (!campaign || !id) {
        return <PageShell width="wide"><div className="h-40" /></PageShell>;
    }

    const { stats } = campaign;
    const counts = recipientStateCounts(stats);
    const active = isCampaignActive(campaign.status);
    const canPause = campaign.status === 'queued' || campaign.status === 'sending';
    const progress = campaignProgress(stats);

    const changeFilter = (state: RecipientState | null) => {
        setStateFilter(state);
        setPagination(p => ({ ...p, pageIndex: 0 }));
    };
    const openChat = (recipient: CampaignRecipient) => {
        if (!recipient.conversationId) return;
        const state: ChatsNavigationState = { conversationId: recipient.conversationId };
        navigate(ChatsPath, { state });
    };
    const confirmCancel = () => cancel.mutate(id, {
        onSuccess: () => setConfirmingCancel(false),
        onError: (err) => {
            setConfirmingCancel(false);
            notifyError(err);
        },
    });

    const chips = [
        { state: null, label: 'Todos', count: stats.total, dot: null },
        ...STATE_ORDER.filter(s => counts[s] > 0).map(s => ({
            state: s, label: RECIPIENT_STATE[s].plural, count: counts[s], dot: TONE_DOT[RECIPIENT_STATE[s].tone],
        })),
    ];

    return (
        <PageShell width="wide">
            <Link to={CampaignPaths.list} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-accent-strong hover:underline">
                <ChevronLeft size={15} />Envíos
            </Link>

            <header className="mt-3.5 mb-6 flex flex-col md:flex-row md:items-start gap-4">
                <div className="min-w-0 flex-1 grid gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-[26px] sm:text-[30px] font-bold tracking-[-0.03em] leading-tight text-brand-text">{campaign.name}</h1>
                        <CampaignStatusPill campaign={campaign} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-brand-muted">
                        <span className="font-mono text-brand-strong">{campaign.template.name}</span>
                        <CategoryPill category={campaign.template.category} />
                        <span>·</span>
                        <span className="font-mono text-brand-strong">{formatDateTime(campaign.createdAt)}</span>
                    </div>
                </div>

                {active ? (
                    <div className="flex gap-2 flex-none">
                        <div className="h-10 flex-1">
                            {canPause ? (
                                <CustomButton variant="outline" onClick={() => pause.mutate(id, { onError: notifyError })} isLoading={pause.isPending}>
                                    <Pause size={15} />Pausar
                                </CustomButton>
                            ) : (
                                <CustomButton onClick={() => resume.mutate(id, { onError: notifyError })} isLoading={resume.isPending}>
                                    <Play size={14} />Reanudar
                                </CustomButton>
                            )}
                        </div>
                        <div className="h-10">
                            <CustomButton variant="ghost" onClick={() => setConfirmingCancel(true)}>
                                <span className="text-brand-danger">Cancelar</span>
                            </CustomButton>
                        </div>
                    </div>
                ) : (
                    <p className="md:text-right text-[12.5px] leading-[1.5] text-brand-muted flex-none">
                        Actualizado <span className="font-mono">{formatTimeAgo(dataUpdatedAt)}</span>
                        <button type="button" onClick={() => refetch()} className="ml-1.5 font-semibold text-brand-accent-strong cursor-pointer hover:underline">
                            Actualizar
                        </button>
                        <br />Entregas y lecturas siguen llegando durante horas.
                    </p>
                )}
            </header>

            <div className="grid gap-4">
                {campaign.dryRun && <DryRunNotice />}
                <StatusNotice campaign={campaign} />
                {active && <CampaignProgressCard campaign={campaign} />}
                <CampaignMetrics campaign={campaign} />

                {stats.sent > 0 && (
                    <div className={`grid gap-4 ${stats.failed > 0 ? 'lg:grid-cols-2' : ''}`}>
                        <CampaignFunnel campaign={campaign} />
                        {stats.failed > 0 && failureReasons && <FailureReasons reasons={failureReasons} interrupted={stats.interrupted} />}
                    </div>
                )}

                <div className="flex flex-wrap gap-1.5 mt-2" role="tablist" aria-label="Filtrar por estado">
                    {chips.map(chip => (
                        <button
                            key={chip.label}
                            type="button"
                            role="tab"
                            aria-selected={stateFilter === chip.state}
                            onClick={() => changeFilter(chip.state)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer
                                ${stateFilter === chip.state
                                    ? 'bg-brand-accent-soft text-brand-accent-strong'
                                    : 'bg-brand-raised text-brand-gray-600 hover:text-brand-text'}`}
                        >
                            {chip.dot && <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} aria-hidden />}
                            {chip.label} <span className="font-mono font-medium opacity-75">{chip.count.toLocaleString('es-EC')}</span>
                        </button>
                    ))}
                </div>

                <DataTable
                    data={recipients.data?.recipients ?? []}
                    columns={recipientColumns}
                    totalCount={recipients.data?.totalCount ?? 0}
                    pagination={pagination}
                    setPagination={setPagination}
                    isLoading={recipients.isLoading || recipients.isPlaceholderData}
                    getRowId={recipient => recipient.id}
                    onRowClick={openChat}
                    renderMobileRow={recipient => <RecipientMobileRow recipient={recipient} />}
                />
            </div>

            <ConfirmDialog
                open={confirmingCancel}
                tone="danger"
                icon={<XCircle size={19} />}
                title={`¿Cancelar «${campaign.name}»?`}
                description={`Los ${pluralize(stats.pending, 'pendiente', 'pendientes')} no se enviarán. ${progress.done > 0
                    ? `Los ${progress.done.toLocaleString('es-EC')} ya procesados no se pueden deshacer.`
                    : ''}`}
                cancelLabel="Seguir enviando"
                confirmLabel={`Cancelar ${pluralize(stats.pending, 'pendiente', 'pendientes')}`}
                isLoading={cancel.isPending}
                onConfirm={confirmCancel}
                onCancel={() => setConfirmingCancel(false)}
            />
        </PageShell>
    );
};
