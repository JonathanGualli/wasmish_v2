import { ExternalLink, Megaphone } from 'lucide-react';
import { Pill } from '../Pill/Pill';
import { referralTypeLabel } from '../../utils/contactDisplay';
import type { ContactReferral } from '../../models/contact.model';

/** El anuncio de Facebook o Instagram que trajo al contacto. Lo usan las dos fichas: Contactos y Chats. */
export const ReferralCard = ({ referral }: { referral: ContactReferral }) => (
    <div className="border border-brand-border rounded-xl p-3.5 flex gap-3">
        <div className="w-9 h-9 rounded-[9px] bg-brand-accent-soft text-brand-accent-strong
            flex items-center justify-center flex-none">
            <Megaphone size={17} />
        </div>
        <div className="min-w-0 grid gap-1.5 justify-items-start">
            <Pill>{referralTypeLabel(referral.sourceType)}</Pill>
            <div className="text-sm font-semibold leading-[1.4] text-brand-text">
                {referral.headline || referral.body || 'Sin título'}
            </div>
            {/* Meta no siempre manda el enlace. */}
            {referral.sourceUrl && (
                <a
                    href={referral.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-accent-strong hover:text-brand-deep"
                >
                    Ver en Facebook<ExternalLink size={13} />
                </a>
            )}
        </div>
    </div>
);
