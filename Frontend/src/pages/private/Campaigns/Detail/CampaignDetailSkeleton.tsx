import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { DataTable } from "../../../../components/DataTable/DataTable";
import { PageShell } from "../../../../components/Page/PageShell";
import { SkeletonBox, SkeletonLine, SkeletonPill } from "../../../../components/Skeleton/Skeleton";
import { SkeletonFrame } from "../../../../components/Skeleton/SkeletonFrame";
import { CampaignPaths } from "../../../../models/routes.models";
import { CampaignMetricsSkeleton } from "./CampaignStatsBlocks";
import { recipientColumns, recipientMobileSkeleton } from "./RecipientColumns";

const NO_PAGE = { pageIndex: 0, pageSize: 20 };
const noop = () => {};

/**
 * El detalle mientras llega la campaña (diseño 3.4): nunca más en blanco. Lo
 * que no depende de ella (volver a Campañas, las etiquetas de las cifras) ya se
 * ve; los filtros de destinatarios no, porque llevan la cuenta de cada estado.
 */
export const CampaignDetailSkeleton = () => (
    <PageShell width="wide">
        <SkeletonFrame label="Cargando la campaña">
            <Link to={CampaignPaths.list} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-accent-strong hover:underline">
                <ChevronLeft size={15} />Campañas
            </Link>
            <header className="mt-3.5 mb-6 flex flex-col md:flex-row md:items-start gap-4">
                <div className="min-w-0 flex-1 grid gap-2">
                    <div className="h-[37px] flex items-center gap-3">
                        <SkeletonBox width="260px" className="h-3.5 rounded-[7px] max-w-[60%]" />
                        <SkeletonPill width="84px" />
                    </div>
                    <div className="h-5 flex items-center"><SkeletonLine soft width="220px" /></div>
                </div>
                <div className="flex gap-2 flex-none">
                    <SkeletonBox className="w-[112px] h-10 rounded-[8px]" />
                    <SkeletonBox className="w-[140px] h-10 rounded-[8px]" />
                </div>
            </header>
            <div className="grid gap-4">
                <CampaignMetricsSkeleton />
                <DataTable data={[]} columns={recipientColumns} totalCount={0} pagination={NO_PAGE} setPagination={noop}
                    isLoading loadingLabel="Cargando destinatarios" mobileSkeleton={recipientMobileSkeleton}
                    renderMobileRow={() => null} />
            </div>
        </SkeletonFrame>
    </PageShell>
);
