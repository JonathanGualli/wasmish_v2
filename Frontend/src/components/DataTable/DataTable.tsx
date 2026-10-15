import { useRef, useState, type ReactNode } from "react";
import { getCoreRowModel, useReactTable, flexRender, type ColumnDef, type OnChangeFn, type PaginationState } from "@tanstack/react-table";
import { Checkbox } from "../Checkbox/Checkbox";
import { SkeletonStatus } from "../Skeleton/SkeletonFrame";
import { SkeletonNumber } from "../Skeleton/Skeleton";
import { SkeletonListRow, type SkeletonListRowProps } from "../Skeleton/SkeletonListRow";
import { SkeletonVisibleContext, useSyncedPulse } from "../Skeleton/skeletonShared";
import { useDelayedLoading } from "../../hooks/useDelayedLoading";
import { CELL_CLASS, CHECK_CELL_CLASS, TableLoadingBar, TableSkeletonRows } from "./TableSkeleton";

/**
 * Casillas para elegir filas. La tabla solo pinta: qué está elegido lo decide
 * quien la usa, porque la selección puede ir más allá de la página visible.
 */
export interface TableSelection<T> {
    isSelected: (row: T) => boolean;
    onToggle: (row: T) => void;
    /** Cómo se ve la casilla de la cabecera, que marca o desmarca la página. */
    pageState: 'none' | 'some' | 'all';
    onTogglePage: () => void;
    /** Encima de las filas: «Seleccionar los 455 que coinciden». */
    banner?: ReactNode;
}

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
    selection?: TableSelection<T>;
    /** Para el lector de pantalla en la primera carga: «Cargando contactos». */
    loadingLabel: string;
    /** Lo que se anuncia al terminar de cargar: «248 contactos». */
    resultLabel?: (total: number) => string;
    /** La fila de carga del móvil (con `renderMobileRow`): avatar, píldoras… */
    mobileSkeleton?: Omit<SkeletonListRowProps, 'index'>;
}

/**
 * Con qué empezó la carga en curso: sin filas, se enseña el skeleton; con
 * filas, se atenúan. Se decide al empezar y no cambia aunque los datos lleguen
 * durante el mínimo visible del skeleton. `finishedOnce`: ya terminó alguna
 * carga (para no anunciar «248 contactos» con datos que ya estaban).
 */
const useLoadPhase = (isLoading: boolean, hasRows: boolean) => {
    const [startedWithRows, setStartedWithRows] = useState(hasRows);
    const [wasLoading, setWasLoading] = useState(isLoading);
    const [finishedOnce, setFinishedOnce] = useState(false);
    if (isLoading !== wasLoading) {
        setWasLoading(isLoading);
        if (isLoading) setStartedWithRows(hasRows);
        else setFinishedOnce(true);
    }
    return { startedWithRows, finishedOnce };
};

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
    selection,
    loadingLabel,
    resultLabel,
    mobileSkeleton,
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
    const { pending, visible } = useDelayedLoading(isLoading);
    const { startedWithRows, finishedOnce } = useLoadPhase(isLoading, rows.length > 0);
    const showSkeleton = pending && !startedWithRows;
    const reloading = pending && startedWithRows;
    const tableRef = useRef<HTMLDivElement>(null);
    useSyncedPulse(tableRef, visible);

    const status = pending
        ? (visible ? (reloading ? `Cargando la página ${pagination.pageIndex + 1}` : loadingLabel) : '')
        : (finishedOnce && resultLabel ? resultLabel(totalCount) : '');
    const columnCount = columns.length + (selection ? 1 : 0);
    const rowBackground = (row: T, id: string) => {
      if (selection?.isSelected(row)) return 'bg-brand-green-50';
      return id === activeRowId ? 'bg-brand-bg' : '';
    };
    const rowCheckbox = (row: T, touch = false) => selection && (
      <Checkbox
        checked={selection.isSelected(row)}
        onChange={() => selection.onToggle(row)}
        label="Seleccionar fila"
        touch={touch}
      />
    );

return (
    <div ref={tableRef} aria-busy={pending} className="rounded-xl border border-brand-border bg-brand-surface relative overflow-hidden">
      <SkeletonStatus label={status} />
      {selection?.banner && (
        <div className="px-4 py-3 bg-brand-green-50 border-b border-brand-accent-soft text-[13px] text-brand-strong text-center">
          {selection.banner}
        </div>
      )}
      {renderMobileRow && (
        <div className="md:hidden relative divide-y divide-brand-border">
          {reloading && visible && <div className="absolute inset-x-0 top-0 z-10"><TableLoadingBar /></div>}
          {/* En móvil no hay cabecera de tabla: la casilla de la página va aquí. */}
          {selection && rows.length > 0 && !showSkeleton && (
            <div onClick={selection.onTogglePage} className="flex items-center gap-3 pl-4 pr-4 py-3 bg-brand-bg cursor-pointer">
              <Checkbox
                checked={selection.pageState === 'all'}
                indeterminate={selection.pageState === 'some'}
                onChange={selection.onTogglePage}
                label="Seleccionar la página"
                touch
              />
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">Seleccionar esta página</span>
            </div>
          )}
          {showSkeleton ? (
            <SkeletonVisibleContext.Provider value={visible}>
              {Array.from({ length: 9 }, (_, i) => <SkeletonListRow key={i} index={i} {...mobileSkeleton} />)}
            </SkeletonVisibleContext.Provider>
          ) : rows.length > 0 ? rows.map(row => (
            <div
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              inert={reloading}
              className={`${onRowClick ? 'cursor-pointer' : ''} ${rowBackground(row.original, row.id)}
                ${selection ? 'flex items-center pl-4' : ''} ${reloading ? 'opacity-50' : ''}`}
            >
              {rowCheckbox(row.original, true)}
              <div className="flex-1 min-w-0">{renderMobileRow(row.original)}</div>
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
                {selection && (
                  <th className="w-[1%] pl-4 pr-0 py-3">
                    <Checkbox
                      checked={selection.pageState === 'all'}
                      indeterminate={selection.pageState === 'some'}
                      onChange={selection.onTogglePage}
                      label="Seleccionar la página"
                    />
                  </th>
                )}
                {group.headers.map(header => (
                  <th key={header.id} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted whitespace-nowrap">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
            {reloading && visible && (
              <tr aria-hidden>
                <td colSpan={columnCount} className="p-0 h-0 relative">
                  <div className="absolute inset-x-0 top-0 z-10"><TableLoadingBar /></div>
                </td>
              </tr>
            )}
          </thead>

          <tbody inert={reloading} className={`divide-y divide-brand-border ${reloading ? 'opacity-50' : ''}`}>
            {showSkeleton ? (
              <SkeletonVisibleContext.Provider value={visible}>
                <TableSkeletonRows columns={columns} hasSelection={Boolean(selection)} />
              </SkeletonVisibleContext.Provider>
            ) : rows.length > 0 ? (
              rows.map(row => {
                const isActive = row.id === activeRowId;
                return (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`hover:bg-brand-bg transition-colors
                    ${onRowClick ? 'cursor-pointer' : ''} ${rowBackground(row.original, row.id)}`}
                >
                  {selection && <td className={CHECK_CELL_CLASS}><div className="min-h-[34px] flex items-center">{rowCheckbox(row.original)}</div></td>}
                  {row.getVisibleCells().map((cell, i) => (
                    <td
                      key={cell.id}
                      // La barra de la fila abierta va en la primera celda: el borde
                      // de un <tr> no se pinta con border-collapse.
                      className={`${CELL_CLASS}
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
                <td colSpan={columnCount} className="p-12 text-center text-sm text-brand-muted">
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
          <span className="flex items-center gap-1">Total:{' '}
            {showSkeleton
              ? <SkeletonVisibleContext.Provider value={visible}><SkeletonNumber width="28px" /></SkeletonVisibleContext.Provider>
              : <span className="font-mono tabular-nums text-brand-text">{totalCount}</span>}
          </span>
          {reloading && visible && <span className="text-xs font-semibold text-brand-accent-strong">Cargando…</span>}
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
