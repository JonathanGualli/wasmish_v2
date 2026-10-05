import { useCallback, useMemo, useState } from "react";
import type { ContactFilter } from "../models/contact.model";
import type { CampaignRecipientsInput } from "../models/campaign.model";

/**
 * Qué contactos hay elegidos. Dos formas, las mismas que entiende el backend:
 *  - `ids`: los marcados uno a uno; sobreviven a cambiar de página, de
 *    búsqueda o de filtro, porque son ids concretos;
 *  - `query`: «todos los que coinciden» con una búsqueda y un filtro, menos los
 *    desmarcados. Va atado a esa búsqueda: si cambia, ya son otros contactos.
 */
type Selection =
    | { mode: 'ids'; ids: ReadonlySet<string> }
    | { mode: 'query'; search: string; filter: ContactFilter; excludeIds: ReadonlySet<string> };

const EMPTY: Selection = { mode: 'ids', ids: new Set() };

const withToggled = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
};

const fromRecipientsInput = (input: CampaignRecipientsInput): Selection =>
    input.mode === 'ids'
        ? { mode: 'ids', ids: new Set(input.contactIds) }
        : {
            mode: 'query',
            search: input.search ?? '',
            filter: input.filter ?? 'all',
            excludeIds: new Set(input.excludeIds ?? []),
        };

export const useContactSelection = (initial?: CampaignRecipientsInput) => {
    const [selection, setSelection] = useState<Selection>(() => (initial ? fromRecipientsInput(initial) : EMPTY));

    const isSelected = useCallback((id: string) => (
        selection.mode === 'ids' ? selection.ids.has(id) : !selection.excludeIds.has(id)
    ), [selection]);

    const toggle = useCallback((id: string) => setSelection(s => (
        s.mode === 'ids'
            ? { ...s, ids: withToggled(s.ids, id) }
            : { ...s, excludeIds: withToggled(s.excludeIds, id) }
    )), []);

    /** Marca o desmarca de una vez los de la página visible. */
    const setPage = useCallback((pageIds: string[], selected: boolean) => setSelection(s => {
        if (s.mode === 'ids') {
            const ids = new Set(s.ids);
            pageIds.forEach(id => (selected ? ids.add(id) : ids.delete(id)));
            return { ...s, ids };
        }
        const excludeIds = new Set(s.excludeIds);
        pageIds.forEach(id => (selected ? excludeIds.delete(id) : excludeIds.add(id)));
        return { ...s, excludeIds };
    }), []);

    const selectAllMatching = useCallback((search: string, filter: ContactFilter) => {
        setSelection({ mode: 'query', search, filter, excludeIds: new Set() });
    }, []);

    const clear = useCallback(() => setSelection(EMPTY), []);

    const isAllMatching = selection.mode === 'query';

    /** Cuántos hay elegidos. Con «todos los que coinciden» hace falta el total de la búsqueda. */
    const count = useCallback((matchingTotal: number) => (
        selection.mode === 'ids' ? selection.ids.size : Math.max(matchingTotal - selection.excludeIds.size, 0)
    ), [selection]);

    /** La casilla de la cabecera, según cuántos de la página están elegidos. */
    const pageState = useCallback((pageIds: string[]): 'none' | 'some' | 'all' => {
        const chosen = pageIds.filter(isSelected).length;
        if (chosen === 0) return 'none';
        return chosen === pageIds.length ? 'all' : 'some';
    }, [isSelected]);

    const recipientsInput = useMemo((): CampaignRecipientsInput => (
        selection.mode === 'ids'
            ? { mode: 'ids', contactIds: [...selection.ids] }
            : {
                mode: 'query',
                search: selection.search || undefined,
                filter: selection.filter,
                excludeIds: [...selection.excludeIds],
            }
    ), [selection]);

    const excludedCount = selection.mode === 'query' ? selection.excludeIds.size : 0;

    return {
        isSelected, toggle, setPage, selectAllMatching, clear, count, pageState,
        isAllMatching, excludedCount, recipientsInput,
    };
};

export type ContactSelection = ReturnType<typeof useContactSelection>;
