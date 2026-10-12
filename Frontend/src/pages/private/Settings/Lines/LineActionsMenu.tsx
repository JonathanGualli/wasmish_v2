import type { ReactNode } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { MoreHorizontal } from "lucide-react";
import type { Line } from "../../../../models/line.model";
import { LineSwatch } from "../../../../components/Line/LineSwatch";
import { lineLabel, lineNumber } from "../../../../utils/lineDisplay";

interface Props {
    line: Line;
    colorClass: string;
    onRename: () => void;
    onMakeDefault: () => void;
    onShowDetails: () => void;
    onCopyId: () => void;
    onDisconnect: () => void;
}

const Item = ({ onClick, danger = false, hint, className = '', children }: {
    onClick: () => void; danger?: boolean; hint?: string; className?: string; children: ReactNode;
}) => (
    <MenuItem>
        <button type="button" onClick={onClick}
            className={`w-full text-left grid gap-px rounded-[8px] px-3 py-2.5 max-sm:min-h-12 cursor-pointer
                data-[focus]:bg-brand-bg ${className}`}>
            <span className={`text-sm ${danger ? 'font-semibold text-brand-danger' : 'font-medium text-brand-text'}`}>{children}</span>
            {hint && <span className="text-xs text-brand-muted">{hint}</span>}
        </button>
    </MenuItem>
);

/**
 * Las acciones de una línea conectada, en su «⋯»: un menú junto a la fila y,
 * en móvil, una hoja inferior (con «Ver detalles técnicos», que en escritorio
 * es el botón «Detalles» de la fila).
 */
export const LineActionsMenu = ({ line, colorClass, onRename, onMakeDefault, onShowDetails, onCopyId, onDisconnect }: Props) => (
    <Menu>
        {({ open }) => (
            <>
                <MenuButton aria-label={`Acciones de ${lineLabel(line)}`}
                    className={`flex-none w-8 h-8 max-sm:w-11 max-sm:h-11 rounded-[8px] flex items-center justify-center
                        text-brand-gray-600 hover:bg-brand-bg transition-colors cursor-pointer ${open ? 'bg-brand-bg' : ''}`}>
                    <MoreHorizontal size={16} />
                </MenuButton>
                {open && <div aria-hidden className="sm:hidden fixed inset-0 z-40 bg-brand-ink/50" />}
                <MenuItems
                    className="absolute z-50 right-[18px] top-[52px] w-60 rounded-xl border border-brand-border bg-brand-surface p-1.5
                        shadow-[0_18px_44px_rgba(14,17,22,0.16)] focus:outline-none
                        max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full
                        max-sm:rounded-b-none max-sm:rounded-t-[20px] max-sm:px-4 max-sm:pt-2.5 max-sm:pb-7">
                    <div className="sm:hidden">
                        <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-brand-border-strong" />
                        <div className="flex items-center gap-2.5 px-1 pb-3">
                            <LineSwatch colorClass={colorClass} />
                            <span className="text-base font-bold text-brand-text">{lineLabel(line)}</span>
                            <span className="font-mono text-[12.5px] text-brand-muted">{lineNumber(line)}</span>
                        </div>
                    </div>
                    <Item onClick={onRename}>Cambiar nombre</Item>
                    {!line.isDefault && (
                        <Item onClick={onMakeDefault} hint="La API enviará por aquí si no indica otra.">Hacer línea por defecto</Item>
                    )}
                    <Item onClick={onShowDetails} className="sm:hidden">Ver detalles técnicos</Item>
                    <Item onClick={onCopyId}>Copiar ID de línea</Item>
                    <div className="my-1 border-t border-brand-raised" />
                    <Item onClick={onDisconnect} danger>Desconectar…</Item>
                </MenuItems>
            </>
        )}
    </Menu>
);
