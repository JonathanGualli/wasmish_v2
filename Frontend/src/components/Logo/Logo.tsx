type LogoVariant = 'deep' | 'mint' | 'mono' | 'bare';

interface Props {
  /** Clases de tamaño (ej. "w-7 h-7"). El SVG ya trae fondo y esquinas redondeadas. */
  className?: string;
  /**
   * `deep`  — principal, sobre blanco o gris frío (sello verde profundo).
   * `mint`  — inversa, para usar SOBRE verde profundo (sello menta).
   * `mono`  — monocromo tinta, para documentos y sellos de una tinta.
   * `bare`  — símbolo suelto, sin sello.
   */
  variant?: LogoVariant;
  /** Símbolo por debajo de 32px: engorda el trazo un 25% (regla del manual). */
  small?: boolean;
}

/**
 * Marca oficial de Wasmish — dos chevrons desfasados dentro de un cuadrado de
 * esquinas suaves: el primero baja, el segundo sube. Juntos leen como W y como
 * intercambio (ida y vuelta, dos voces).
 *
 * Manual de marca v1.0 · dirección 3b. Tamaño mínimo del símbolo: 24px.
 * Nunca rotarlo, nunca los dos chevrons en menta, nunca sobre verde de terceros.
 */
export const Logo = ({ className = 'w-7 h-7', variant = 'deep', small = false }: Props) => {
  const stroke = small ? 120 : 96;

  const plate =
    variant === 'deep' ? '#0B3B2E'
    : variant === 'mint' ? '#6FE3AE'
    : variant === 'mono' ? '#0E1116'
    : null;

  // El chevron que baja y el que sube; en `bare` van en verde profundo + verde 500.
  const top    = variant === 'bare' ? '#0B3B2E' : '#FFFFFF';
  const bottom =
    variant === 'deep' ? '#6FE3AE'
    : variant === 'mint' ? '#06251C'
    : variant === 'mono' ? '#FFFFFF'
    : '#2AA675';

  return (
    <svg
      viewBox="0 0 1024 1024"
      role="img"
      aria-label="Wasmish"
      className={`${className} flex-shrink-0 select-none`}
    >
      {plate && <rect width="1024" height="1024" rx="240" fill={plate} />}
      <path
        d="M 236 300 L 404 590 L 572 300"
        fill="none" stroke={top} strokeWidth={stroke}
        strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M 452 724 L 620 434 L 788 724"
        fill="none" stroke={bottom} strokeWidth={stroke}
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
};

/**
 * Lockup completo: símbolo + wordmark. El wordmark va en Inter 800, minúsculas,
 * tracking −0.04em. Ancho mínimo del lockup: 104px.
 */
export const LogoLockup = ({
  className = '',
  onDeep = false,
  size = 'md',
}: {
  className?: string;
  /** true cuando va sobre verde profundo (sidebar, panel de acceso). */
  onDeep?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) => {
  // md es el tamaño del sidebar (34/21 en la maqueta); lg el de las pantallas de acceso.
  const mark = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-10 h-10' : 'w-[34px] h-[34px]';
  const text = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-[21px]';

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <Logo className={mark} variant={onDeep ? 'mint' : 'deep'} />
      <span
        className={`${text} font-extrabold truncate ${onDeep ? 'text-white' : 'text-brand-text'}`}
        style={{ letterSpacing: '-0.045em' }}
      >
        wasmish
      </span>
    </div>
  );
};
