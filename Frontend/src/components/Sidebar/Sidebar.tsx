import { Menu, Rocket, Settings, MessageSquare, Users, Send, LayoutTemplate, BookOpen, X, ShieldCheck, LogOut, Reply } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { useAuthContext } from '../../context/auth.context';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../../models/routes.models';
import type { ContactsNavigationState } from '../../models/contact.model';
import { useEffect, useMemo, useState } from 'react';
import { Logo, LogoLockup } from '../Logo/Logo';
import { useConversations } from '../../hooks/useConversations';
import { initials } from '../../utils/initials';
import { APP_VERSION } from '../../config/version';
import { ROLE_LABEL, hasTeam } from "../../utils/roleDisplay";
import { useGuardedNavigation } from '../Layout/NavigationGuardContext';

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

  const { user, logOut, can } = useAuthContext();
  const guarded = useGuardedNavigation();
  const canCampaigns = can('campaigns.manage');
  const canAutoReplies = can('autoReplies.manage');
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
      { icon: <Users size={18} />,          text: 'Contactos',      value: 'contacts',   path: `${AppRoutes.private.root}/${AppRoutes.private.contacts}`,   badge: undefined },
      // El agente no tiene campañas (Fase 3): no se le enseñan, ni apagadas.
      ...(canCampaigns ? [{ icon: <Send size={18} />, text: 'Campañas', value: 'campaigns', path: `${AppRoutes.private.root}/${AppRoutes.private.campaigns}`, badge: undefined }] : []),
      { icon: <LayoutTemplate size={18} />, text: 'Plantillas',     value: 'templates',  path: `${AppRoutes.private.root}/${AppRoutes.private.templates}`,  badge: undefined },
      // Solo owner y admin: la configuración vale para todas las líneas.
      ...(canAutoReplies ? [{ icon: <Reply size={18} />, text: 'Respuestas automáticas', value: 'autoReplies', path: `${AppRoutes.private.root}/${AppRoutes.private.autoReplies}`, badge: undefined }] : []),
      { icon: <BookOpen size={18} />,       text: 'Documentación',  value: 'docs',       path: `${AppRoutes.private.root}/${AppRoutes.private.docs}`,       badge: undefined },
    ];

    // Solo el operador del SaaS ve el back-office. Ocultarlo es cosmético:
    // quien lo bloquea de verdad es requireSuperadmin en el backend.
    if (user?.isSuperadmin) {
      items.push({ icon: <ShieldCheck size={18} />, text: 'Administración', value: 'admin', path: `${AppRoutes.private.root}/${AppRoutes.private.admin}`, badge: undefined });
    }

    return items;
  }, [user?.isSuperadmin, unread, canCampaigns, canAutoReplies]);

  const allItems = useMemo(
    () => [...navItems, { value: 'settings', path: `${AppRoutes.private.root}/${AppRoutes.private.settings}` }],
    [navItems]
  );

  // Con cambios sin guardar, la página abierta puede preguntar antes (NavigationGuardContext).
  const handleButton = ({ value, path }: HandleButtonProps) => guarded(() => {
    setValueSelected(value);
    navigate(path);
    if (isMobile) toggle();
  });

  // Contactos eligiendo los destinatarios de una campaña es el paso 1 de esa
  // campaña: se marca «Campañas», no «Contactos».
  const pickingRecipients = Boolean((location.state as ContactsNavigationState | null)?.campaignPick);

  useEffect(() => {
    if (pickingRecipients) {
      setValueSelected('campaigns');
      return;
    }
    // También en las subrutas: el detalle de una campaña sigue siendo «Campañas».
    const current = allItems.find(item => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
    if (current) setValueSelected(current.value);
  }, [location.pathname, pickingRecipients, allItems]);

  return (
    <div
      className={`
        bg-brand-deep flex flex-col px-[14px] pt-[calc(20px+var(--safe-top))] pb-[calc(16px+var(--safe-bottom))]
        transition-all duration-300
        ${collapsed ? 'w-[76px]' : 'w-[236px]'}
        ${isMobile ? 'fixed top-0 left-0 z-50 h-full' : 'relative h-full'}
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
            tooltip={!isMobile}
            onTap={() => handleButton({ value, path })}
            isSelected={valueSelected === value}
          />
        ))}
      </nav>

      {/* Bloque inferior — ajustes, salida y la identidad de quien responde. La
          columna no crece con el texto: «Owner · Nombre largo del negocio» se corta. */}
      <div className="mt-auto grid grid-cols-[minmax(0,1fr)] gap-[3px] shrink-0">
        <div className="h-px bg-brand-deep-active mx-2 mb-3" />

        <SidebarItem
          icon={<Settings size={18} />}
          text="Ajustes"
          collapsed={collapsed}
          tooltip={!isMobile}
          onTap={() => handleButton({ value: 'settings', path: `${AppRoutes.private.root}/${AppRoutes.private.settings}` })}
          isSelected={valueSelected === 'settings'}
        />

        <SidebarItem
          icon={<LogOut size={18} />}
          text="Cerrar sesión"
          collapsed={collapsed}
          tooltip={!isMobile}
          onTap={() => guarded(logOut)}
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
              {/* Con equipo, el rol junto al negocio: así cada uno sabe por qué ve lo que ve. */}
              {hasTeam(user) && user?.role ? (
                <div className="text-[11px] text-brand-on-deep-muted truncate">
                  {ROLE_LABEL[user.role]}{user.account?.name ? ` · ${user.account.name}` : ''}
                </div>
              ) : user?.email && (
                <div className="text-[11px] text-brand-on-deep-muted truncate">
                  {user.email}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Versión — dato comparable, así que va en mono. Colapsada no cabe en
            76px: ahí vive en el tooltip del bloque de identidad, arriba. */}
        {!collapsed && (
          <div className="mt-2 px-1 font-mono tabular-nums text-[11px] text-brand-on-deep-subtle">
            v{APP_VERSION}
          </div>
        )}
      </div>
    </div>
  );
};
