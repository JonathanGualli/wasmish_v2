import { APP_LOGIN_URL } from '../site.ts'
import { Logo, Wordmark } from './Logo.tsx'

// La barra oscura de arriba, fija al bajar. En el inicio, «Precio» baja a su
// sección; desde las otras páginas, vuelve al inicio y baja.
export function Header({ onHome }: { onHome: boolean }) {
  return (
    <header className="sticky top-0 z-20 bg-brand-deep">
      <div className="mx-auto box-content flex h-16 max-w-[1320px] items-center gap-4 px-[clamp(20px,5vw,64px)]">
        <a href="/" className="flex items-center gap-2.5 no-underline">
          <Logo variant="mint" className="h-[30px] w-[30px]" />
          <Wordmark className="text-[21px] text-white" />
        </a>
        <a href={onHome ? '#precio' : '/#precio'}
          className="ml-auto px-1.5 py-3 text-sm font-semibold text-brand-on-deep no-underline hover:text-white">
          Precio
        </a>
        <a href={APP_LOGIN_URL}
          className="press-on-deep flex min-h-11 items-center rounded-xl px-3.5 text-sm font-semibold no-underline">
          Iniciar sesión
        </a>
      </div>
    </header>
  )
}
