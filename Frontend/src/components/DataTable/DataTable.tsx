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
}

export function DataTable<T>({
    data,
    columns,
    totalCount,
    pagination,
    setPagination,
    isLoading
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
    });

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
      <div className="overflow-x-auto">
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
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-brand-bg transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3.5 text-sm text-brand-text align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
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
