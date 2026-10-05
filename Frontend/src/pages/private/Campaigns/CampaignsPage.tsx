import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { PageHeader, PageShell } from "../../../components/Page/PageShell";
import { DataTable } from "../../../components/DataTable/DataTable";
import { BlankState } from "../../../components/BlankState/BlankState";
import { CustomButton } from "../../../components/Button/Button";
import { ConfirmDialog } from "../../../components/Dialog/ConfirmDialog";
import { useCampaigns } from "../../../hooks/useCampaigns";
import { useCampaignDraft } from "../../../hooks/useCampaignDraft";
import { useNewCampaign } from "../../../hooks/useNewCampaign";
import { CampaignPaths, ContactsPath } from "../../../models/routes.models";
import type { Campaign } from "../../../models/campaign.model";
import type { ContactsNavigationState } from "../../../models/contact.model";
import type { CampaignDraft } from "../../../utils/campaignDraft";
import { pluralize } from "../../../utils/campaignDisplay";
import { CampaignDraftSummary } from "./CampaignDraftSummary";
import { DraftConflictDialog } from "./DraftConflictDialog";
import { campaignColumns } from "./CampaignColumns";
import { CampaignProgressCell, CampaignResults, CampaignStatusPill } from "./CampaignCells";

const FIRST_PAGE = { pageIndex: 0, pageSize: 20 };

/** La campaña sin terminar, encima de la lista: se continúa o se descarta. */
const DraftCard = ({ draft, onContinue, onDiscard }: {
    draft: CampaignDraft;
    onContinue: () => void;
    onDiscard: () => void;
}) => (
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 border border-dashed border-brand-border-strong
        rounded-xl bg-brand-bg px-4 py-3.5">
        <span className="self-start sm:self-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em]
            border border-dashed border-brand-subtle text-brand-gray-600 bg-brand-surface flex-none">
            Borrador
        </span>
        <div className="flex-1 min-w-0"><CampaignDraftSummary draft={draft} /></div>
        <div className="flex gap-2 flex-none">
            <div className="h-10 flex-1"><CustomButton variant="outline" onClick={onContinue}>Continuar</CustomButton></div>
            <div className="h-10"><CustomButton variant="ghost" onClick={onDiscard}>Descartar</CustomButton></div>
        </div>
    </div>
);

/** La fila en móvil: la tabla no cabe a 375px. */
const CampaignMobileRow = ({ campaign }: { campaign: Campaign }) => (
    <div className="grid gap-2.5 px-4 py-3.5">
        <div className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-brand-text truncate">{campaign.name}</div>
                <div className="font-mono text-[11.5px] text-brand-muted truncate mt-0.5">{campaign.template.name}</div>
            </div>
            <CampaignStatusPill campaign={campaign} />
        </div>
        <CampaignProgressCell campaign={campaign} />
        <CampaignResults campaign={campaign} />
    </div>
);

/**
 * Campañas: las plantillas mandadas a muchos contactos a la vez. Una campaña
 * nueva empieza eligiendo a quién en Contactos; el que se dejó a medias
 * queda como borrador en el navegador, encima de la lista.
 */
export const CampaignsPage = () => {
    const navigate = useNavigate();
    const [pagination, setPagination] = useState(FIRST_PAGE);
    const [confirmingDiscard, setConfirmingDiscard] = useState(false);
    const { data, isLoading, isError, isPlaceholderData, refetch } = useCampaigns(pagination.pageIndex, pagination.pageSize);
    const draftStore = useCampaignDraft();
    const { draft, discard } = draftStore;
    const newCampaign = useNewCampaign(draftStore);

    const pickContacts = () => {
        const state: ContactsNavigationState = { campaignPick: 'new' };
        navigate(ContactsPath, { state });
    };
    const startNewCampaign = () => newCampaign.start(pickContacts);

    const totalCount = data?.totalCount ?? 0;
    const isEmpty = data && totalCount === 0 && !draft;

    const newCampaignButton = (
        <CustomButton onClick={startNewCampaign}>
            <span className="flex items-center justify-center gap-2"><Plus size={16} />Nueva campaña</span>
        </CustomButton>
    );

    const renderBody = () => {
        if (isError && !data) {
            return (
                <BlankState
                    tone="danger"
                    icon={<AlertCircle size={22} />}
                    title="No pudimos cargar las campañas"
                    action={
                        <CustomButton variant="outline" onClick={() => refetch()}>
                            <span className="flex items-center gap-2"><RefreshCw size={15} />Reintentar</span>
                        </CustomButton>
                    }
                >
                    Revisa tu conexión e inténtalo de nuevo. Las campañas en curso siguen avanzando.
                </BlankState>
            );
        }
        if (isEmpty) {
            return (
                <BlankState icon={<Send size={22} />} title="Todavía no creaste ninguna campaña" action={newCampaignButton}>
                    Una campaña manda una plantilla aprobada a muchos contactos a la vez, con el nombre de cada uno.
                    Primero eliges a quién en Contactos; después, el mensaje.
                </BlankState>
            );
        }
        return (
            <>
                {draft && (
                    <DraftCard
                        draft={draft}
                        onContinue={() => navigate(CampaignPaths.create)}
                        onDiscard={() => setConfirmingDiscard(true)}
                    />
                )}
                {(totalCount > 0 || !draft) && (
                    <DataTable
                        data={data?.campaigns ?? []}
                        columns={campaignColumns}
                        totalCount={totalCount}
                        pagination={pagination}
                        setPagination={setPagination}
                        isLoading={isLoading || isPlaceholderData}
                        getRowId={campaign => campaign.id}
                        onRowClick={campaign => navigate(CampaignPaths.detail(campaign.id))}
                        renderMobileRow={campaign => <CampaignMobileRow campaign={campaign} />}
                    />
                )}
            </>
        );
    };

    return (
        <PageShell width="wide">
            <PageHeader
                icon={<Send size={20} />}
                title="Campañas"
                description="Plantillas enviadas a muchos contactos a la vez."
                actions={!isEmpty && <div className="w-full sm:w-auto h-10">{newCampaignButton}</div>}
            />

            {renderBody()}

            <DraftConflictDialog {...newCampaign.conflictDialog} />

            <ConfirmDialog
                open={confirmingDiscard}
                tone="danger"
                icon={<Trash2 size={19} />}
                title="¿Descartar el borrador?"
                description={draft
                    ? `Se pierden la selección de ${pluralize(draft.selectedCount, 'contacto', 'contactos')} y lo que elegiste en el mensaje. No se envió nada.`
                    : ''}
                cancelLabel="Mantener"
                confirmLabel="Descartar borrador"
                onConfirm={() => {
                    discard();
                    setConfirmingDiscard(false);
                }}
                onCancel={() => setConfirmingDiscard(false)}
            />
        </PageShell>
    );
};
