import { useState, type ReactNode } from "react";
import { AlertCircle, Plus, RefreshCw, Search, Users } from "lucide-react";
import { PageShell, PageHeader } from "../../../components/Page/PageShell";
import { DataTable } from "../../../components/DataTable/DataTable";
import { CustomButton } from "../../../components/Button/Button";
import { useContacts } from "../../../hooks/useContacts";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import type { Contact, ContactFilter } from "../../../models/contact.model";
import { contactColumns } from "./ContactColumns";
import { ContactMobileRow } from "./ContactRow";
import { ContactPanel, type ContactPanelState } from "./ContactPanel";

const FILTERS: { value: ContactFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'with_conversation', label: 'Con conversación' },
    { value: 'without_conversation', label: 'Sin conversación' },
    { value: 'opted_out', label: 'Baja de publicidad' },
];

const FIRST_PAGE = { pageIndex: 0, pageSize: 20 };

/** Estado a pantalla completa (lista vacía, error…): icono, título, texto y una acción. */
const BlankState = ({ icon, tone = 'neutral', title, children, action }: {
    icon: ReactNode;
    tone?: 'neutral' | 'danger';
    title: string;
    children: ReactNode;
    action?: ReactNode;
}) => (
    <div className="border border-brand-border rounded-xl px-8 py-16 grid justify-items-center gap-2.5 text-center">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center
            ${tone === 'danger' ? 'bg-brand-danger-soft text-brand-danger' : 'bg-brand-bg text-brand-muted'}`}>
            {icon}
        </div>
        <div className="text-[17px] font-semibold text-brand-text">{title}</div>
        <div className="max-w-[420px] text-sm leading-[1.6] text-brand-muted">{children}</div>
        {action && <div className="mt-2 h-10">{action}</div>}
    </div>
);

/**
 * Contactos: la agenda de las personas con las que habla el negocio. Se crean
 * solos cuando alguien escribe, o a mano. La ficha, crear y editar viven en un
 * panel lateral sobre la lista (`ContactPanel`).
 */
export const ContactsPage = () => {
    const [pagination, setPagination] = useState(FIRST_PAGE);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<ContactFilter>('all');
    const [panel, setPanel] = useState<ContactPanelState | null>(null);

    const search = useDebouncedValue(query.trim(), 300);
    const { data, isLoading, isError, isPlaceholderData, refetch } =
        useContacts(pagination.pageIndex, pagination.pageSize, search, filter);

    // Otra búsqueda u otro filtro empiezan desde la primera página.
    const changeQuery = (value: string) => {
        setQuery(value);
        setPagination(p => ({ ...p, pageIndex: 0 }));
    };
    const changeFilter = (value: ContactFilter) => {
        setFilter(value);
        setPagination(p => ({ ...p, pageIndex: 0 }));
    };

    const totalCount = data?.totalCount ?? 0;
    const filtering = Boolean(search) || filter !== 'all';
    const isEmpty = data && totalCount === 0 && !filtering;
    const filterLabel = FILTERS.find(f => f.value === filter)?.label;
    const openContact = (contact: Contact) => setPanel({ mode: 'view', id: contact.id });

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
                columns={contactColumns}
                totalCount={totalCount}
                pagination={pagination}
                setPagination={setPagination}
                isLoading={isLoading || isPlaceholderData}
                getRowId={contact => contact.id}
                onRowClick={openContact}
                activeRowId={panel && panel.mode !== 'create' ? panel.id : null}
                renderMobileRow={contact => <ContactMobileRow contact={contact} />}
            />
        );
    };

    return (
        <PageShell width="wide">
            <PageHeader
                icon={<Users size={20} />}
                title="Contactos"
                description="Las personas con las que habla tu negocio por WhatsApp."
                actions={
                    <div className="w-full sm:w-auto h-10">
                        <CustomButton onClick={() => setPanel({ mode: 'create' })}>
                            <span className="flex items-center justify-center gap-2"><Plus size={16} />Nuevo contacto</span>
                        </CustomButton>
                    </div>
                }
            />

            {!isEmpty && !(isError && !data) && (
                <div className="mb-4 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="relative flex items-center md:w-[340px]">
                        <Search size={16} className="absolute left-[11px] text-brand-subtle pointer-events-none" />
                        <input
                            value={query}
                            onChange={e => changeQuery(e.target.value)}
                            placeholder="Buscar por nombre, teléfono, usuario, email o empresa"
                            className="w-full box-border text-[13px] text-brand-text bg-brand-bg
                                border border-brand-border rounded-lg py-2.5 pl-[34px] pr-3
                                placeholder:text-brand-subtle
                                focus:outline-none focus:bg-brand-surface focus:border-brand-success
                                focus:ring-[3px] focus:ring-brand-accent-soft transition-colors"
                        />
                    </div>
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
                    </div>
                    {data && (
                        <span className="md:ml-auto font-mono text-xs text-brand-muted tabular-nums">
                            {totalCount === 1 ? '1 contacto' : `${totalCount} contactos`}
                        </span>
                    )}
                </div>
            )}

            {renderBody()}

            <ContactPanel state={panel} onChange={setPanel} />
        </PageShell>
    );
};
