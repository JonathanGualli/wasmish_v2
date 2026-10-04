import type { ReactNode } from "react";
import { getCoreRowModel, useReactTable, flexRender, type ColumnDef, type OnChangeFn, type PaginationState } from "@tanstack/react-table";

interface Props<T> {
    data: T[];
    columns: ColumnDef<T>[]
    totalCount: number;
    pagination: {
        pageIndex: number;
        pageSize: number;
    };
    setPagination: OnChangeFn<PaginationState>;
    isLoading: boolean;
    /** Filas que se abren al pulsarlas (y la abierta se resalta, como en la bandeja). */
    onRowClick?: (row: T) => void;
    getRowId?: (row: T) => string;
    activeRowId?: string | null;
    /**
     * En móvil, cada fila como tarjeta en vez de la tabla (que obligaría a
     * desplazarse en horizontal). La paginación es la misma.
     */
    renderMobileRow?: (row: T) => ReactNode;
}

export function DataTable<T>({
    data,
    columns,
    totalCount,
    pagination,
    setPagination,
    isLoading,
    onRowClick,
    getRowId,
    activeRowId,
    renderMobileRow,
}: Props<T>) {

    const pageCount = Math.ceil(totalCount / pagination.pageSize);

    const table = useReactTable({
        data,
        columns,
        pageCount: pageCount ?? -1,
        state: { pagination },
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        manualPagination: true,
        getRowId,
    });

    const rows = table.getRowModel().rows;

return (
    <div className="rounded-xl border border-brand-border bg-brand-surface relative overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 bg-brand-surface/75 z-10 items-center justify-center flex">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-[3px] border-brand-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-brand-muted">Cargando datos…</span>
          </div>
        </div>
      )}
      {renderMobileRow && (
        <div className="md:hidden divide-y divide-brand-border">
          {rows.length > 0 ? rows.map(row => (
            <div
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={`${onRowClick ? 'cursor-pointer' : ''} ${row.id === activeRowId ? 'bg-brand-bg' : ''}`}
            >
              {renderMobileRow(row.original)}
            </div>
          )) : (
            <div className="p-12 text-center text-sm text-brand-muted">No se encontraron registros.</div>
          )}
        </div>
      )}

      <div className={`overflow-x-auto ${renderMobileRow ? 'hidden md:block' : ''}`}>
        <table className="w-full border-collapse">
          <thead className="bg-brand-bg border-b border-brand-border">
            {table.getHeaderGroups().map(group => (
              <tr key={group.id}>
                {group.headers.map(header => (
                  <th key={header.id} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted whitespace-nowrap">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-brand-border">
            {rows.length > 0 ? (
              rows.map(row => {
                const isActive = row.id === activeRowId;
                return (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`hover:bg-brand-bg transition-colors
                    ${onRowClick ? 'cursor-pointer' : ''} ${isActive ? 'bg-brand-bg' : ''}`}
                >
                  {row.getVisibleCells().map((cell, i) => (
                    <td
                      key={cell.id}
                      // La barra de la fila abierta va en la primera celda: el borde
                      // de un <tr> no se pinta con border-collapse.
                      className={`px-4 py-3.5 text-sm text-brand-text align-top
                        ${isActive && i === 0 ? 'shadow-[inset_3px_0_0_var(--color-brand-deep)]' : ''}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columns.length} className="p-12 text-center text-sm text-brand-muted">
                  No se encontraron registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación - Se mantiene igual pero genérica */}
      <div className="flex flex-col sm:flex-row justify-between items-center px-4 py-3 gap-4 text-sm border-t border-brand-border bg-brand-bg">
        <div className="flex items-center gap-4 text-brand-muted">
          <select
            value={pagination.pageSize}
            onChange={e => table.setPageSize(Number(e.target.value))}
            className="border border-brand-border-strong rounded-[8px] px-2.5 py-1.5 bg-brand-surface text-brand-text cursor-pointer outline-none focus:border-brand-success focus:ring-[3px] focus:ring-brand-accent-soft transition-colors"
          >
            {[10, 20, 50].map(size => <option key={size} value={size}>Mostrar {size}</option>)}
          </select>
          <span>Total: <span className="font-mono tabular-nums text-brand-text">{totalCount}</span></span>
        </div>

        <div className="flex gap-2 items-center">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-4 py-2 rounded-[8px] border border-brand-border-strong bg-brand-surface text-brand-accent-strong font-semibold cursor-pointer transition-colors hover:bg-brand-bg hover:border-brand-gray-400 disabled:text-brand-subtle disabled:border-brand-border disabled:bg-brand-raised disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <span className="px-3 font-mono text-[13px] tabular-nums text-brand-muted">
            {pagination.pageIndex + 1} / {table.getPageCount() || 1}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-4 py-2 rounded-[8px] border border-brand-border-strong bg-brand-surface text-brand-accent-strong font-semibold cursor-pointer transition-colors hover:bg-brand-bg hover:border-brand-gray-400 disabled:text-brand-subtle disabled:border-brand-border disabled:bg-brand-raised disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
