import { useMemo, useState } from "react";
import { SearchInput } from "../../../components/SearchInput/SearchInput";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Download, Plus, RefreshCw, Search, Send, Tag as TagIcon, Users } from "lucide-react";
import { PageShell, PageHeader } from "../../../components/Page/PageShell";
import { DataTable } from "../../../components/DataTable/DataTable";
import { BlankState } from "../../../components/BlankState/BlankState";
import { CustomButton } from "../../../components/Button/Button";
import { useContacts } from "../../../hooks/useContacts";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { useContactSelection } from "../../../hooks/useContactSelection";
import { useTags } from "../../../hooks/useTags";
import { TagChip } from "../../../components/Tag/TagChip";
import { joinTagNames, tagsFromIds } from "../../../utils/tags";
import { useCampaignDraft } from "../../../hooks/useCampaignDraft";
import { useNewCampaign } from "../../../hooks/useNewCampaign";
import { ConfirmDialog } from "../../../components/Dialog/ConfirmDialog";
import { CampaignPaths } from "../../../models/routes.models";
import type { Contact, ContactFilter, ContactsNavigationState } from "../../../models/contact.model";
import { hasSeenPickIntro, markPickIntroSeen, newCampaignDraft } from "../../../utils/campaignDraft";
import { pluralize } from "../../../utils/campaignDisplay";
import { DraftConflictDialog } from "../Campaigns/DraftConflictDialog";
import { WizardHeader } from "../Campaigns/NewCampaign/WizardHeader";
import { contactColumns } from "./ContactColumns";
import { ContactMobileRow } from "./ContactRow";
import { ContactPanel, type ContactPanelState } from "./ContactPanel";
import { SelectionBar } from "./SelectionBar";
import { TagFilter } from "./TagFilter";
import { TagManager } from "./TagManager";
import { BulkTagDialog } from "./BulkTagDialog";

const FILTERS: { value: ContactFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'with_conversation', label: 'Con conversación' },
    { value: 'without_conversation', label: 'Sin conversación' },
    { value: 'opted_out', label: 'Baja de publicidad' },
];

const FIRST_PAGE = { pageIndex: 0, pageSize: 20 };

/** Lo que dice la cabecera del asistente cuando Campañas pide elegir contactos. */
const PICK_MODE_COPY = {
    new: { description: 'Marca los contactos que recibirán la campaña y pulsa «Continuar».', back: 'Cancelar' },
    edit: { description: 'Cambia los contactos que recibirán la campaña y pulsa «Volver a la campaña».', back: 'Volver sin cambios' },
};

/** La explicación de la primera vez que se eligen destinatarios. */
const PICK_INTRO_STEPS = [
    'Marca la casilla de cada contacto que quieras incluir. Puedes buscar y filtrar.',
    'Para incluir a todos los de una búsqueda, marca la casilla de arriba de la lista y luego «Seleccionar los que coinciden».',
    'Cuando termines, pulsa «Continuar» en la barra de abajo.',
];

/** Un cambio de búsqueda, de filtro o de etiquetas que espera confirmación. */
type PendingQueryChange = { query?: string; filter?: ContactFilter; tagIds?: string[] };

/**
 * Contactos: la agenda de las personas con las que habla el negocio. Se crean
 * solos cuando alguien escribe, o a mano. La ficha, crear y editar viven en un
 * panel lateral sobre la lista (`ContactPanel`).
 */
export const ContactsPage = () => {
    const navigate = useNavigate();
    const pickMode = (useLocation().state as ContactsNavigationState | null)?.campaignPick ?? null;
    const draftStore = useCampaignDraft();
    const { draft, save: saveDraft } = draftStore;
    const newCampaign = useNewCampaign(draftStore);

    // Al volver a cambiar la selección de un borrador, se parte de la que tenía
    // (y de su búsqueda, si era «todos los que coinciden»).
    const editing = pickMode === 'edit' ? draft?.recipients : undefined;
    const initialSearch = editing?.mode === 'query' ? editing.search ?? '' : '';
    const initialFilter = editing?.mode === 'query' ? editing.filter ?? 'all' : 'all';
    const initialTagIds = editing?.mode === 'query' ? editing.tagIds ?? [] : [];

    const [pagination, setPagination] = useState(FIRST_PAGE);
    const [query, setQuery] = useState(initialSearch);
    const [filter, setFilter] = useState<ContactFilter>(initialFilter);
    const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
    const [panel, setPanel] = useState<ContactPanelState | null>(null);
    const [managingTags, setManagingTags] = useState(false);
    const [tagging, setTagging] = useState(false);
    const [pendingChange, setPendingChange] = useState<PendingQueryChange | null>(null);
    // La primera vez que se eligen destinatarios, una explicación corta.
    const [showPickIntro, setShowPickIntro] = useState(() => pickMode === 'new' && !hasSeenPickIntro());
    const selection = useContactSelection(editing);

    const search = useDebouncedValue(query.trim(), 300);
    const { data, isLoading, isError, isPlaceholderData, refetch } =
        useContacts(pagination.pageIndex, pagination.pageSize, search, filter, tagIds);
    const { data: tags = [] } = useTags();
    // Una etiqueta del filtro que se borró (aquí o en otra pestaña) deja de contar.
    const activeTags = tagsFromIds(tags, tagIds);
    const columns = useMemo(() => contactColumns(tags, tagIds), [tags, tagIds]);

    // Otra búsqueda u otro filtro empiezan desde la primera página.
    const applyChange = ({ query: nextQuery, filter: nextFilter, tagIds: nextTagIds }: PendingQueryChange) => {
        if (nextQuery !== undefined) setQuery(nextQuery);
        if (nextFilter !== undefined) setFilter(nextFilter);
        if (nextTagIds !== undefined) setTagIds(nextTagIds);
        setPagination(p => ({ ...p, pageIndex: 0 }));
    };
    // «Todos los que coinciden» va atado a la búsqueda, al filtro y a las
    // etiquetas: cambiarlos cambiaría quiénes son, así que antes se pregunta.
    const requestChange = (change: PendingQueryChange) => {
        if (selection.isAllMatching) setPendingChange(change);
        else applyChange(change);
    };
    const changeQuery = (value: string) => requestChange({ query: value });
    const changeFilter = (value: ContactFilter) => requestChange({ filter: value });
    const changeTags = (value: string[]) => requestChange({ tagIds: value });
    // «Ver contactos» desde Gestionar: todos los que la tienen, sin más filtros.
    const showTagContacts = (tagId: string) => {
        setManagingTags(false);
        requestChange({ query: '', filter: 'all', tagIds: [tagId] });
    };
    const confirmPendingChange = () => {
        selection.clear();
        if (pendingChange) applyChange(pendingChange);
        setPendingChange(null);
    };

    const totalCount = data?.totalCount ?? 0;
    const pageIds = data?.contacts.map(c => c.id) ?? [];
    const pageState = selection.pageState(pageIds);
    const selectedCount = selection.count(totalCount);
    const filtering = Boolean(search) || filter !== 'all' || tagIds.length > 0;
    const isEmpty = data && totalCount === 0 && !filtering;
    const filterLabel = FILTERS.find(f => f.value === filter)?.label;
    const activeTagNames = joinTagNames(activeTags.map(tag => tag.name));

    /** A quiénes abarca «todos los que coinciden», en palabras: «que coinciden con «ferretería» y con la etiqueta VIP». */
    const matchingScope = () => {
        const parts: string[] = [];
        if (search) parts.push(`con «${search}»`);
        if (filter !== 'all') parts.push(`con «${filterLabel}»`);
        if (activeTags.length > 0) parts.push(`con la etiqueta ${activeTagNames}`);
        if (parts.length === 0) return 'que coinciden';
        const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
        // «los 312 con la etiqueta VIP» se lee solo; con búsqueda o filtro, «que coinciden con…».
        return search || filter !== 'all' ? `que coinciden ${joined}` : joined;
    };
    const openContact = (contact: Contact) => setPanel({ mode: 'view', id: contact.id });

    const goToWizard = (recipients = selection.recipientsInput) => {
        const base = pickMode === 'edit' && draft ? draft : newCampaignDraft(recipients, selectedCount);
        saveDraft({ ...base, recipients, selectedCount, step: 1 });
        navigate(CampaignPaths.create);
    };
    // Desde Contactos sin más: si ya había un borrador, se pregunta primero.
    const handleSelectionAction = () => {
        if (pickMode) goToWizard();
        else newCampaign.start(() => goToWizard());
    };
    const leavePickMode = () => navigate(pickMode === 'edit' ? CampaignPaths.create : CampaignPaths.list);
    const closePickIntro = () => {
        markPickIntroSeen();
        setShowPickIntro(false);
    };

    const selectionBanner = () => {
        if (selection.isAllMatching) {
            return (
                <>
                    Están seleccionados los <b className="font-mono tabular-nums">{selectedCount.toLocaleString('es-EC')}</b> {matchingScope()}
                    {selection.excludedCount > 0 && <>, menos <b className="font-mono">{selection.excludedCount}</b> que desmarcaste</>}.{' '}
                    <button type="button" onClick={selection.clear} className="font-semibold text-brand-accent-strong underline cursor-pointer">
                        Quitar selección
                    </button>
                </>
            );
        }
        if (pageState === 'all' && totalCount > pageIds.length) {
            return (
                <>
                    Seleccionaste los <b className="font-mono">{pageIds.length}</b> de esta página.{' '}
                    <button
                        type="button"
                        onClick={() => selection.selectAllMatching(search, filter, tagIds)}
                        className="font-semibold text-brand-accent-strong underline cursor-pointer"
                    >
                        Seleccionar los {pluralize(totalCount, 'contacto', 'contactos')} que coinciden
                    </button>
                </>
            );
        }
        return null;
    };

    const selectionActionLabel = () => {
        if (pickMode === 'new') return <>Continuar ({selectedCount})<ArrowRight size={15} /></>;
        if (pickMode === 'edit') return <>Volver a la campaña ({selectedCount})<ArrowRight size={15} /></>;
        return <><Send size={16} />Enviar plantilla<span className="md:hidden">({selectedCount})</span></>;
    };

    const renderBody = () => {
        if (isError && !data) {
            return (
                <BlankState
                    tone="danger"
                    icon={<AlertCircle size={22} />}
                    title="No pudimos cargar los contactos"
                    action={
                        <CustomButton variant="outline" onClick={() => refetch()}>
                            <span className="flex items-center gap-2"><RefreshCw size={15} />Reintentar</span>
                        </CustomButton>
                    }
                >
                    Revisa tu conexión e inténtalo de nuevo. Tus contactos siguen guardados.
                </BlankState>
            );
        }
        if (isEmpty) {
            return (
                <BlankState
                    icon={<Users size={22} />}
                    title="Aún no tienes contactos"
                    action={
                        <CustomButton onClick={() => setPanel({ mode: 'create' })}>
                            <span className="flex items-center gap-2"><Plus size={16} />Nuevo contacto</span>
                        </CustomButton>
                    }
                >
                    Aparecen solos cuando alguien escribe a tu WhatsApp. Si quieres adelantarte, crea uno a mano con su número.
                </BlankState>
            );
        }
        if (data && totalCount === 0) {
            if (!search && activeTags.length > 0) {
                // Solo con una etiqueta se puede decir cuántos la tienen en total.
                const only = activeTags.length === 1 ? activeTags[0] : null;
                return (
                    <BlankState
                        icon={<TagIcon size={22} />}
                        title={`Ningún contacto con la etiqueta ${activeTagNames}`}
                        action={
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                <div className="h-10">
                                    <CustomButton variant="outline" onClick={() => changeTags([])}>Quitar filtro de etiquetas</CustomButton>
                                </div>
                                {filter !== 'all' && (
                                    <div className="h-10">
                                        <CustomButton variant="ghost" onClick={() => requestChange({ filter: 'all', tagIds: [] })}>Ver todos</CustomButton>
                                    </div>
                                )}
                            </div>
                        }
                    >
                        {filter !== 'all'
                            ? <>Con el filtro «{filterLabel}» activo.{only && only.contactCount > 0 && ` ${pluralize(only.contactCount, 'contacto la tiene', 'contactos la tienen')} en total.`}</>
                            : 'Etiqueta contactos desde la lista o su ficha.'}
                    </BlankState>
                );
            }
            return (
                <BlankState
                    icon={<Search size={22} />}
                    title={search ? `Ningún contacto coincide con «${search}»` : `Ningún contacto en «${filterLabel}»`}
                    action={
                        <CustomButton variant="ghost" onClick={() => (search ? changeQuery('') : changeFilter('all'))}>
                            {search ? 'Borrar búsqueda' : 'Ver todos'}
                        </CustomButton>
                    }
                >
                    {search ? 'Prueba con otra parte del nombre, el teléfono o la empresa.' : 'Prueba con otro filtro.'}
                </BlankState>
            );
        }
        return (
            <DataTable
                data={data?.contacts ?? []}
                columns={columns}
                totalCount={totalCount}
                pagination={pagination}
                setPagination={setPagination}
                isLoading={isLoading || isPlaceholderData}
                getRowId={contact => contact.id}
                onRowClick={openContact}
                activeRowId={panel && panel.mode !== 'create' ? panel.id : null}
                renderMobileRow={contact => (
                    <ContactMobileRow contact={contact} tags={tagsFromIds(tags, contact.tagIds)} highlightIds={tagIds} />
                )}
                selection={{
                    isSelected: contact => selection.isSelected(contact.id),
                    onToggle: contact => selection.toggle(contact.id),
                    pageState,
                    onTogglePage: () => selection.setPage(pageIds, pageState !== 'all'),
                    banner: selectionBanner(),
                }}
            />
        );
    };

    // Eligiendo destinatarios la barra se ve desde el principio, con la pista
    // de qué hacer; si no, solo cuando hay alguien marcado.
    const showSelectionBar = selectedCount > 0 || (Boolean(pickMode) && !isEmpty && !(isError && !data));

    return (
        <PageShell width="wide">
            {pickMode ? (
                // Elegir destinatarios es el paso 1 de la campaña: la misma cabecera
                // que el asistente, para que no parezca que se salió a otra sección.
                <WizardHeader
                    step={1}
                    description={PICK_MODE_COPY[pickMode].description}
                    aside={
                        <div className="flex items-center gap-3">
                            {/* Outline: la menta de esta vista es «Continuar», en la barra. */}
                            <div className="hidden sm:block h-10">
                                <CustomButton variant="outline" onClick={() => setPanel({ mode: 'create' })}>
                                    <span className="flex items-center gap-2"><Plus size={16} />Nuevo contacto</span>
                                </CustomButton>
                            </div>
                            <button type="button" onClick={leavePickMode}
                                className="text-[13px] font-semibold text-brand-accent-strong cursor-pointer hover:underline">
                                {PICK_MODE_COPY[pickMode].back}
                            </button>
                        </div>
                    }
                />
            ) : (
                <PageHeader
                    icon={<Users size={20} />}
                    title="Contactos"
                    description="Las personas con las que habla tu negocio por WhatsApp."
                    actions={
                        <div className="w-full sm:w-auto flex gap-2">
                            {/* Importar contactos todavía no existe: el botón está, pero no hace nada. */}
                            <div className="flex-1 sm:flex-none h-10">
                                <CustomButton variant="outline" onClick={() => undefined}>
                                    <span className="flex items-center justify-center gap-2"><Download size={15} />Importar</span>
                                </CustomButton>
                            </div>
                            <div className="flex-1 sm:flex-none h-10">
                                <CustomButton onClick={() => setPanel({ mode: 'create' })}>
                                    <span className="flex items-center justify-center gap-2"><Plus size={16} />Nuevo contacto</span>
                                </CustomButton>
                            </div>
                        </div>
                    }
                />
            )}

            {!isEmpty && !(isError && !data) && (
                <div className="mb-4 flex flex-col md:flex-row md:items-center gap-3">
                    <SearchInput value={query} onChange={changeQuery} placeholder="Buscar por nombre, teléfono, usuario, email o empresa" className="md:w-[340px]" />
                    <div className="flex flex-wrap gap-1.5">
                        {FILTERS.map(f => (
                            // El filtro activo en tinte, no en menta sólida: la menta de
                            // la vista ya es «Nuevo contacto».
                            <button
                                key={f.value}
                                type="button"
                                onClick={() => changeFilter(f.value)}
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer
                                    ${filter === f.value
                                        ? 'bg-brand-accent-soft text-brand-accent-strong'
                                        : 'bg-brand-raised text-brand-gray-600 hover:text-brand-text'}`}
                            >
                                {f.label}
                            </button>
                        ))}
                        <TagFilter tags={tags} value={tagIds} onChange={changeTags} onManage={() => setManagingTags(true)} />
                    </div>
                    {data && (
                        <span className="md:ml-auto font-mono text-xs text-brand-muted tabular-nums">
                            {totalCount === 1 ? '1 contacto' : `${totalCount.toLocaleString('es-EC')} contactos`}
                        </span>
                    )}
                </div>
            )}

            {activeTags.length > 0 && !(isError && !data) && (
                // El filtro de etiquetas cambia a quién se selecciona para una
                // campaña: tiene que verse bien, y quitarse en un toque.
                <div className="mb-3.5 flex flex-wrap items-center gap-2 pl-3.5 pr-3 py-[9px] rounded-[10px] bg-brand-bg text-[13px] text-brand-strong">
                    <span>{activeTags.length === 1 ? 'Con la etiqueta' : 'Con alguna etiqueta:'}</span>
                    {activeTags.map((tag, i) => (
                        <span key={tag.id} className="flex items-center gap-2">
                            <TagChip name={tag.name} onRemove={() => changeTags(tagIds.filter(id => id !== tag.id))} />
                            {i < activeTags.length - 1 && <span className="text-brand-muted">o</span>}
                        </span>
                    ))}
                    {filter !== 'all' && <span className="text-brand-muted">· {filterLabel?.toLowerCase()}</span>}
                    <button type="button" onClick={() => changeTags([])}
                        className="ml-auto min-h-8 text-[13px] font-semibold text-brand-accent-strong cursor-pointer hover:underline">
                        Quitar filtro
                    </button>
                </div>
            )}

            {renderBody()}

            {/* Hueco para que la barra de selección no tape la paginación. */}
            {showSelectionBar && <div className="h-24" />}

            {showSelectionBar && (
                <SelectionBar
                    count={selectedCount}
                    note={selection.excludedCount > 0 ? pluralize(selection.excludedCount, 'excluido', 'excluidos') : undefined}
                    emptyHint="Marca los contactos que recibirán la campaña."
                    actionLabel={selectionActionLabel()}
                    onAction={handleSelectionAction}
                    onClear={selection.clear}
                    extraAction={!pickMode && (
                        // Eligiendo destinatarios no: ahí la barra es solo «Continuar».
                        <button
                            type="button"
                            onClick={() => setTagging(true)}
                            aria-label="Etiquetar"
                            className={`flex-none flex items-center justify-center gap-2 w-11 h-11 md:w-auto md:h-10 md:px-3.5 rounded-[9px] border
                                text-sm font-semibold text-white cursor-pointer transition-colors
                                ${tagging ? 'bg-brand-deep-active border-brand-accent' : 'border-brand-deep-active hover:bg-brand-deep-hover'}`}
                        >
                            <TagIcon size={15} /><span className="hidden md:inline">Etiquetar</span>
                        </button>
                    )}
                />
            )}

            {tagging && (
                <BulkTagDialog
                    selection={selection.recipientsInput}
                    count={selectedCount}
                    allMatching={selection.isAllMatching}
                    scope={matchingScope()}
                    onClose={() => setTagging(false)}
                    onDone={() => {
                        setTagging(false);
                        selection.clear();
                    }}
                />
            )}

            <TagManager open={managingTags} onClose={() => setManagingTags(false)} onShowContacts={tag => showTagContacts(tag.id)} />

            <ContactPanel state={panel} onChange={setPanel} />

            <ConfirmDialog
                open={Boolean(pendingChange)}
                title={pendingChange?.filter === undefined && pendingChange?.tagIds === undefined ? '¿Cambiar la búsqueda?' : '¿Cambiar el filtro?'}
                description={`Tienes ${pluralize(selectedCount, 'contacto seleccionado', 'contactos seleccionados')} de la búsqueda actual. Si la cambias, la selección empieza de cero.`}
                cancelLabel="Mantener selección"
                confirmLabel="Cambiar y quitar selección"
                onConfirm={confirmPendingChange}
                onCancel={() => setPendingChange(null)}
            />

            <DraftConflictDialog {...newCampaign.conflictDialog} />

            <ConfirmDialog
                open={showPickIntro}
                icon={<Send size={20} />}
                title="Elige quién recibe la campaña"
                description="Es el primer paso. Después eliges la plantilla y la revisas antes de enviarla."
                cancelLabel="Volver a Campañas"
                confirmLabel="Elegir contactos"
                onConfirm={closePickIntro}
                onCancel={closePickIntro}
                onSecondary={() => {
                    closePickIntro();
                    leavePickMode();
                }}
            >
                <ol className="grid gap-2.5 text-sm text-brand-strong">
                    {PICK_INTRO_STEPS.map((step, i) => (
                        <li key={i} className="flex gap-3">
                            <span className="flex-none w-6 h-6 rounded-full bg-brand-raised text-brand-gray-600
                                font-mono text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                            <span className="pt-0.5 leading-[1.5]">{step}</span>
                        </li>
                    ))}
                </ol>
            </ConfirmDialog>
        </PageShell>
    );
};
