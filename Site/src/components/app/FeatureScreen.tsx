import { CheckCircle2 } from 'lucide-react'
import type { FeatureScreen as Screen } from '../../content/types.ts'
import { Logo } from '../Logo.tsx'

// Las pantallas de «Lo que ve su equipo» (componente «PantallaFuncion» del
// diseño). `on`: la función está en foco, y su detalle se anima (el nombre se
// resalta, la etiqueta nueva aparece, las barras crecen, llegan los avisos).
// Sin JavaScript o sin animaciones, siempre `on`: se ve el estado final.

const card = 'h-full overflow-hidden rounded-3xl bg-white text-brand-text shadow-[0_6px_0_var(--color-site-deep-shadow)]'
const label = 'text-[10.5px] font-bold uppercase tracking-[0.08em] text-brand-muted'
const ease = 'cubic-bezier(.2,.7,.2,1)'

export function FeatureScreen({ screen, on }: { screen: Screen; on: boolean }) {
  if (screen.kind === 'chat') {
    return (
      <div className={`flex flex-col ${card}`}>
        <div className="flex flex-none items-center gap-[11px] border-b border-brand-border px-4 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-brand-accent-soft text-xs font-bold text-brand-accent-strong">{screen.contact.initials}</div>
          <div>
            <div className="text-[14.5px] font-semibold">{screen.contact.name}</div>
            <div className="font-mono text-[11px] text-brand-muted">{screen.contact.phone}</div>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 overflow-hidden bg-brand-bg p-4">
          {screen.messages.map((m, i) =>
            m.from === 'in' ? (
              <div key={i} className="max-w-[80%] self-start">
                <div className="rounded-[12px_12px_12px_3px] border border-brand-border bg-white px-3 py-2 text-[13.5px] leading-[1.45]">{m.text}</div>
                <div className="mt-[3px] font-mono text-[10.5px] text-brand-muted">{m.time}</div>
              </div>
            ) : (
              <div key={i} className="max-w-[84%] self-end">
                <div className="rounded-[12px_12px_3px_12px] bg-brand-deep px-3 py-2 text-[13.5px] leading-[1.45] text-white">{m.text}</div>
                <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-brand-muted">
                  <span className="font-mono text-[10.5px]">{m.time}</span>
                  {m.fromApp ? (
                    <span className="rounded-[5px] border px-1.5 font-semibold text-brand-gray-600 transition-[border-color] duration-500"
                      style={{ borderColor: on ? 'var(--color-brand-subtle)' : 'transparent', transitionDelay: '0.6s' }}>
                      Desde la app de WhatsApp
                    </span>
                  ) : (
                    <span className="rounded-[5px] px-1.5 py-px font-bold text-brand-accent-strong transition-[background-color] duration-500"
                      style={{ backgroundColor: on ? 'var(--color-brand-accent-soft)' : 'transparent', transitionDelay: i > 2 ? '1s' : '0.2s' }}>
                      {m.by}
                    </span>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    )
  }

  if (screen.kind === 'ficha') {
    return (
      <div className={`flex flex-col ${card}`}>
        <div className="flex h-14 flex-none items-center border-b border-brand-border px-[18px] text-[13px] font-bold text-brand-strong">Ficha del contacto</div>
        <div className="grid flex-1 content-start gap-[22px] px-[18px] py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-deep text-[15px] font-bold text-brand-accent">{screen.contact.initials}</div>
            <div>
              <div className="text-[17px] font-bold tracking-[-0.015em]">{screen.contact.name}</div>
              <div className="font-mono text-[11.5px] text-brand-gray-600">{screen.contact.phone}</div>
            </div>
          </div>
          <div className="grid gap-[9px]">
            <div className={label}>Etiquetas</div>
            <div className="flex flex-wrap gap-1.5">
              {screen.tags.map((tag) => (
                <span key={tag} className="flex h-[30px] items-center rounded-[5px] border border-site-tag-border px-2.5 text-[13px] font-medium text-brand-strong">{tag}</span>
              ))}
              <span className="flex h-[30px] items-center rounded-[5px] border border-brand-accent-strong bg-site-pressed px-2.5 text-[13px] font-medium text-brand-accent-strong transition-[opacity,transform] duration-[400ms]"
                style={{ opacity: on ? 1 : 0, transform: on ? 'none' : 'translateY(6px)', transitionDelay: '0.5s' }}>
                {screen.newTag}
              </span>
            </div>
          </div>
          <div className="grid gap-[9px]">
            <div className={label}>Notas</div>
            {/* La nota, como en la app (1.0.26): quién la escribió y cuándo. */}
            <div className="rounded-[10px] border px-3.5 py-3 transition-[box-shadow,border-color] duration-500"
              style={{ borderColor: on ? 'var(--color-brand-accent-strong)' : 'var(--color-brand-border)', boxShadow: on ? '0 0 0 3px rgba(18,82,63,0.14)' : 'none' }}>
              <div className="flex items-center gap-1.5 text-xs text-brand-subtle">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-raised text-[8.5px] font-bold text-brand-muted">
                  {screen.note.author.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-[13px] font-semibold text-brand-text">{screen.note.author}</span>
                <span>· {screen.note.date}</span>
              </div>
              <p className="mt-1 text-[14.5px] leading-normal text-brand-strong">{screen.note.text}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (screen.kind === 'campaign') {
    const bars = [
      { name: 'Enviados', value: screen.sent, color: 'var(--color-site-tag-border)', delay: 0 },
      { name: 'Llegaron', value: screen.delivered, color: 'var(--color-brand-deep-hover)', delay: 0.15 },
      { name: 'Se leyeron', value: screen.read, color: 'var(--color-brand-deep)', delay: 0.3 },
    ]
    return (
      <div className={`flex flex-col gap-[18px] px-5 py-[22px] ${card}`}>
        <div>
          <div className={label}>Aviso a un grupo</div>
          <div className="mt-1.5 text-[19px] font-bold tracking-[-0.02em]">{screen.title}</div>
          <div className="mt-1 font-mono text-[11.5px] text-brand-gray-600">{screen.detail}</div>
        </div>
        <div className="max-w-[88%] self-end rounded-[12px_12px_3px_12px] bg-brand-deep px-3 py-[9px] text-[13.5px] leading-[1.45] text-white">{screen.message}</div>
        <div className="mt-auto grid gap-3.5">
          {bars.map((bar) => (
            <div key={bar.name} className="grid gap-1.5">
              <div className="flex justify-between text-[13.5px]">
                <span className="font-semibold">{bar.name}</span>
                <span className="font-mono">{bar.value}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-[5px] bg-brand-raised">
                <div className="h-full rounded-[5px] transition-[width] duration-[900ms]"
                  style={{ width: on ? `${Math.round((bar.value / screen.sent) * 100)}%` : '0%', background: bar.color, transitionDelay: `${bar.delay}s`, transitionTimingFunction: ease }} />
              </div>
            </div>
          ))}
        </div>
        <div className="text-[12.5px] leading-normal text-brand-gray-600">Solo a contactos que aceptaron recibir avisos.</div>
      </div>
    )
  }

  // El celular con los avisos de Wasmish, y que la app sigue funcionando.
  return (
    <div className="relative flex h-full items-center justify-center text-brand-text">
      <div className="flex h-full w-[min(260px,78%)] flex-col gap-2.5 overflow-hidden rounded-[40px] border-[9px] border-brand-text bg-site-device px-3 pt-11 pb-4">
        {screen.notifications.map((n, i) => (
          <div key={n.name} className="rounded-2xl bg-white px-3 py-[11px] transition-[opacity,transform] duration-[450ms]"
            style={{ opacity: on ? 1 : 0, transform: on ? 'none' : 'translateY(-16px)', transitionDelay: `${0.2 + i * 0.7}s`, transitionTimingFunction: ease }}>
            <div className="flex items-center gap-[7px]">
              <Logo className="h-4 w-4" />
              <span className="text-[11.5px] font-semibold text-brand-gray-600">Wasmish</span>
              <span className="ml-auto text-[11px] text-brand-muted">ahora</span>
            </div>
            <div className="mt-[5px] text-[13px] leading-[1.4]"><b>{n.name}</b><br />{n.text}</div>
          </div>
        ))}
        <div className="mt-auto self-center rounded-[20px] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-brand-gray-600">Instalado desde el navegador</div>
      </div>
      <div className="absolute bottom-[18px] left-1/2 flex w-max max-w-[92%] -translate-x-1/2 items-center gap-[9px] rounded-[14px] border border-brand-border bg-white px-3.5 py-2.5 text-[13px] font-semibold shadow-[0_4px_0_var(--color-site-tag-border)] transition-opacity duration-[400ms]"
        style={{ opacity: on ? 1 : 0, transitionDelay: '1.4s' }}>
        <CheckCircle2 size={16} className="text-brand-accent-strong" aria-hidden />
        Su app de WhatsApp Business sigue funcionando
      </div>
    </div>
  )
}
