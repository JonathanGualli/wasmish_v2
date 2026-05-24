import { Home, Menu, Rocket, Settings, MessageSquare, LayoutTemplate, X } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../../models/routes.models';
import { useEffect, useMemo, useState } from 'react';

interface Props {
  collapsed: boolean;
  toggle: () => void;
  isMobile: boolean;
}

interface HandleButtonProps {
  value: string;
  path: string;
}

const WasmishMark = () => (
  <div className="w-7 h-7 bg-brand-accent rounded-lg flex items-center justify-center flex-shrink-0">
    <span className="text-black font-bold text-sm leading-none">W</span>
  </div>
);

export const Sidebar = ({ collapsed, toggle, isMobile }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [valueSelected, setValueSelected] = useState('');

  const navItems = useMemo(() => [
    { icon: <Rocket size={18} />,         text: 'Inicio Rápido', value: 'quickStart', path: `${AppRoutes.private.root}/${AppRoutes.private.quickStart}` },
    { icon: <Home size={18} />,           text: 'Dashboard',     value: 'dashboard',  path: `${AppRoutes.private.root}/${AppRoutes.private.dashboard}` },
    { icon: <MessageSquare size={18} />,  text: 'Chats',         value: 'chats',      path: `${AppRoutes.private.root}/${AppRoutes.private.chats}` },
    { icon: <LayoutTemplate size={18} />, text: 'Plantillas',    value: 'templates',  path: `${AppRoutes.private.root}/${AppRoutes.private.templates}` },
  ], []);

  const bottomItems = useMemo(() => [
    { icon: <Settings size={18} />, text: 'Ajustes', value: 'settings', path: `${AppRoutes.private.root}/${AppRoutes.private.settings}` },
  ], []);

  const allItems = useMemo(() => [...navItems, ...bottomItems], [navItems, bottomItems]);

  const handleButton = ({ value, path }: HandleButtonProps) => {
    setValueSelected(value);
    navigate(path);
  };

  useEffect(() => {
    const current = allItems.find(item => location.pathname === item.path);
    if (current) setValueSelected(current.value);
  }, [location.pathname, allItems]);

  return (
    <div
      className={`
        bg-brand-bg border-r border-brand-border h-screen flex flex-col
        transition-all duration-300
        ${collapsed ? 'w-[60px]' : 'w-[224px]'}
        ${isMobile ? 'fixed top-0 left-0 z-50 h-full' : 'relative'}
        ${isMobile && collapsed ? '-translate-x-full' : 'translate-x-0'}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-brand-border h-14 shrink-0">
        {collapsed ? (
          <button onClick={toggle} className="mx-auto cursor-pointer" title="Expandir menú">
            <WasmishMark />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <WasmishMark />
              <span className="font-semibold text-brand-text text-sm tracking-wide truncate">Wasmish</span>
            </div>
            <button
              onClick={toggle}
              className="text-brand-subtle hover:text-brand-muted transition-colors cursor-pointer ml-2 shrink-0"
              title={isMobile ? 'Cerrar menú' : 'Colapsar menú'}
            >
              {isMobile ? <X size={18} /> : <Menu size={18} />}
            </button>
          </>
        )}
      </div>

      {/* Nav principal */}
      <nav className="flex-1 overflow-y-auto px-2 pt-2 pb-1 flex flex-col gap-0.5">
        {navItems.map(({ icon, text, value, path }) => (
          <SidebarItem
            key={value}
            icon={icon}
            text={text}
            collapsed={collapsed}
            onTap={() => handleButton({ value, path })}
            isSelected={valueSelected === value}
          />
        ))}
      </nav>

      {/* Nav inferior — ajustes separados */}
      <div className="px-2 pt-2 pb-3 border-t border-brand-border shrink-0 flex flex-col gap-0.5">
        {bottomItems.map(({ icon, text, value, path }) => (
          <SidebarItem
            key={value}
            icon={icon}
            text={text}
            collapsed={collapsed}
            onTap={() => handleButton({ value, path })}
            isSelected={valueSelected === value}
          />
        ))}
      </div>
    </div>
  );
};
