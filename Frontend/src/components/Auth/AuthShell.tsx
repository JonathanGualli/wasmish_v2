import type { ReactNode } from 'react';
import { LogoLockup } from '../Logo/Logo';

/**
 * Estructura de las pantallas de acceso — «06 · Acceso» del manual de marca v1.0.
 * Card de 940px sobre gris frío, dividida en hero de marca fijo de 380px + formulario.
 * En móvil el hero desaparece y el lockup pasa arriba del formulario.
 */
export const AuthShell = ({ hero, children }: { hero: ReactNode; children: ReactNode }) => (
  <div className="w-screen min-h-screen bg-brand-bg flex justify-center items-center p-4 py-8">
    <div className="w-full max-w-[420px] lg:max-w-[940px] bg-brand-surface
      border border-brand-border rounded-2xl overflow-hidden
      shadow-[0_24px_60px_rgba(14,17,22,0.06)]
      lg:grid lg:grid-cols-[380px_1fr]">
      {hero}
      <div className="px-6 py-8 lg:px-16 lg:py-14 flex flex-col justify-center">
        {children}
      </div>
    </div>
  </div>
);

/**
 * Panel de marca sobre verde profundo: lockup arriba, mensaje en medio, prueba
 * social o enlace cruzado abajo. Solo se ve en escritorio.
 */
export const AuthHero = ({
  title,
  children,
  footer,
}: {
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) => (
  <div className="bg-brand-deep hidden lg:flex flex-col justify-between px-10 py-11 min-h-[520px]">
    <LogoLockup onDeep size="lg" />

    <div>
      <h2 className="text-white font-bold text-[30px] leading-[1.2] tracking-[-0.03em] text-pretty">
        {title}
      </h2>
      {children}
    </div>

    <div className="text-xs text-brand-on-deep-muted">{footer}</div>
  </div>
);

/** Fila de avatares superpuestos — la prueba social del panel de Entrar. */
export const AuthAvatars = ({ initials, caption }: { initials: string[]; caption: string }) => (
  <div className="flex items-center gap-2">
    {initials.map((ini, i) => (
      <span
        key={ini}
        className="w-[26px] h-[26px] rounded-[7px] bg-brand-deep-active text-brand-accent
          text-[10px] font-bold flex items-center justify-center flex-shrink-0"
        style={i > 0 ? { marginLeft: '-12px' } : undefined}
      >
        {ini}
      </span>
    ))}
    <span className="ml-2">{caption}</span>
  </div>
);
