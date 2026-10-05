import type { CampaignDraft } from "../../../utils/campaignDraft";
import { CAMPAIGN_STEPS, campaignDraftTitle } from "../../../utils/campaignDraft";
import { formatTimeAgo, pluralize } from "../../../utils/campaignDisplay";

/** El borrador en dos líneas: nombre y plantilla; contactos, paso y última edición. */
export const CampaignDraftSummary = ({ draft }: { draft: CampaignDraft }) => {
    const hasName = Boolean(draft.name.trim());
    return (
        <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
                <span className={`text-sm font-semibold truncate ${hasName ? 'text-brand-text' : 'italic text-brand-gray-600'}`}>
                    {campaignDraftTitle(draft)}
                </span>
                {draft.templateName && (
                    <span className="font-mono text-xs text-brand-muted truncate">{draft.templateName}</span>
                )}
            </div>
            <div className="mt-0.5 text-[12.5px] text-brand-muted">
                <span className="font-mono tabular-nums text-brand-strong">{pluralize(draft.selectedCount, 'contacto', 'contactos')}</span>
                {` · paso ${draft.step}, ${CAMPAIGN_STEPS[draft.step - 1]} · editado `}
                <span className="font-mono">{formatTimeAgo(draft.updatedAt)}</span>
            </div>
        </div>
    );
};
