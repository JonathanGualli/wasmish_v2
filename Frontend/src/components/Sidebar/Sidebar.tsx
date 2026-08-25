import { Menu, Rocket, Settings, MessageSquare, LayoutTemplate, BookOpen, X, ShieldCheck, LogOut } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { useAuthContext } from '../../context/auth.context';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../../models/routes.models';
import { useEffect, useMemo, useState } from 'react';
import { Logo, LogoLockup } from '../Logo/Logo';
import { useConversations } from '../../hooks/useConversations';
import { initials } from '../../utils/initials';
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

  const { user, logOut } = useAuthContext();
  const { data: conversations } = useConversations();

  // El contador de la barra es el total de conversaciones con mensajes sin leer.
  const unread = useMemo(
    () => conversations?.reduce((n, c) => n + (c.unreadCount > 0 ? 1 : 0), 0) ?? 0,
    [conversations]
  );

  const navItems = useMemo(() => {
    const items = [
      { icon: <Rocket size={18} />,         text: 'Inicio rápido',  value: 'quickStart', path: `${AppRoutes.private.root}/${AppRoutes.private.quickStart}`, badge: undefined as number | undefined },
      { icon: <MessageSquare size={18} />,  text: 'Chats',          value: 'chats',      path: `${AppRoutes.private.root}/${AppRoutes.private.chats}`,      badge: unread },
      { icon: <LayoutTemplate size={18} />, text: 'Plantillas',     value: 'templates',  path: `${AppRoutes.private.root}/${AppRoutes.private.templates}`,  badge: undefined },
      { icon: <BookOpen size={18} />,       text: 'Documentación',  value: 'docs',       path: `${AppRoutes.private.root}/${AppRoutes.private.docs}`,       badge: undefined },
    ];

    // Solo el operador del SaaS ve el back-office. Ocultarlo es cosmético:
    // quien lo bloquea de verdad es requireSuperadmin en el backend.
    if (user?.rol === 'superadmin') {
      items.push({ icon: <ShieldCheck size={18} />, text: 'Administración', value: 'admin', path: `${AppRoutes.private.root}/${AppRoutes.private.admin}`, badge: undefined });
    }

    return items;
  }, [user?.rol, unread]);

  const allItems = useMemo(
    () => [...navItems, { value: 'settings', path: `${AppRoutes.private.root}/${AppRoutes.private.settings}` }],
    [navItems]
  );

  const handleButton = ({ value, path }: HandleButtonProps) => {
    setValueSelected(value);
    navigate(path);
    if (isMobile) toggle();
  };

  useEffect(() => {
    const current = allItems.find(item => location.pathname === item.path);
    if (current) setValueSelected(current.value);
  }, [location.pathname, allItems]);

  return (
    <div
      className={`
        bg-brand-deep h-screen flex flex-col px-[14px] pt-5 pb-4
        transition-all duration-300
        ${collapsed ? 'w-[76px]' : 'w-[236px]'}
        ${isMobile ? 'fixed top-0 left-0 z-50 h-full' : 'relative'}
        ${isMobile && collapsed ? '-translate-x-full' : 'translate-x-0'}
      `}
    >
      {/* Lockup inverso */}
      <div className="flex items-center gap-[11px] px-2 shrink-0">
        {collapsed ? (
          <button onClick={toggle} className="mx-auto cursor-pointer" title="Expandir menú">
            <Logo className="w-[34px] h-[34px]" variant="mint" />
          </button>
        ) : (
          <>
            <LogoLockup onDeep />
            <button
              onClick={toggle}
              className="ml-auto shrink-0 text-brand-on-deep-muted hover:text-white transition-colors cursor-pointer"
              title={isMobile ? 'Cerrar menú' : 'Colapsar menú'}
            >
              {isMobile ? <X size={18} /> : <Menu size={18} />}
            </button>
          </>
        )}
      </div>

      {/* Nav principal */}
      {!collapsed && (
        <div className="mt-7 px-2 pb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-on-deep-subtle">
          Trabajo
        </div>
      )}
      <nav className={`grid gap-[3px] min-h-0 ${collapsed ? 'mt-7' : 'overflow-y-auto'}`}>
        {navItems.map(({ icon, text, value, path, badge }) => (
          <SidebarItem
            key={value}
            icon={icon}
            text={text}
            badge={badge}
            collapsed={collapsed}
            onTap={() => handleButton({ value, path })}
            isSelected={valueSelected === value}
          />
        ))}
      </nav>

      {/* Bloque inferior — ajustes, salida y la identidad de quien responde */}
      <div className="mt-auto grid gap-[3px] shrink-0">
        <div className="h-px bg-brand-deep-active mx-2 mb-3" />

        <SidebarItem
          icon={<Settings size={18} />}
          text="Ajustes"
          collapsed={collapsed}
          onTap={() => handleButton({ value: 'settings', path: `${AppRoutes.private.root}/${AppRoutes.private.settings}` })}
          isSelected={valueSelected === 'settings'}
        />

        <SidebarItem
          icon={<LogOut size={18} />}
          text="Cerrar sesión"
          collapsed={collapsed}
          onTap={logOut}
          isSelected={false}
        />

        {/* Identidad — quién está respondiendo */}
        <div
          className={`mt-2.5 flex items-center gap-2.5 rounded-[9px] bg-brand-ink
            ${collapsed ? 'justify-center p-2' : 'px-3 py-2.5'}`}
          title={collapsed ? `${user?.name ?? ''} · v${APP_VERSION}` : undefined}
        >
          <div className="w-[30px] h-[30px] rounded-lg bg-brand-accent text-brand-ink
            text-[11px] font-bold flex items-center justify-center flex-none">
            {initials(user?.name || user?.email || '')}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">
                {user?.name ?? 'Mi cuenta'}
              </div>
              <div className="text-[11px] text-brand-on-deep-muted truncate">
                {user?.email ?? `v${APP_VERSION}`}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
