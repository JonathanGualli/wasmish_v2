import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from '../Sidebar/Sidebar';
import { LogoLockup } from '../Logo/Logo';
import { ChatsPath } from '../../models/routes.models';
import type { ChatsNavigationState } from '../../models/conversation.mode';
import { MobileMenuContext } from './MobileMenuContext';
import { NavigationGuardContext, useNavigationGuardValue } from './NavigationGuardContext';
import { useTransferAnswers } from '../../hooks/useTransferRequest';

/**
 * Sin barra de título: la maqueta «Sidebar y Chats» da toda la altura al
 * contenido. La identidad, los ajustes y la salida viven en el sidebar, y cada
 * página trae su propio encabezado.
 *
 * En móvil sí queda una barra fina, porque sin ella no habría forma de abrir
 * el sidebar, que ahí está fuera de pantalla. Menos en Chats, que se ve como una
 * app de mensajería y lleva su propio ☰ (diseño «Wasmish Móvil», E1).
 *
 * El alto es `--app-height` (el que se ve con el teclado del iPhone abierto,
 * `libs/viewport.ts`) o `100dvh`; las zonas seguras (muesca, barra de inicio),
 * `--safe-top` y `--safe-bottom` (`App.css`).
 */
export const PrivateLayout = ({ children }: { children: ReactNode }) => {
  // El primer valor sale del ancho ya, no del efecto de abajo: si no, el
  // teléfono pintaba la barra abierta y la cerraba con la animación al recargar.
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 1180);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inChats = pathname.startsWith(ChatsPath);
  const navigationGuard = useNavigationGuardValue();
  // La respuesta a una solicitud de transferencia, en cualquier página (Fase 4).
  useTransferAnswers();

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
    <NavigationGuardContext.Provider value={navigationGuard}>
    <div className="flex h-[var(--app-height,100dvh)] bg-brand-bg">
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
        {/* Solo móvil: acceso al menú (Chats trae el suyo) */}
        {isMobile && !inChats && (
          <header className="h-[calc(56px+var(--safe-top))] pt-[var(--safe-top)] bg-brand-surface border-b border-brand-border
            flex items-center gap-3 px-4 shrink-0">
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

        {/* Fuera de Chats, lo último de la página no queda bajo la barra de inicio. */}
        <main className={`flex-1 overflow-y-auto bg-brand-surface min-h-0 ${inChats ? '' : 'pb-[var(--safe-bottom)]'}`}>
          <MobileMenuContext.Provider value={isMobile ? () => setIsCollapsed(false) : null}>
            {children}
          </MobileMenuContext.Provider>
        </main>
      </div>
    </div>
    </NavigationGuardContext.Provider>
  );
};
