import { useState } from "react";
import { Pill } from "../../../../components/Pill/Pill";
import { SearchInput } from "../../../../components/SearchInput/SearchInput";
import { useCampaignAudience } from "../../../../hooks/useCampaigns";
import { useDebouncedValue } from "../../../../hooks/useDebouncedValue";
import { useOnVisible } from "../../../../hooks/useOnVisible";
import type { AudienceMember, CampaignAudienceInput } from "../../../../models/campaign.model";
import { contactIdentity } from "../../../../utils/contactDisplay";
import { initials } from "../../../../utils/initials";

/** Cuántos se ven sin desplegar la lista. */
const PREVIEW_SIZE = 8;
/** Cuántos trae cada página del scroll infinito. */
const PAGE_SIZE = 25;

/** Por qué no le llegará, o que le llegará aunque pidió no recibir publicidad. */
const MemberTag = ({ member }: { member: AudienceMember }) => {
    if (member.skipReason === 'opted_out') return <Pill tone="warning">Excluido · baja</Pill>;
    if (member.skipReason) return <Pill tone="neutral">Omitido</Pill>;
    if (member.optedOut) return <Pill tone="warning">Baja publicidad</Pill>;
    return null;
};

const MemberRow = ({ member }: { member: AudienceMember }) => {
    const skipped = Boolean(member.skipReason);
    return (
        <li className="flex items-center gap-2 px-3.5 py-2.5">
            <div className={`flex-1 flex items-center gap-2.5 min-w-0 ${skipped ? 'opacity-55' : ''}`}>
                <div className="w-7 h-7 rounded-[8px] bg-brand-raised text-brand-gray-600 text-[11px] font-bold
                    flex items-center justify-center flex-none">
                    {initials(member.displayName)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className={`text-[13px] font-semibold text-brand-text truncate ${skipped ? 'line-through' : ''}`}>
                        {member.displayName}
                    </div>
                    <div className="font-mono text-[11px] text-brand-muted truncate">{contactIdentity(member)}</div>
                </div>
            </div>
            <MemberTag member={member} />
        </li>
    );
};

/**
 * «¿Es la gente correcta?»: los primeros destinatarios por orden alfabético y,
 * al pulsar «Ver los N», todos ahí mismo, con buscador y scroll infinito. En
 * móvil, plegada, queda solo el acceso.
 */
export const AudiencePanel = ({ input }: { input: CampaignAudienceInput }) => {
    const [expanded, setExpanded] = useState(false);
    const [query, setQuery] = useState('');
    const search = useDebouncedValue(query.trim());
    const searching = expanded && search !== '';

    // La lista sin buscar da el total y la vista plegada; la de la búsqueda,
    // solo mientras hay algo escrito.
    const everyone = useCampaignAudience(input, '', PAGE_SIZE);
    const found = useCampaignAudience(searching ? input : null, search, PAGE_SIZE);
    const list = searching ? found : everyone;

    const total = everyone.data?.pages[0]?.totalCount ?? 0;
    const members = list.data?.pages.flatMap(page => page.recipients) ?? [];
    const shown = expanded ? members : members.slice(0, PREVIEW_SIZE);

    const sentinelRef = useOnVisible<HTMLLIElement>(
        () => list.fetchNextPage(),
        expanded && Boolean(list.hasNextPage) && !list.isFetchingNextPage,
    );

    const collapse = () => {
        setExpanded(false);
        setQuery('');
    };

    return (
        <>
            <div className={`${expanded ? 'flex' : 'hidden lg:flex'} flex-col gap-3 min-w-0`}>
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">¿Es la gente correcta?</span>
                <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
                    {expanded && (
                        <div className="p-2.5 border-b border-brand-border">
                            <SearchInput
                                value={query}
                                onChange={setQuery}
                                autoFocus
                                placeholder={`Buscar entre los ${total.toLocaleString('es-EC')}`}
                                aria-label="Buscar destinatarios por nombre, teléfono, usuario, email o empresa"
                            />
                        </div>
                    )}

                    <ul className={`divide-y divide-brand-bg ${expanded ? 'max-h-[440px] overflow-y-auto' : ''}
                        ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
                        {shown.map(member => <MemberRow key={member.contactId} member={member} />)}
                        {searching && !list.isFetching && members.length === 0 && (
                            <li className="px-3.5 py-6 text-center text-[13px] text-brand-muted">
                                Nadie coincide con «{search}».
                            </li>
                        )}
                        {expanded && list.hasNextPage && (
                            <li ref={sentinelRef} className="px-3.5 py-3 text-center text-[12.5px] text-brand-subtle">Cargando…</li>
                        )}
                    </ul>

                    {expanded ? (
                        <button type="button" onClick={collapse}
                            className="w-full text-left px-3.5 py-3 border-t border-brand-border text-[13px] font-semibold
                                text-brand-accent-strong cursor-pointer hover:bg-brand-bg transition-colors">
                            Ver menos
                        </button>
                    ) : total > PREVIEW_SIZE && (
                        <button type="button" onClick={() => setExpanded(true)}
                            className="w-full text-left px-3.5 py-3 border-t border-brand-bg text-[13px] font-semibold
                                text-brand-accent-strong cursor-pointer hover:bg-brand-bg transition-colors">
                            Ver los {total.toLocaleString('es-EC')}
                        </button>
                    )}
                </div>
            </div>

            {!expanded && (
                <button type="button" onClick={() => setExpanded(true)}
                    className="lg:hidden flex items-center justify-between min-h-11 border-t border-brand-border pt-1
                        text-sm font-semibold text-brand-text cursor-pointer">
                    Ver los destinatarios
                    <span className="font-mono text-xs text-brand-muted">{total.toLocaleString('es-EC')}</span>
                </button>
            )}
        </>
    );
};
