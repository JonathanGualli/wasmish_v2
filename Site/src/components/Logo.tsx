// Copia del símbolo de Frontend/src/components/Logo/Logo.tsx (la página no
// importa nada de la app). Dos chevrons desfasados en un cuadrado de esquinas
// suaves. `mint` es la inversa, para ir sobre verde profundo; `deep`, sobre claro.
export function Logo({ className = 'w-7 h-7', variant = 'deep' }: { className?: string; variant?: 'deep' | 'mint' }) {
  const plate = variant === 'deep' ? '#0B3B2E' : '#6FE3AE'
  const top = '#FFFFFF'
  const bottom = variant === 'deep' ? '#6FE3AE' : '#06251C'
  return (
    <svg viewBox="0 0 1024 1024" role="img" aria-label="Wasmish" className={`${className} flex-none select-none`}>
      <rect width="1024" height="1024" rx="240" fill={plate} />
      <path d="M 236 300 L 404 590 L 572 300" fill="none" stroke={top} strokeWidth={104} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 452 724 L 620 434 L 788 724" fill="none" stroke={bottom} strokeWidth={104} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`font-extrabold tracking-[-0.045em] ${className}`}>wasmish</span>
}
