import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  text: string;
  collapsed: boolean;
  onTap: () => void;
  isSelected: boolean;
  /** Contador (ej. chats sin leer). Colapsado se convierte en punto menta. */
  badge?: number;
  /** Tooltip al colapsar. En el teléfono no: ahí colapsada es cerrada, y el dedo dejaba el hover puesto. */
  tooltip?: boolean;
}

/**
 * Ítem de la barra oscura — «Sidebar y Chats» del manual de marca v1.0.
 * Reposo: `brand-on-deep`, peso 500.
 * Hover: solo cambia el fondo a `brand-deep-hover`.
 * Activo: barra menta de 3px pegada al borde + `brand-deep-active` + icono menta + peso 600.
 * Foco de teclado: anillo menta (lo aporta el `:focus-visible` global).
 *
 * Colapsado muestra un tooltip en verde 900 a la derecha, con 400ms de espera
 * para que no aparezca al barrer el ratón por la barra. En el teléfono no lo
 * lleva: al tocar un ítem la barra se cierra (colapsa) y el hover pegado del
 * toque dejaba la etiqueta flotando en el borde de la pantalla.
 */
export const SidebarItem = ({ icon, text, collapsed, onTap, isSelected, badge, tooltip = true }: Props) => (
  <button
    onClick={onTap}
    type="button"
    className={`
      group relative flex items-center w-full rounded-[9px] text-sm transition-colors
      ${collapsed ? 'justify-center py-2.5 px-0' : 'gap-[11px] px-3 py-2.5'}
      ${isSelected
        ? 'bg-brand-deep-active text-white font-semibold'
        : 'text-brand-on-deep font-medium hover:bg-brand-deep-hover hover:text-white'
      }
    `}
  >
    {/* Barra menta que marca el activo */}
    {isSelected && (
      <span className="absolute left-0 top-[9px] bottom-[9px] w-[3px] rounded-r-[3px] bg-brand-accent" />
    )}

    <span className={`flex-shrink-0 ${isSelected ? 'text-brand-accent' : ''}`}>{icon}</span>

    {/* Un nombre largo («Respuestas automáticas») pasa a dos líneas; en una sola no
        cabía y el menú salía con scroll horizontal. El mínimo evita que, mientras la
        barra se abre (300 ms), el texto se parta en muchas líneas: ahí se recorta. */}
    {!collapsed && <span className="min-w-[124px] text-left leading-[1.25]">{text}</span>}

    {badge !== undefined && badge > 0 && (
      collapsed ? (
        <span className="absolute top-1.5 right-3.5 w-2 h-2 rounded-full bg-brand-accent" />
      ) : (
        <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5
          rounded-full bg-brand-accent text-brand-ink text-[11px] font-bold tabular-nums">
          {badge}
        </span>
      )
    )}

    {/* Tooltip de la variante colapsada */}
    {collapsed && tooltip && (
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap
          rounded-md bg-brand-ink px-2.5 py-1.5 text-xs font-medium text-white
          opacity-0 transition-opacity delay-[400ms] group-hover:opacity-100"
      >
        {text}
      </span>
    )}
  </button>
);
