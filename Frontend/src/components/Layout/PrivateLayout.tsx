import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, LogOut } from 'lucide-react';
import { Sidebar } from '../Sidebar/Sidebar';
import { useAuthContext } from '../../context/auth.context';
import { AppRoutes } from '../../models/routes.models';

const PAGE_TITLES: Record<string, string> = {
  [AppRoutes.private.quickStart]: 'Inicio Rápido',
  [AppRoutes.private.dashboard]:  'Dashboard',
  [AppRoutes.private.chats]:      'Chats',
  [AppRoutes.private.templates]:  'Plantillas',
  [AppRoutes.private.settings]:   'Ajustes',
};

export const PrivateLayout = ({ children }: { children: ReactNode }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { logOut } = useAuthContext();
  const location = useLocation();

  const pageTitle = PAGE_TITLES[location.pathname.split('/').pop() ?? ''] ?? 'Wasmish';

  useEffect(() => {
    const checkSize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) setIsCollapsed(true);
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  return (
    <div className="flex h-screen bg-brand-surface">
      <Sidebar
        collapsed={isCollapsed}
        toggle={() => setIsCollapsed(!isCollapsed)}
        isMobile={isMobile}
      />

      {isMobile && !isCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsCollapsed(true)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-brand-bg border-b border-brand-border flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button
                className="text-brand-muted hover:text-brand-text transition-colors cursor-pointer"
                onClick={() => setIsCollapsed(false)}
                title="Abrir menú"
              >
                <Menu size={20} />
              </button>
            )}
            <span className="text-sm font-semibold text-brand-text">{pageTitle}</span>
          </div>

          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-brand-subtle hover:text-brand-danger transition-colors cursor-pointer"
            onClick={logOut}
            title="Cerrar sesión"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
