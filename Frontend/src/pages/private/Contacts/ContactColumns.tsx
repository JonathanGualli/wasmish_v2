import { type ColumnDef } from "@tanstack/react-table";
import type { Contact } from "../../../models/contact.model";
import { Pill } from "../../../components/Pill/Pill";
import { contactStatus, contactSubtitle, contactTitle, lastInteractionLabel, sourceLabel } from "../../../utils/contactDisplay";
import { ContactAvatar, ContactCell as Cell } from "./ContactRow";

export const contactColumns: ColumnDef<Contact>[] = [
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
        id: "source",
        header: "Origen",
        cell: ({ row }) => (
            <Cell><span className="text-[13px] text-brand-muted whitespace-nowrap">{sourceLabel(row.original.source)}</span></Cell>
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
