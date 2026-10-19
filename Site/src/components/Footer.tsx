import { APP_LOGIN_URL, CONTACT_EMAIL, WHATSAPP_NUMBER } from '../site.ts'
import { Logo, Wordmark } from './Logo.tsx'
import { Pending } from './Pending.tsx'

const label = 'text-xs font-bold uppercase tracking-[0.1em] text-brand-green-200'
const link = 'flex min-h-9 items-center text-white no-underline hover:underline'

// «+593 98 765 4321» a partir de «593987654321».
const formatPhone = (n: string) => `+${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 8)} ${n.slice(8)}`

export function Footer() {
  return (
    <footer className="bg-brand-deep text-brand-on-deep">
      <div className="mx-auto box-content grid max-w-[1320px] gap-9 px-[clamp(20px,5vw,64px)] pt-[clamp(44px,6vw,72px)] pb-8">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-7">
          <div className="flex items-center gap-2.5 self-start">
            <Logo variant="mint" className="h-8 w-8" />
            <Wordmark className="text-[22px] text-white" />
          </div>

          <div className="grid content-start gap-1.5 text-[14.5px]">
            <span className={label}>Contacto</span>
            <span className="font-mono text-white">
              {WHATSAPP_NUMBER ? `WhatsApp ${formatPhone(WHATSAPP_NUMBER)}` : <Pending onDeep>WhatsApp +593 9X XXX XXXX</Pending>}
            </span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-mono text-white no-underline hover:underline">{CONTACT_EMAIL}</a>
            <span>Jonathan Gualli · Ecuador</span>
          </div>

          <div className="grid content-start gap-0.5 text-[14.5px]">
            <span className={`${label} mb-1`}>Wasmish</span>
            <a href={APP_LOGIN_URL} className={link}>Iniciar sesión</a>
            <a href="/privacidad" className={link}>Privacidad</a>
            <a href="/terminos" className={link}>Términos</a>
          </div>
        </div>

        <div className="border-t border-brand-deep-active pt-5 text-[13px] leading-[1.6] text-site-on-deep-legal">
          WhatsApp es una marca de Meta Platforms, Inc. Wasmish es un servicio independiente y no está afiliado a Meta. © 2026 Wasmish.
        </div>
      </div>
    </footer>
  )
}
