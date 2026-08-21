import { Menu, Rocket, Settings, MessageSquare, LayoutTemplate, BookOpen, X, ShieldCheck } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { useAuthContext } from '../../context/auth.context';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../../models/routes.models';
import { useEffect, useMemo, useState } from 'react';
import { Logo } from '../Logo/Logo';
import { APP_VERSION } from '../../config/version';

interface Props {
  collapsed: boolean;
  toggle: () => void;
  isMobile: boolean;
}

interface HandleButtonProps {
  value: string;
  path: string;
}

export const Sidebar = ({ collapsed, toggle, isMobile }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [valueSelected, setValueSelected] = useState('');

  const { user } = useAuthContext(); 

  const navItems = useMemo(() => {
    const items = [
      { icon: <Rocket size={18} />,         text: 'Inicio Rápido', value: 'quickStart', path: `${AppRoutes.private.root}/${AppRoutes.private.quickStart}` },
      { icon: <MessageSquare size={18} />,  text: 'Chats',         value: 'chats',      path: `${AppRoutes.private.root}/${AppRoutes.private.chats}` },
      { icon: <LayoutTemplate size={18} />, text: 'Plantillas',    value: 'templates',  path: `${AppRoutes.private.root}/${AppRoutes.private.templates}` },
      { icon: <BookOpen size={18} />,       text: 'Documentación', value: 'docs',       path: `${AppRoutes.private.root}/${AppRoutes.private.docs}` },
    ];

    // Solo el operador del SaaS ve el back-office. Ocultarlo es cosmético:
    // quien lo bloquea de verdad es requireSuperadmin en el backend.
    if (user?.rol === 'superadmin') {
      items.push({ icon: <ShieldCheck size={18} />, text: 'Administración', value: 'admin', path: `${AppRoutes.private.root}/${AppRoutes.private.admin}` });
    }

    return items;
  }, [user?.rol]);


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
            <Logo className="w-7 h-7" />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <Logo className="w-7 h-7" />
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
      <div className="px-2 pt-2 pb-2 border-t border-brand-border shrink-0 flex flex-col gap-0.5">
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

        {/* Versión de la app */}
        {collapsed ? (
          <span
            className="mx-auto mt-1 text-[9px] font-medium text-brand-subtle tabular-nums"
            title={`Wasmish v${APP_VERSION}`}
          >
            v{APP_VERSION}
          </span>
        ) : (
          <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-accent flex-shrink-0" />
            <span className="text-[11px] text-brand-subtle tracking-wide">
              Wasmish <span className="text-brand-muted font-medium tabular-nums">v{APP_VERSION}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
