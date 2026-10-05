import { FileClock } from "lucide-react";
import { ConfirmDialog } from "../../../components/Dialog/ConfirmDialog";
import type { CampaignDraft } from "../../../utils/campaignDraft";
import { CampaignDraftSummary } from "./CampaignDraftSummary";

interface DraftConflictDialogProps {
    draft: CampaignDraft | null;
    open: boolean;
    onContinueDraft: () => void;
    onStartOver: () => void;
    onClose: () => void;
}

/** Hay un envío sin terminar y se pide otro: continuarlo o empezar de cero. */
export const DraftConflictDialog = ({ draft, open, onContinueDraft, onStartOver, onClose }: DraftConflictDialogProps) => (
    <ConfirmDialog
        open={open}
        icon={<FileClock size={19} />}
        title="Tienes un envío sin terminar"
        description="Solo se guarda un borrador a la vez. Si empiezas uno nuevo, este se descarta."
        cancelLabel="Empezar uno nuevo"
        confirmLabel="Continuar el borrador"
        onConfirm={onContinueDraft}
        onCancel={onClose}
        onSecondary={onStartOver}
    >
        {draft && (
            <div className="border border-brand-border rounded-[10px] bg-brand-bg px-3.5 py-3">
                <CampaignDraftSummary draft={draft} />
            </div>
        )}
    </ConfirmDialog>
);
