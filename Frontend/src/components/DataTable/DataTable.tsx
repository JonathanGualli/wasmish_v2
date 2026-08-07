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
    <div className="rounded-xl border border-brand-border bg-brand-surface relative overflow-hidden shadow-sm">
      {isLoading && (
        <div className="absolute inset-0 bg-brand-surface/60 z-10 items-center justify-center flex backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium text-brand-muted">Cargando datos...</span>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-brand-raised border-b border-brand-border">
            {table.getHeaderGroups().map(group => (
              <tr key={group.id}>
                {group.headers.map(header => (
                  <th key={header.id} className="p-4 text-left text-xs font-semibold text-brand-muted uppercase tracking-wider">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-brand-border">
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-brand-raised/50 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="p-4 text-sm text-brand-text">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="p-10 text-center text-brand-subtle">
                  No se encontraron registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación - Se mantiene igual pero genérica */}
      <div className="flex flex-col sm:flex-row justify-between items-center p-4 gap-4 text-sm border-t border-brand-border bg-brand-raised/30">
        <div className="flex items-center gap-4 text-brand-muted">
          <select
            value={pagination.pageSize}
            onChange={e => table.setPageSize(Number(e.target.value))}
            className="border border-brand-border rounded-md p-1.5 bg-brand-raised text-brand-text outline-none focus:ring-2 focus:ring-brand-accent"
          >
            {[10, 20, 50].map(size => <option key={size} value={size}>Mostrar {size}</option>)}
          </select>
          <span>Total: {totalCount}</span>
        </div>

        <div className="flex gap-2 items-center">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-4 py-2 border border-brand-border rounded-lg bg-brand-raised text-brand-text hover:bg-brand-border disabled:opacity-30 transition-all font-medium"
          >
            Anterior
          </button>
          <span className="px-4 font-medium text-brand-muted">
            {pagination.pageIndex + 1} / {table.getPageCount() || 1}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-4 py-2 border border-brand-border rounded-lg bg-brand-raised text-brand-text hover:bg-brand-border disabled:opacity-30 transition-all font-medium"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
