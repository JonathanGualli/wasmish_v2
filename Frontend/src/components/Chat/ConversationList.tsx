import { useMemo, useState, type ReactNode } from "react";
import { SearchInput } from "../SearchInput/SearchInput";
import { Menu, Plus } from "lucide-react";
import { useConversations } from "../../hooks/useConversations";
import { useTemplates } from "../../hooks/useTemplates";
import { renderLegacyTemplateText } from "../../utils/legacyTemplate";
import { formatChatTime } from "../../utils/formatChatTime";
import { initials } from "../../utils/initials";
import { draftTitle, type ConversationDraft } from "../../utils/conversationDraft";
import { useLines } from "../../hooks/useLines";
import { ConversationListSkeleton } from "./ChatSkeletons";
import { SkeletonLine } from "../Skeleton/Skeleton";
import { LineChip } from "../Line/LineChip";
import { ALL_LINES, LineFilter } from "./LineFilter";
import { useOpenMobileMenu } from "../Layout/MobileMenuContext";
import { useAuthContext } from "../../context/auth.context";
import { hasTeam } from "../../utils/roleDisplay";
import {
    canReassignConversation, firstName, inAssignmentTab, loadAssignmentTab, saveAssignmentTab, type AssignmentTab,
} from "../../utils/assignment";
import { AssignmentTabs } from "./Assignment/AssignmentTabs";
import { PersonBadge, UnassignedBadge } from "./Assignment/PersonBadge";
import { ArrowRight } from "lucide-react";
import type { Conversation } from "../../models/conversation.mode";

interface Props {
    onSelect: (id: string) => void;
    selectedId?: string | null;
    onNewConversation: () => void;
    /** Conversación nueva a medio escribir: va arriba del todo mientras exista. */
    draft?: ConversationDraft | null;
    /** El borrador es lo que está abierto ahora (si no, otra conversación). */
    draftActive?: boolean;
    onOpenDraft?: () => void;
    /** Una fila arriba de la lista, que se va con el scroll (la invitación a los avisos). */
    banner?: ReactNode;
}

const CenteredState = ({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'danger' }) => (
    <div className={`flex-1 flex items-center justify-center p-6 text-center text-sm
        ${tone === 'danger' ? 'text-brand-danger' : 'text-brand-muted'}`}>
        {children}
    </div>
);

/**
 * La bandeja — «Sidebar y Chats» del manual de marca v1.0.
 * Cabecera con el contador de sin leer y la conversación nueva, buscador, y
 * filas de 38px de avatar. La abierta se marca con borde izquierdo verde profundo.
 *
 * Con más de una línea, cada conversación lleva la etiqueta de la suya junto a
 * la hora, y bajo la búsqueda se filtra por línea (en el cliente: la lista ya
 * trae todas). El contador de sin leer es el de lo que se ve.
 *
 * Con más de una persona en la cuenta (Fase 4; diseño «Wasmish Chats -
 * Asignar conversaciones», 1a), las vistas «Mías / Sin asignar / Todas» (en el
 * cliente: la lista ya trae todo lo que la persona ve), quién atiende cada
 * conversación cuando no es quien mira, y la solicitud pendiente a quien puede
 * responderla. La vista se recuerda por persona en este navegador.
 *
 * En el teléfono se ve como una app de mensajería (diseño «Wasmish Móvil», E1):
 * título «Chats» con el ☰ del menú, buscador y línea en una fila, filas más
 * altas con la línea junto al último mensaje y la hora en verde con no leídos.
 */
export const ChatconversationList = ({ onSelect, selectedId, onNewConversation, draft, draftActive, onOpenDraft, banner }: Props) => {
    const { data: conversations, isLoading, isError } = useConversations();
    const { templates } = useTemplates();
    const { lineById, showLines } = useLines();
    const openMenu = useOpenMobileMenu();
    const [query, setQuery] = useState('');
    const [lineFilter, setLineFilter] = useState(ALL_LINES);
    const { user, can } = useAuthContext();
    const userId = user?.id ?? '';
    const showAssignment = hasTeam(user);
    const canAssignAny = can('conversations.assign');
    const [tabState, setTabState] = useState<{ userId: string; tab: AssignmentTab }>(() => ({ userId, tab: loadAssignmentTab(userId) }));
    // Otra persona en la misma pestaña: su vista, no la de la anterior.
    const tab: AssignmentTab = !showAssignment ? 'all' : tabState.userId === userId ? tabState.tab : loadAssignmentTab(userId);
    const pickTab = (next: AssignmentTab) => {
        setTabState({ userId, tab: next });
        saveAssignmentTab(userId, next);
    };
    // Una línea que ya no está (u otra cuenta en la misma pestaña) vuelve a «todas».
    const filterLineId = showLines && lineById(lineFilter) ? lineFilter : ALL_LINES;

    const ofLine = useMemo(
        () => (filterLineId === ALL_LINES ? conversations ?? [] : (conversations ?? []).filter(c => c.lineId === filterLineId)),
        [conversations, filterLineId]
    );

    // Cuántas sin leer hay en cada vista (las pestañas lo dicen).
    const unreadByTab = useMemo(() => {
        const count = (key: AssignmentTab) =>
            ofLine.filter(c => c.unreadCount > 0 && inAssignmentTab(c, key, userId)).length;
        return { mine: count('mine'), unassigned: count('unassigned'), all: count('all') };
    }, [ofLine, userId]);
    const ofTab = useMemo(() => ofLine.filter(c => inAssignmentTab(c, tab, userId)), [ofLine, tab, userId]);
    const unread = unreadByTab[tab];

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return ofTab;
        return ofTab.filter(c =>
            (c.title ?? '').toLowerCase().includes(q)
            || (c.phone ?? '').includes(q)
            || (c.username ?? '').toLowerCase().includes(q.replace(/^@/, ''))
        );
    }, [ofTab, query]);

    const renderRows = () => {
        if (isLoading) return <ConversationListSkeleton />;
        if (isError) return <CenteredState tone="danger">¡Error al cargar las conversaciones!</CenteredState>;
        if (!conversations || conversations.length === 0) {
            return <CenteredState>Todavía no hay conversaciones. Empieza una con el botón +.</CenteredState>;
        }
        if (visible.length === 0) {
            if (!query.trim() && tab !== 'all') {
                const [titleText, detail] = tab === 'mine'
                    ? ['No tienes conversaciones', 'Las que tomes o te pasen aparecen aquí.']
                    : ['Nadie está esperando', 'Las nuevas sin asignar aparecen aquí.'];
                return (
                    <div className="px-7 py-12 text-center grid gap-1.5">
                        <span className="text-sm font-semibold text-brand-strong">{titleText}</span>
                        <span className="text-[13px] leading-normal text-brand-muted">{detail}</span>
                    </div>
                );
            }
            return <CenteredState>
                {query.trim() ? `Ninguna conversación coincide con «${query}».` : 'Esta línea todavía no tiene conversaciones.'}
            </CenteredState>;
        }

        return visible.map((chat) => {
            const isActive = selectedId === chat.id;
            const { title } = chat;

            return (
                <button
                    key={chat.id}
                    type="button"
                    onClick={() => onSelect(chat.id)}
                    className={`w-full text-left flex gap-3 px-[18px] max-md:px-4 py-3.5 max-md:py-3 border-b border-brand-bg
                        border-l-[3px] cursor-pointer transition-colors
                        ${isActive
                            ? 'bg-brand-bg border-l-brand-deep'
                            : 'border-l-transparent hover:bg-brand-bg'}`}
                >
                    <div className={`w-[38px] h-[38px] max-md:w-[46px] max-md:h-[46px] rounded-[10px] max-md:rounded-xl
                        flex items-center justify-center flex-none text-xs max-md:text-sm font-bold
                        ${isActive ? 'bg-brand-deep text-brand-accent' : 'bg-brand-raised text-brand-gray-600'}`}>
                        {initials(title)}
                    </div>

                    <div className="flex-1 min-w-0 max-md:self-center">
                        <div className="flex gap-2 items-center">
                            <span className="text-sm max-md:text-base font-semibold text-brand-text truncate">{title}</span>
                            <span className={`ml-auto flex-none font-mono text-[11px] max-md:text-xs
                                ${chat.unreadCount > 0 ? 'text-brand-subtle max-md:text-brand-success max-md:font-bold' : 'text-brand-subtle'}`}>
                                {formatChatTime(chat.updatedAt)}
                            </span>
                        </div>

                        <div className="flex gap-2 items-center mt-0.5">
                            <span className="text-[13px] max-md:text-[15px] text-brand-muted truncate">
                                {renderLegacyTemplateText(chat.lastMessage, templates) || 'Sin mensajes aún'}
                            </span>
                            {/* En el teléfono, la línea va aquí, junto al último mensaje (E1). */}
                            <span className="ml-auto flex-none flex items-center gap-2 empty:hidden">
                                <span className="md:hidden flex empty:hidden"><LineChip lineId={chat.lineId} /></span>
                                {chat.unreadCount > 0 && (
                                    <span className="inline-flex items-center justify-center
                                        min-w-[18px] h-[18px] px-1.5 rounded-[9px]
                                        bg-brand-accent text-brand-ink text-[10px] font-bold tabular-nums">
                                        {chat.unreadCount}
                                    </span>
                                )}
                            </span>
                        </div>

                        {/* La línea, en su propia fila: junto a la hora le quitaba sitio al
                            nombre. Con una sola línea, LineChip no pinta nada y la fila no existe.
                            Con equipo, a su derecha va quién la atiende (Fase 4). */}
                        <div className="empty:hidden mt-1 flex items-center gap-2 min-w-0">
                            <span className="max-md:hidden flex min-w-0 empty:hidden"><LineChip lineId={chat.lineId} wide /></span>
                            {showAssignment && <AssigneeTag chat={chat} userId={userId} />}
                        </div>
                        {showAssignment && chat.transferRequest && canReassignConversation(chat, userId, canAssignAny) && (
                            <span className="mt-1.5 inline-flex items-center gap-[5px] rounded-full bg-brand-accent-soft
                                pl-[7px] pr-[9px] py-[3px] text-[11.5px] max-md:text-xs font-semibold text-brand-accent-strong">
                                <ArrowRight size={12} strokeWidth={2.4} />
                                {firstName(chat.transferRequest.requestedBy)} la pide
                            </span>
                        )}
                    </div>
                </button>
            );
        });
    };

    return (
        <div className="bg-brand-surface h-full w-full flex flex-col min-h-0">
            {/* Cabecera de la bandeja */}
            <div className="px-[18px] max-md:px-4 pt-5 max-md:pt-[calc(12px+var(--safe-top))] pb-3.5 border-b border-brand-raised shrink-0">
                <div className="flex items-baseline max-md:items-center gap-2">
                    {openMenu && (
                        <button type="button" onClick={openMenu} title="Abrir menú"
                            className="md:hidden -ml-2 w-10 h-10 flex items-center justify-center flex-none rounded-lg
                                text-brand-strong hover:bg-brand-bg cursor-pointer transition-colors">
                            <Menu size={22} />
                        </button>
                    )}
                    <h2 className="text-xl max-md:text-[24px] font-bold tracking-[-0.025em] text-brand-text">
                        <span className="md:hidden">Chats</span>
                        <span className="max-md:hidden">Bandeja</span>
                    </h2>
                    <span className="text-[13px] text-brand-muted md:ml-auto">
                        {/* Mientras carga no se sabe: «Todo al día» sería falso. */}
                        {isLoading
                            ? <SkeletonLine soft width="64px" />
                            : unread > 0 ? `${unread} sin leer` : 'Todo al día'}
                    </span>
                    <button
                        type="button"
                        onClick={onNewConversation}
                        title="Conversación nueva"
                        className="self-center w-8 h-8 max-md:w-11 max-md:h-11 max-md:ml-auto rounded-lg max-md:rounded-xl
                            bg-brand-accent hover:bg-brand-accent-hover
                            flex items-center justify-center cursor-pointer transition-colors flex-none"
                    >
                        <Plus size={17} strokeWidth={2.4} className="text-brand-ink max-md:size-[22px]" />
                    </button>
                </div>

                {showAssignment && (
                    <div className="mt-3"><AssignmentTabs value={tab} onChange={pickTab} unread={unreadByTab} /></div>
                )}

                {/* En el teléfono, buscador y línea en una fila (E1). */}
                <div className="mt-3 max-md:flex max-md:gap-2">
                    <SearchInput value={query} onChange={setQuery} placeholder="Buscar nombre o número" className="max-md:flex-1 max-md:min-w-0" />
                    <div className="empty:hidden mt-2.5 max-md:mt-0 max-md:flex-none max-md:flex">
                        <LineFilter value={filterLineId} onChange={setLineFilter} conversations={conversations ?? []} />
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col pb-[var(--safe-bottom)]">
                {banner}
                {/* En el teléfono la conversación nueva es una pantalla, no una fila (diseño E6): el «+» la recupera. */}
                {draft && (
                    <button
                        type="button"
                        onClick={onOpenDraft}
                        className={`max-md:hidden w-full text-left flex gap-3 px-[18px] py-3.5 border-b border-brand-bg
                            border-l-[3px] cursor-pointer transition-colors
                            ${draftActive
                                ? 'bg-brand-bg border-l-brand-deep'
                                : 'border-l-transparent hover:bg-brand-bg'}`}
                    >
                        <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-none
                            border border-dashed border-brand-border-strong bg-brand-surface text-brand-muted">
                            <Plus size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-brand-text truncate">{draftTitle(draft)}</div>
                            <div className="text-[13px] text-brand-muted truncate mt-0.5">
                                {draft.templateName ? `Plantilla ${draft.templateName}` : 'Sin plantilla todavía'}
                            </div>
                            <span className="inline-block mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold
                                uppercase tracking-[0.05em] bg-brand-raised text-brand-muted">
                                Borrador
                            </span>
                        </div>
                    </button>
                )}
                {renderRows()}
            </div>
        </div>
    );
};

/** Quién atiende la conversación, en su fila: nada si es quien mira (diseño, 1a). */
const AssigneeTag = ({ chat, userId }: { chat: Conversation; userId: string }) => {
    if (!chat.assignedTo) {
        return (
            <span className="ml-auto flex-none inline-flex items-center gap-[5px] text-[11.5px] max-md:text-xs font-medium text-brand-muted">
                <UnassignedBadge size={14} />Sin asignar
            </span>
        );
    }
    if (chat.assignedTo.id === userId) return null;
    return (
        <span className="ml-auto flex-none inline-flex items-center gap-[5px] text-[11.5px] max-md:text-xs font-semibold text-brand-strong">
            <PersonBadge name={chat.assignedTo.name} size={16} />{firstName(chat.assignedTo)}
        </span>
    );
};
