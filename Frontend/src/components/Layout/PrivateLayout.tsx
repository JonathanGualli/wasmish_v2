import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from '../Sidebar/Sidebar';
import { LogoLockup } from '../Logo/Logo';
import { ChatsPath } from '../../models/routes.models';
import type { ChatsNavigationState } from '../../models/conversation.mode';

/**
 * Sin barra de título: la maqueta «Sidebar y Chats» da toda la altura al
 * contenido. La identidad, los ajustes y la salida viven en el sidebar, y cada
 * página trae su propio encabezado.
 *
 * En móvil sí queda una barra fina, porque sin ella no habría forma de abrir
 * el sidebar, que ahí está fuera de pantalla.
 */
export const PrivateLayout = ({ children }: { children: ReactNode }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate();

  // Tocar el aviso de un mensaje con Wasmish ya abierta: el service worker
  // enfoca esta ventana y pide abrir la conversación, sin recargar (public/sw.js).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'open-conversation' || typeof event.data.conversationId !== 'string') return;
      const state: ChatsNavigationState = { conversationId: event.data.conversationId };
      navigate(ChatsPath, { state });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  useEffect(() => {
    const checkSize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Por debajo de 1180px la barra colapsa a iconos (regla del manual).
      // Solo fuerza el colapso: si el usuario la expandió a mano en pantalla
      // ancha, un resize no debe volver a abrirla por su cuenta.
      if (mobile || window.innerWidth < 1180) setIsCollapsed(true);
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  return (
    <div className="flex h-screen bg-brand-bg">
      <Sidebar
        collapsed={isCollapsed}
        toggle={() => setIsCollapsed(!isCollapsed)}
        isMobile={isMobile}
      />

      {isMobile && !isCollapsed && (
        <div
          className="fixed inset-0 bg-brand-ink/50 z-40"
          onClick={() => setIsCollapsed(true)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Solo móvil: acceso al menú */}
        {isMobile && (
          <header className="h-14 bg-brand-surface border-b border-brand-border flex items-center gap-3 px-4 shrink-0">
            <button
              className="text-brand-muted hover:text-brand-text transition-colors cursor-pointer"
              onClick={() => setIsCollapsed(false)}
              title="Abrir menú"
            >
              <Menu size={20} />
            </button>
            <LogoLockup size="sm" />
          </header>
        )}

        <main className="flex-1 overflow-y-auto bg-brand-surface min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
};
