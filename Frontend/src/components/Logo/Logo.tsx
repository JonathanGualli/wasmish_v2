interface Props {
  /** Clases de tamaño (ej. "w-7 h-7"). El SVG ya trae el fondo verde y las esquinas redondeadas. */
  className?: string;
}

/**
 * Marca oficial de Wasmish — la "W" sobre el verde de marca.
 * Fuente única del logo: `public/brand/logo.svg`. Usar este componente
 * en cualquier lugar que necesite el isotipo (sidebar, login, signup…).
 */
export const Logo = ({ className = 'w-7 h-7' }: Props) => (
  <img
    src="/brand/logo.svg"
    alt="Wasmish"
    draggable={false}
    className={`${className} flex-shrink-0 select-none`}
  />
);
