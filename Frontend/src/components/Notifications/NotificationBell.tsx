import { useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { SidebarItem } from "../Sidebar/SidebarItem";
import { NotificationPanel } from "./NotificationPanel";

interface Props {
    /** `sidebar`: un ítem de la barra oscura (computadora, 5a). `bar`: el botón de la barra de arriba (celular, m1). */
    variant: 'sidebar' | 'bar';
    collapsed?: boolean;
    tooltip?: boolean;
}

/** El número sobre la campana, con el borde del color de la barra en que va. */
const CountBadge = ({ count, onDeep }: { count: number; onDeep: boolean }) => (
    <span className={`absolute -top-2 -right-2.5 min-w-[19px] h-[19px] px-1 box-border rounded-[10px] border-2
        bg-brand-accent text-brand-ink text-[10px] font-bold tabular-nums flex items-center justify-center
        ${onDeep ? 'border-brand-deep' : 'border-brand-surface'}`}>
        {count > 99 ? '99+' : count}
    </span>
);

/**
 * La campanita de los avisos de la asignación (spec § 8.3), con el número de
 * sin ver. Solo con equipo: con una persona en la cuenta no hay avisos y no se
 * pinta. Abre el panel: en la computadora sale junto a la barra; en el celular,
 * a pantalla completa.
 */
export const NotificationBell = ({ variant, collapsed = false, tooltip = true }: Props) => {
    const { enabled, unseenCount } = useNotifications();
    const [panel, setPanel] = useState<{ left: number } | null>(null);
    const anchor = useRef<HTMLSpanElement>(null);
    const fullScreen = useMediaQuery('(max-width: 767px)');

    if (!enabled) return null;

    const toggle = () => {
        if (panel) {
            setPanel(null);
            return;
        }
        // El panel empieza a la derecha de la barra, sea cual sea su ancho.
        const bar = anchor.current?.closest('[data-sidebar]')?.getBoundingClientRect();
        setPanel({ left: (bar?.right ?? 76) + 8 });
    };
    const close = () => setPanel(null);
    const label = unseenCount > 0 ? `Avisos, ${unseenCount} sin ver` : 'Avisos';

    return (
        <>
            {variant === 'sidebar' ? (
                <SidebarItem
                    icon={(
                        <span ref={anchor} className="relative flex">
                            <Bell size={18} />
                            {collapsed && unseenCount > 0 && <CountBadge count={unseenCount} onDeep />}
                        </span>
                    )}
                    text="Avisos"
                    badge={collapsed ? undefined : unseenCount}
                    collapsed={collapsed}
                    tooltip={tooltip}
                    onTap={toggle}
                    isSelected={panel !== null}
                />
            ) : (
                <button type="button" onClick={toggle} title={label} aria-label={label}
                    className="relative w-10 h-10 flex items-center justify-center flex-none rounded-lg
                        text-brand-strong hover:bg-brand-bg cursor-pointer transition-colors">
                    <span className="relative flex">
                        <Bell size={22} />
                        {unseenCount > 0 && <CountBadge count={unseenCount} onDeep={false} />}
                    </span>
                </button>
            )}
            {panel && <NotificationPanel onClose={close} fullScreen={fullScreen} left={panel.left} />}
        </>
    );
};
