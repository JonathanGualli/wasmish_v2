import { Link, useLocation, useParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, ChevronLeft, Copy, ExternalLink, Info, Loader2, RefreshCw } from "lucide-react";
import { PageShell } from "../../../../components/Page/PageShell";
import { Callout } from "../../../../components/Callout/Callout";
import { BlankState } from "../../../../components/BlankState/BlankState";
import { CustomButton } from "../../../../components/Button/Button";
import { LineChip } from "../../../../components/Line/LineChip";
import { SkeletonLine, SkeletonBox } from "../../../../components/Skeleton/Skeleton";
import { SkeletonStatus } from "../../../../components/Skeleton/SkeletonFrame";
import { useNotice } from "../../../../components/Notice/context/useNotice";
import { useAuthContext } from "../../../../context/auth.context";
import { useLines } from "../../../../hooks/useLines";
import { useTemplateDetail } from "../../../../hooks/useTemplateDetail";
import { parseError, useTemplates } from "../../../../hooks/useTemplates";
import { TemplatesPath } from "../../../../models/routes.models";
import type { Template } from "../../../../models/template.model";
import { formatTimeAgo } from "../../../../utils/formatChatTime";
import { isTemplateSyncStale, metaTemplatesUrl, templateNotices, type TemplateNotice } from "../../../../utils/templateDisplay";
import {
    TemplateButtonsCard, TemplateFactStrip, TemplateHeaderFileCard, TemplatePreviewCard, TemplateVariablesCard,
} from "./TemplateDetailCards";
import { TemplateCampaignsCard, TemplateUsageCard } from "./TemplateUsageCards";

/** De dónde se llegó, para volver: `state.from` (el detalle de una campaña) o Plantillas. */
export interface TemplateDetailNavigationState {
    from?: { label: string; to: string };
}

const backFrom = (state: unknown) => {
    const from = (state as TemplateDetailNavigationState | null)?.from;
    return from ? { ...from, fromCampaign: true } : { label: 'Plantillas', to: TemplatesPath, fromCampaign: false };
};

const BackLink = ({ to, label }: { to: string; label: string }) => (
    <Link to={to} className="inline-flex items-center gap-1 min-h-8 text-[13px] font-semibold text-brand-accent-strong hover:underline">
        <ChevronLeft size={15} />{label}
    </Link>
);

const CopyButton = ({ value, label, done, size }: { value: string; label: string; done: string; size: 'lg' | 'sm' }) => {
    const { notify } = useNotice();
    const copy = () => navigator.clipboard.writeText(value).then(
        () => notify({ kind: 'success', text: done }),
        () => notify({ kind: 'error', text: 'No se pudo copiar.' }),
    );
    return (
        <button type="button" onClick={copy} title={label} aria-label={label}
            className={size === 'lg'
                ? 'w-11 h-11 sm:w-[30px] sm:h-[30px] flex-none rounded-[8px] text-brand-muted hover:bg-brand-raised hover:text-brand-text flex items-center justify-center cursor-pointer transition-colors'
                : 'flex text-brand-subtle hover:text-brand-text cursor-pointer transition-colors'}>
            <Copy size={size === 'lg' ? 15 : 13} />
        </button>
    );
};

const NOTICE_ICON: Record<TemplateNotice['tone'], React.ReactNode> = {
    info: <Info size={16} />,
    neutral: <Info size={16} />,
    warning: <AlertTriangle size={16} />,
    danger: <AlertTriangle size={16} />,
};

const TemplateNotices = ({ template }: { template: Template }) => {
    const notices = templateNotices(template);
    if (notices.length === 0) return null;
    return (
        <div className="mt-4 grid gap-3">
            {notices.map(n => (
                <Callout key={n.title} tone={n.tone} icon={NOTICE_ICON[n.tone]} title={n.title} action={n.openInMeta && (
                    <a href={metaTemplatesUrl(template)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-accent-strong hover:underline whitespace-nowrap">
                        Abrir en Meta<ExternalLink size={13} />
                    </a>
                )}>
                    <span className="text-brand-gray-600">{n.text}</span>
                    {n.code && <span className="block mt-1.5 font-mono text-[11.5px] text-brand-subtle">{n.code}</span>}
                </Callout>
            ))}
        </div>
    );
};

/** Las líneas por las que se envía (las conectadas de su WABA), solo con varias. */
const TemplateLines = ({ template }: { template: Template }) => {
    const { activeLines, hasManyLines } = useLines();
    const lines = activeLines.filter(line => line.waBusinessId === template.waBusinessId);
    if (!hasManyLines || lines.length === 0) return null;
    return <>
        <span>·</span><span>Se envía desde</span>
        {lines.map(line => <LineChip key={line.id} lineId={line.id} wide />)}
    </>;
};

/** El estado del sync, junto a «Sincronizar»: comprobando Meta, o cuándo fue. */
const SyncState = ({ template, checking }: { template: Template; checking: boolean }) => {
    if (checking) {
        return (
            <span className="flex items-center gap-[7px] text-[12.5px] text-brand-info">
                <Loader2 size={14} className="motion-safe:animate-spin" />Comprobando cambios en Meta…
            </span>
        );
    }
    if (!template.syncedAt) return null;
    return (
        <span className="text-[12.5px] text-brand-muted">
            Sincronizado <span className="font-mono">{formatTimeAgo(Date.now() - new Date(template.syncedAt).getTime())}</span>
        </span>
    );
};

/** Antes de saber nada de ella (sin la lista en caché): la forma de la cabecera y de la franja. */
const DetailSkeleton = () => (
    <div className="mt-3.5 grid gap-5">
        <SkeletonStatus label="Cargando la plantilla" />
        <div className="grid gap-2.5">
            <SkeletonLine width="260px" className="h-[18px]" />
            <SkeletonLine soft width="180px" />
        </div>
        <SkeletonBox className="h-[92px] rounded-xl" tone="soft" width="100%" />
        <div className="grid lg:grid-cols-[400px_minmax(0,1fr)] gap-6">
            <SkeletonBox className="h-[320px] rounded-xl" tone="soft" width="100%" />
            <SkeletonBox className="h-[200px] rounded-xl" tone="soft" width="100%" />
        </div>
    </div>
);

/**
 * El detalle de una plantilla (diseño «Plantillas - Detalle», 2a a 7b): si se
 * puede usar y por qué no, cómo le llega al contacto, su uso y de qué está
 * hecha. Se abre desde Plantillas y desde el detalle de una campaña.
 */
export const TemplateDetailPage = () => {
    const { templateId = '' } = useParams();
    const back = backFrom(useLocation().state);
    const { detail, template, isLoading, isFetching, notFound, isError, refetch } = useTemplateDetail(templateId);
    const { can, user } = useAuthContext();
    const canManage = can('templates.manage');
    const { sync, isSyncing } = useTemplates();
    const { notify } = useNotice();
    const syncNow = () => sync(undefined, {
        onError: (error) => notify({ kind: 'error', text: parseError(error, 'No se pudieron sincronizar las plantillas.') }),
    });

    if (notFound) {
        return (
            <PageShell width="wide">
                <BackLink to={back.to} label={back.label} />
                <div className="mt-6">
                    <BlankState icon={<AlertCircle size={22} />} title="Esta plantilla ya no está en tu cuenta" action={
                        <div className="flex flex-wrap justify-center gap-2">
                            {back.fromCampaign && (
                                <Link to={back.to} className="h-10 inline-flex items-center px-[18px] rounded-[8px] border border-brand-border-strong
                                    bg-brand-surface text-sm font-semibold text-brand-accent-strong hover:bg-brand-bg transition-colors">
                                    Volver a la campaña
                                </Link>
                            )}
                            <Link to={TemplatesPath} className="h-10 inline-flex items-center px-4 rounded-[8px] text-sm font-semibold text-brand-accent-strong hover:underline">Ir a Plantillas</Link>
                        </div>
                    }>
                        {back.fromCampaign
                            ? 'La campaña la usó, pero Wasmish ya no la tiene: puede que se borrara en Meta antes de que se guardaran las borradas, o que fuera de una cuenta de WhatsApp Business que ya no está conectada.'
                            : 'Puede que sea de una cuenta de WhatsApp Business que ya no está conectada, o de una línea que no tienes a tu cargo.'}
                    </BlankState>
                </div>
            </PageShell>
        );
    }

    if (!template) {
        return (
            <PageShell width="wide">
                <BackLink to={back.to} label={back.label} />
                {isError ? (
                    <div className="mt-6">
                        <BlankState tone="danger" icon={<AlertCircle size={22} />} title="No se pudo cargar la plantilla"
                            action={<CustomButton onClick={() => refetch()}>Reintentar</CustomButton>}>
                            Puede ser la conexión. Lo que tenías abierto sigue igual.
                        </BlankState>
                    </div>
                ) : isLoading && <DetailSkeleton />}
            </PageShell>
        );
    }

    const usage = detail?.usage;
    const checking = isSyncing || (isFetching && isTemplateSyncStale(template.syncedAt));

    return (
        <PageShell width="wide">
            <BackLink to={back.to} label={back.label} />

            <header className="mt-3.5 flex flex-col md:flex-row md:items-start gap-3 md:gap-5">
                <div className="flex-1 min-w-0 grid gap-2">
                    <div className="flex items-center gap-1.5 sm:gap-2.5">
                        <h1 className="font-mono text-[20px] sm:text-[26px] font-semibold tracking-[-0.02em] leading-[1.2] text-brand-text [overflow-wrap:anywhere]">
                            {template.name}
                        </h1>
                        <CopyButton value={template.name} label="Copiar el nombre" done="Nombre copiado." size="lg" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[12.5px] sm:text-[13px] text-brand-muted">
                        <span>ID</span>
                        <span className="font-mono text-brand-strong">{template.templateId}</span>
                        <CopyButton value={template.templateId} label="Copiar el ID" done="ID copiado." size="sm" />
                        <TemplateLines template={template} />
                    </div>
                </div>
                <div className="flex-none flex items-center justify-between md:justify-end gap-3">
                    <SyncState template={template} checking={checking} />
                    {canManage && (
                        <div className="h-11 sm:h-[38px]">
                            <CustomButton variant="outline" onClick={syncNow} isLoading={isSyncing}>
                                <RefreshCw size={15} />Sincronizar
                            </CustomButton>
                        </div>
                    )}
                </div>
            </header>

            <div className="mt-5">
                <TemplateFactStrip template={template} neverSent={usage ? usage.sent === 0 : false} />
            </div>
            <TemplateNotices template={template} />

            {/* En el teléfono es una sola columna: los hijos de las dos columnas
                pasan a ser de la cuadrícula (`contents`) y el archivo baja al
                final, como en el diseño 5a. */}
            <div className="mt-6 grid lg:grid-cols-[400px_minmax(0,1fr)] gap-4 lg:gap-6 items-start">
                <div className="contents lg:grid lg:gap-4">
                    <TemplatePreviewCard template={template} />
                    <TemplateHeaderFileCard template={template} canManage={canManage} className="order-last lg:order-none" />
                </div>
                <div className="contents lg:grid lg:gap-4 lg:min-w-0">
                    <TemplateUsageCard template={template} usage={usage} role={user?.role} failed={isError} onRetry={() => refetch()} />
                    <TemplateCampaignsCard template={template} campaigns={detail?.campaigns} />
                    <TemplateButtonsCard template={template} />
                    <TemplateVariablesCard template={template} />
                </div>
            </div>
        </PageShell>
    );
};
