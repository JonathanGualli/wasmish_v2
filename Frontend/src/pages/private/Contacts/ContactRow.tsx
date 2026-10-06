import type { ReactNode } from "react";
import type { Contact } from "../../../models/contact.model";
import type { Tag } from "../../../models/tag.model";
import { Pill } from "../../../components/Pill/Pill";
import { TagChips } from "../../../components/Tag/TagChip";
import { initials } from "../../../utils/initials";
import { avatarName, contactStatus, contactSubtitle, contactTitle, lastInteractionLabel } from "../../../utils/contactDisplay";

const AVATAR_SIZES = {
    sm: 'w-[34px] h-[34px] rounded-[9px] text-xs',
    md: 'w-10 h-10 rounded-[10px] text-xs',
    lg: 'w-[52px] h-[52px] rounded-[13px] text-base',
};

/** Avatar con iniciales; en la ficha va en verde profundo, como el de la conversación abierta. */
export const ContactAvatar = ({ contact, size = 'sm', strong = false }: {
    contact: Contact;
    size?: keyof typeof AVATAR_SIZES;
    strong?: boolean;
}) => (
    <div className={`${AVATAR_SIZES[size]} flex items-center justify-center flex-none font-bold
        ${strong ? 'bg-brand-deep text-brand-accent' : 'bg-brand-raised text-brand-gray-600'}`}>
        {initials(avatarName(contact))}
    </div>
);

/** Celda de la tabla centrada a la altura del avatar (la tabla alinea arriba). */
export const ContactCell = ({ children }: { children: ReactNode }) => (
    <div className="min-h-[34px] flex items-center">{children}</div>
);

/** La fila en móvil: la tabla no cabe a 375px. `tags` son las del contacto, ya resueltas. */
export const ContactMobileRow = ({ contact, tags, highlightIds }: { contact: Contact; tags: Tag[]; highlightIds: string[] }) => {
    const status = contactStatus(contact);
    const subtitle = contactSubtitle(contact);
    return (
        <div className="flex gap-3 px-4 py-3">
            <ContactAvatar contact={contact} size="md" />
            <div className="flex-1 min-w-0">
                <div className="flex gap-2 items-baseline">
                    <span className="text-sm font-semibold text-brand-text truncate">{contactTitle(contact)}</span>
                    <span className="ml-auto font-mono text-[11px] text-brand-subtle flex-none">{lastInteractionLabel(contact)}</span>
                </div>
                <div className="font-mono text-[11.5px] text-brand-muted truncate mt-0.5">
                    {contact.company ? `${subtitle} · ${contact.company}` : subtitle}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-[5px]">
                    <Pill tone={status.tone}>{status.label}</Pill>
                    {tags.length > 0 && <TagChips tags={tags} highlightIds={highlightIds} wrap />}
                </div>
            </div>
        </div>
    );
};
