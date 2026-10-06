import { type ColumnDef } from "@tanstack/react-table";
import type { Contact } from "../../../models/contact.model";
import type { Tag } from "../../../models/tag.model";
import { Pill } from "../../../components/Pill/Pill";
import { TagChips } from "../../../components/Tag/TagChip";
import { contactStatus, contactSubtitle, contactTitle, lastInteractionLabel } from "../../../utils/contactDisplay";
import { tagsFromIds } from "../../../utils/tags";
import { ContactAvatar, ContactCell as Cell } from "./ContactRow";

/**
 * Las columnas de Contactos. Las etiquetas llegan como ids: los nombres salen
 * de la lista de la cuenta, y las del filtro activo se marcan.
 */
export const contactColumns = (tags: Tag[], highlightIds: string[]): ColumnDef<Contact>[] => [
    {
        id: "contact",
        header: "Contacto",
        cell: ({ row }) => (
            <div className="flex items-center gap-3 min-w-0">
                <ContactAvatar contact={row.original} />
                <div className="min-w-0">
                    <div className="max-w-[260px] truncate text-sm font-semibold text-brand-text">
                        {contactTitle(row.original)}
                    </div>
                    <div className="font-mono text-[11.5px] text-brand-muted truncate mt-0.5">
                        {contactSubtitle(row.original)}
                    </div>
                </div>
            </div>
        ),
    },
    {
        id: "company",
        header: "Empresa",
        cell: ({ row }) => (
            <Cell>
                <span className={`max-w-[200px] truncate ${row.original.company ? 'text-brand-strong' : 'text-brand-subtle'}`}>
                    {row.original.company || '—'}
                </span>
            </Cell>
        ),
    },
    {
        id: "tags",
        header: "Etiquetas",
        cell: ({ row }) => (
            <Cell><TagChips tags={tagsFromIds(tags, row.original.tagIds)} highlightIds={highlightIds} /></Cell>
        ),
    },
    {
        id: "lastInteraction",
        header: "Última",
        cell: ({ row }) => (
            <Cell><span className="font-mono text-[12px] text-brand-muted tabular-nums">{lastInteractionLabel(row.original)}</span></Cell>
        ),
    },
    {
        id: "status",
        header: "Estado",
        cell: ({ row }) => {
            const status = contactStatus(row.original);
            return <Cell><Pill tone={status.tone}>{status.label}</Pill></Cell>;
        },
    },
];
