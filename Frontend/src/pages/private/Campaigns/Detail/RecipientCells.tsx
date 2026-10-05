import { Pill } from "../../../../components/Pill/Pill";
import type { CampaignRecipient } from "../../../../models/campaign.model";
import { RECIPIENT_STATE, recipientReason, recipientTime } from "../../../../utils/campaignDisplay";
import { contactIdentity } from "../../../../utils/contactDisplay";

export const RecipientState = ({ recipient }: { recipient: CampaignRecipient }) => {
    const { label, tone } = RECIPIENT_STATE[recipient.state];
    const reason = recipientReason(recipient);
    return (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
            <Pill tone={tone}>{label}</Pill>
            {reason && (
                <span className="text-[12.5px] leading-[1.4] text-brand-gray-600 min-w-0">
                    {reason.text}
                    {reason.code && <span className="ml-1.5 font-mono text-[11px] text-brand-subtle">{reason.code}</span>}
                </span>
            )}
        </div>
    );
};

export const RecipientContact = ({ recipient }: { recipient: CampaignRecipient }) => (
    <div className="min-w-0">
        <div className="max-w-[240px] truncate text-sm font-semibold text-brand-text">{recipient.displayName}</div>
        <div className="font-mono text-[11.5px] text-brand-muted mt-0.5">{contactIdentity(recipient) || '—'}</div>
    </div>
);

/** La fila en móvil. */
export const RecipientMobileRow = ({ recipient }: { recipient: CampaignRecipient }) => (
    <div className="grid gap-2 px-4 py-3">
        <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0"><RecipientContact recipient={recipient} /></div>
            <span className="font-mono text-[11px] text-brand-subtle">{recipientTime(recipient)}</span>
        </div>
        <RecipientState recipient={recipient} />
    </div>
);
