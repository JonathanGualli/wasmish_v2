import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, AlertTriangle, ChevronDown, ImageUp, LayoutTemplate, RefreshCw } from "lucide-react";
import { useFreshTemplatesOnMount, useTemplates } from "../../../hooks/useTemplates";
import { DataTable } from "../../../components/DataTable/DataTable";
import { CustomButton } from "../../../components/Button/Button";
import { PageShell, PageHeader } from "../../../components/Page/PageShell";
import { SearchInput } from "../../../components/SearchInput/SearchInput";
import { Callout } from "../../../components/Callout/Callout";
import { BlankState } from "../../../components/BlankState/BlankState";
import { Switch } from "../AutoReplies/Switch";
import { useLines } from "../../../hooks/useLines";
import { useAuthContext } from "../../../context/auth.context";
import { templateDetailPath } from "../../../models/routes.models";
import { headerMediaRule } from "../../../utils/templateHeader";
import {
    ALL_TEMPLATES, categoryLabel, filterTemplates, isTemplateSyncStale, oldestTemplateSync, templateCategories,
    templateStatusChips, type TemplateFilters, type TemplateStatusChip,
} from "../../../utils/templateDisplay";
import { templateColumns, templateLinesColumn } from "./TemplateColumns";
import { TemplateMobileRow } from "./TemplateCells";
import { TemplateSyncState } from "./TemplateSyncState";

const FIRST_PAGE = { pageIndex: 0, pageSize: 20 };
const NO_FILTERS: TemplateFilters = { query: '', status: ALL_TEMPLATES, category: ALL_TEMPLATES, showDeleted: false };

const StatusChips = ({ chips, value, onChange }: { chips: TemplateStatusChip[]; value: string; onChange: (value: string) => void }) => (
    // En el teléfono no caben: se desplazan de lado, sin barra.
    <div className="flex gap-1.5 max-md:overflow-x-auto max-md:-mx-4 max-md:px-4 [scrollbar-width:none]">
        {chips.map(chip => {
            const on = chip.value === value;
            return (
                <button key={chip.value} type="button" aria-pressed={on} onClick={() => onChange(chip.value)}
                    className={`inline-flex items-center gap-1.5 flex-none h-8 max-md:h-9 px-3 rounded-full text-xs font-semibold
                        cursor-pointer transition-colors
                        ${on ? 'bg-brand-accent-soft text-brand-accent-strong' : 'bg-brand-raised text-brand-gray-600 hover:bg-brand-border'}`}>
                    {chip.label}
                    <span className="font-mono font-medium tabular-nums opacity-75">{chip.count}</span>
                </button>
            );
        })}
    </div>
);

/** «Categoría: todas»: un desplegable nativo (en el teléfono abre el del sistema) con el aspecto del diseño. */
const CategorySelect = ({ categories, value, onChange }: { categories: string[]; value: string; onChange: (value: string) => void }) => (
    <label className={`relative inline-flex items-center gap-1.5 h-8 max-md:h-9 pl-3 pr-2.5 rounded-[8px] border text-[13px]
        text-brand-strong cursor-pointer transition-colors hover:bg-brand-bg
        has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-brand-accent-soft
        ${value === ALL_TEMPLATES ? 'border-brand-border-strong' : 'border-brand-accent-strong'}`}>
        Categoría: <span className="font-semibold">{value === ALL_TEMPLATES ? 'todas' : categoryLabel(value)}</span>
        <ChevronDown size={14} className="text-brand-muted" />
        <select value={value} onChange={event => onChange(event.target.value)} aria-label="Categoría"
            className="absolute inset-0 opacity-0 cursor-pointer">
            <option value={ALL_TEMPLATES}>Todas</option>
            {categories.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
    </label>
);

/**
 * Plantillas (diseño «Plantillas - Detalle», 1a y 1b): las de la cuenta, con
 * buscar y filtrar, y cada fila abre su detalle. Las borradas en Meta van
 * escondidas hasta que se piden. Al abrirla, el backend sincroniza los WABA
 * que llevan más de 10 minutos sin hacerlo.
 */
export const TemplatesPage = () => {
    const navigate = useNavigate();
    const [pagination, setPagination] = useState(FIRST_PAGE);
    const [chosen, setChosen] = useState(NO_FILTERS);
    const { templates, isLoading, isError, refetch, isSyncing, sync, syncError } = useTemplates();
    const freshPending = useFreshTemplatesOnMount();
    // Con varias líneas, de qué líneas es cada plantilla, junto a su nombre.
    const { hasManyLines } = useLines();
    // Sincronizar y subir la cabecera es gestionarlas: el agente solo las ve (Fase 3).
    const { can } = useAuthContext();
    const canManage = can('templates.manage');
    const columns = useMemo(
        () => (hasManyLines ? [templateColumns[0], templateLinesColumn, ...templateColumns.slice(1)] : templateColumns),
        [hasManyLines],
    );

    // Cambiar un filtro vuelve a la primera página: la que se estaba viendo puede no existir.
    const updateFilters = (change: Partial<TemplateFilters>) => {
        setChosen(current => ({ ...current, ...change }));
        setPagination(current => ({ ...current, pageIndex: 0 }));
    };

    const chips = useMemo(() => templateStatusChips(templates, chosen.showDeleted), [templates, chosen.showDeleted]);
    const categories = useMemo(() => templateCategories(templates), [templates]);
    // Tras sincronizar puede no quedar ninguna con el estado o la categoría elegidos:
    // entonces vale como «Todas» (si no, la tabla saldría vacía sin píldora marcada).
    const filters = {
        ...chosen,
        status: chips.some(c => c.value === chosen.status) ? chosen.status : ALL_TEMPLATES,
        category: categories.includes(chosen.category) ? chosen.category : ALL_TEMPLATES,
    };
    const visible = filterTemplates(templates, filters);
    const deletedCount = templates.filter(t => t.deletedInMetaAt).length;
    // Una borrada ya no se envía: no hace falta subirle nada.
    const missingMedia = templates.filter(t => !t.deletedInMetaAt && headerMediaRule(t) && !t.headerMedia).length;
    const syncedAt = oldestTemplateSync(templates);
    const checking = freshPending && templates.length > 0 && isTemplateSyncStale(syncedAt);
    const page = visible.slice(pagination.pageIndex * pagination.pageSize, (pagination.pageIndex + 1) * pagination.pageSize);

    // Las borradas que saldrían con los demás filtros (un estado las deja fuera: ya no tienen el de Meta).
    const hiddenDeleted = filters.showDeleted || filters.status !== ALL_TEMPLATES ? 0
        : filterTemplates(templates, { ...filters, showDeleted: true }).filter(t => t.deletedInMetaAt).length;
    const hiddenNote = hiddenDeleted > 0 && (
        <>
            {hiddenDeleted === 1 ? 'Una borrada en Meta, escondida.' : `${hiddenDeleted} borradas en Meta, escondidas.`}{' '}
            <button type="button" onClick={() => updateFilters({ showDeleted: true })}
                className="font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                {hiddenDeleted === 1 ? 'Mostrarla' : 'Mostrarlas'}
            </button>
        </>
    );

    return (
        <PageShell width="wide">
            <PageHeader
                icon={<LayoutTemplate size={20} />}
                title="Plantillas"
                description="Los mensajes que WhatsApp aprobó para escribir a quien no te ha escrito en 24 horas. Se crean en Meta; aquí se traen al sincronizar."
                actions={(canManage || checking || syncedAt) && (
                    <div className="flex items-center justify-between sm:justify-end gap-3.5">
                        <TemplateSyncState syncedAt={syncedAt} checking={checking} />
                        {canManage && (
                            <div className="h-10 flex-none">
                                <CustomButton isLoading={isSyncing} onClick={() => sync()} type="button">
                                    <RefreshCw size={16} /> Sincronizar
                                </CustomButton>
                            </div>
                        )}
                    </div>
                )}
            />
            {syncError && (
                <div className="mb-6">
                    <Callout tone="danger" icon={<AlertTriangle size={16} />} title="No se pudo sincronizar">
                        {syncError}
                    </Callout>
                </div>
            )}
            {missingMedia > 0 && (
                <div className="mb-6">
                    <Callout tone="warning" icon={<ImageUp size={16} />}
                        title={missingMedia === 1
                            ? 'Una plantilla no tiene guardado el archivo de su cabecera.'
                            : `${missingMedia} plantillas no tienen guardado el archivo de su cabecera.`}>
                        WhatsApp aprueba que la cabecera lleve una imagen (o un vídeo, o un documento), pero no cuál:
                        el archivo va en cada envío. En una campaña lo eliges al prepararla; para el chat o la API,
                        sube uno en la columna «Cabecera» (en el teléfono, al abrir la plantilla).
                    </Callout>
                </div>
            )}

            {isError ? (
                <BlankState tone="danger" icon={<AlertCircle size={22} />} title="No se pudieron cargar las plantillas"
                    action={
                        <CustomButton variant="outline" onClick={() => refetch()}>
                            <span className="flex items-center gap-2"><RefreshCw size={15} />Reintentar</span>
                        </CustomButton>
                    }>
                    Revisa tu conexión e inténtalo de nuevo.
                </BlankState>
            ) : <>
                <div className="mb-3.5 flex flex-col md:flex-row md:flex-wrap md:items-center gap-3">
                    <SearchInput value={filters.query} onChange={query => updateFilters({ query })}
                        placeholder="Buscar por nombre o texto" aria-label="Buscar plantillas" className="md:w-[280px]" />
                    <StatusChips chips={chips} value={filters.status} onChange={status => updateFilters({ status })} />
                    {categories.length > 1 && (
                        <div><CategorySelect categories={categories} value={filters.category} onChange={category => updateFilters({ category })} /></div>
                    )}
                    {deletedCount > 0 && (
                        <div className="md:ml-auto flex items-center gap-2.5 text-[13px] text-brand-strong">
                            <Switch size="sm" checked={filters.showDeleted} onChange={showDeleted => updateFilters({ showDeleted })}
                                label="Mostrar las borradas en Meta" />
                            <span aria-hidden className="cursor-pointer" onClick={() => updateFilters({ showDeleted: !filters.showDeleted })}>
                                Mostrar las borradas en Meta
                            </span>
                            <span className="font-mono text-xs text-brand-muted">{deletedCount}</span>
                        </div>
                    )}
                </div>

                <DataTable
                    data={page}
                    columns={columns}
                    totalCount={visible.length}
                    pagination={pagination}
                    setPagination={setPagination}
                    isLoading={isLoading || isSyncing}
                    loadingLabel="Cargando plantillas"
                    resultLabel={total => (total === 1 ? '1 plantilla' : `${total} plantillas`)}
                    getRowId={template => template.templateId}
                    onRowClick={template => navigate(templateDetailPath(template.templateId))}
                    renderMobileRow={template => <TemplateMobileRow template={template} showLines={hasManyLines} />}
                    mobileSkeleton={{ pills: 2 }}
                    footerNote={hiddenNote}
                />
            </>}
        </PageShell>
    );
};
