import { useState, type FocusEvent, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { contactError, useContactMutations } from "../../../hooks/useContacts";
import { useTagMutations, useTags } from "../../../hooks/useTags";
import type { ContactDetail } from "../../../models/contact.model";
import { MAX_TAGS_PER_CONTACT, tagsFromIds } from "../../../utils/tags";
import { useNoticeContext } from "../../Notice/context/UseNoticeContext";
import { TagChip } from "../../Tag/TagChip";
import { TagSelector, type TagSelection } from "../../Tag/TagSelector";

/**
 * Las etiquetas de la ficha del chat. Se guardan al ponerlas o quitarlas (y las
 * nuevas se crean al elegirlas): es lo que más se toca mientras se habla.
 * «+ Etiqueta» abre el mismo selector de buscar o crear del resto de la app, y
 * se cierra al salir de él o con Esc.
 */
export const ContactSidebarTags = ({ contact }: { contact: ContactDetail }) => {
    const { data: allTags = [] } = useTags();
    const { setTags } = useContactMutations();
    const { createMissing } = useTagMutations();
    const { setState, setContent } = useNoticeContext();
    const [editing, setEditing] = useState(false);
    const tags = tagsFromIds(allTags, contact.tagIds);

    const apply = async ({ ids, newNames }: TagSelection) => {
        try {
            const created = await createMissing(newNames);
            const tagIds = [...new Set([...ids, ...created.map(tag => tag.id)])];
            await setTags.mutateAsync({ id: contact.id, tagIds });
        } catch (err) {
            setContent(<div className="text-brand-danger text-sm"><p>{contactError(err).message}</p></div>);
            setState(true);
        }
    };

    const remove = (tagId: string) => apply({ ids: contact.tagIds.filter(id => id !== tagId), newNames: [] });

    // Salir del selector (y de su lista, que vive dentro) lo cierra.
    const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setEditing(false);
    };

    // Esc cierra el selector, no la ficha entera.
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        setEditing(false);
    };

    if (editing) {
        return (
            <div onBlur={handleBlur} onKeyDown={handleKeyDown}>
                <TagSelector value={{ ids: contact.tagIds, newNames: [] }} onChange={apply} autoFocus createsOnPick />
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {tags.map(tag => <TagChip key={tag.id} name={tag.name} size="md" onDeep onRemove={() => remove(tag.id)} />)}
            {contact.tagIds.length < MAX_TAGS_PER_CONTACT && (
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1 rounded-[4px] border border-dashed border-brand-on-deep-subtle
                        px-2 py-[3px] text-[12.5px] font-semibold text-brand-accent hover:bg-brand-deep-hover
                        transition-colors cursor-pointer"
                >
                    <Plus size={13} strokeWidth={2.4} />Etiqueta
                </button>
            )}
        </div>
    );
};
