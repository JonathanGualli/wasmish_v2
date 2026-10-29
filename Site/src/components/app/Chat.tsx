import type { ReactNode } from 'react'
import { PanelRight, Send } from 'lucide-react'
import type { ChatItem, ExampleContact } from '../../content/types.ts'

// Imitaciones de la conversación de la app (diseño v3), para las animaciones de
// la página. Se dibujan con datos de ejemplo: no son capturas.

const enter = 'motion-safe:animate-[wm-in_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both]'

// `action`: lo que va a la derecha en lugar del botón «Ficha» (el video pone «Asignar»).
export function ChatHeader({ contact, pressed = false, action }: { contact: ExampleContact; pressed?: boolean; action?: ReactNode }) {
  return (
    <div className="flex flex-none items-center gap-[11px] border-b border-brand-border px-3.5 py-3">
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-brand-accent-soft text-xs font-bold text-brand-accent-strong">
        {contact.initials}
      </div>
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold">{contact.name}</div>
        <div className="font-mono text-[11px] text-brand-muted">{contact.phone}</div>
      </div>
      {action ? <div className="ml-auto">{action}</div> : (
        <div className={`ml-auto flex h-8 items-center gap-1.5 rounded-lg border px-[11px] text-[12.5px] font-semibold transition-colors duration-200 ${
          pressed ? 'border-brand-accent-strong bg-site-pressed text-brand-accent-strong' : 'border-brand-border bg-white text-brand-strong'}`}>
          <PanelRight size={14} aria-hidden />Ficha
        </div>
      )}
    </div>
  )
}

// Hora · quién · acuse, debajo de la burbuja propia (como en la app).
function OutMeta({ time, who }: { time: string; who: string }) {
  return (
    <div className="mt-[3px] flex items-baseline justify-end gap-1.5 text-[11px] text-brand-muted">
      <span className="font-mono text-[10.5px]">{time}</span>
      {who === 'Bot' ? (
        <span className="font-bold text-brand-accent-strong">Bot</span>
      ) : (
        <>
          <span className="font-semibold text-brand-strong">{who}</span>
          <span className="font-semibold text-brand-success">Leído</span>
        </>
      )}
    </div>
  )
}

export function ChatItemView({ item, later = false }: { item: ChatItem; later?: boolean }) {
  let body: ReactNode
  if (item.kind === 'chip') {
    body = (
      <div className="my-1 self-center rounded-[20px] bg-brand-border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-gray-600">
        {item.text}
      </div>
    )
  } else if (item.kind === 'in') {
    body = (
      <div className="max-w-[82%] self-start">
        <div className="rounded-[12px_12px_12px_3px] border border-brand-border bg-white px-3 py-2 text-[13.5px] leading-[1.45] text-pretty">{item.text}</div>
        <div className="mt-[3px] font-mono text-[10.5px] text-brand-muted">{item.time}</div>
      </div>
    )
  } else if (item.kind === 'out') {
    body = (
      <div className="max-w-[84%] self-end">
        <div className="rounded-[12px_12px_3px_12px] bg-brand-deep px-3 py-2 text-[13.5px] leading-[1.45] text-white text-pretty">{item.text}</div>
        <OutMeta time={item.time} who={item.who} />
      </div>
    )
  } else {
    body = (
      <div className="w-60 max-w-[84%] self-end">
        <div className="rounded-[12px_12px_3px_12px] bg-brand-deep p-1 text-white">
          <div className="flex items-center gap-2.5 rounded-[9px] bg-brand-deep-hover p-[9px]">
            <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[7px] bg-white text-[10px] font-extrabold text-brand-danger">PDF</div>
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold">{item.file}</div>
              <div className="mt-0.5 font-mono text-[10.5px] text-brand-on-deep">{item.size}</div>
            </div>
          </div>
        </div>
        <OutMeta time={item.time} who={item.who} />
      </div>
    )
  }
  return (
    <div className={`flex flex-col ${enter}`} data-later={later ? '' : undefined}>
      {body}
    </div>
  )
}

// El campo de abajo: vacío, o con lo que alguien está escribiendo y su cursor.
export function Composer({ text }: { text: string | null }) {
  return (
    <div className="flex flex-none items-end gap-2 border-t border-brand-border px-3 py-2.5">
      <div className="min-h-[38px] min-w-0 flex-1 rounded-lg border border-brand-border bg-brand-bg px-[11px] py-[9px] text-[13px] leading-[1.4]">
        {text ? (
          <>
            <span className="text-brand-text">{text}</span>
            <Caret />
          </>
        ) : (
          <span className="text-brand-subtle">Escriba un mensaje…</span>
        )}
      </div>
      <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-lg bg-brand-accent text-brand-ink">
        <Send size={15} strokeWidth={2.2} aria-hidden />
      </div>
    </div>
  )
}

export function Caret() {
  return <span className="ml-px inline-block h-[15px] w-[1.5px] bg-brand-text align-[-2px] motion-safe:animate-[wm-caret_1s_steps(1)_infinite]" />
}

// La barra de pasos debajo de las conversaciones animadas: «01 / 04 · Ana atiende a María».
export function StepsBar({ labels, index, onDeep = false }: { labels: string[]; index: number; onDeep?: boolean }) {
  const on = onDeep ? 'bg-white' : 'bg-brand-deep'
  const off = onDeep ? 'bg-site-deep-line' : 'bg-site-step-off'
  return (
    <div className="grid gap-[9px]" data-motion-only>
      <div className="flex gap-1.5">
        {labels.map((label, i) => (
          <span key={label} className={`h-[3px] flex-1 rounded-sm transition-colors duration-400 ${i <= index ? on : off}`} />
        ))}
      </div>
      <div className={`flex items-baseline gap-2.5 text-sm ${onDeep ? 'text-white' : 'text-brand-text'}`}>
        <span className={`font-mono text-xs ${onDeep ? 'text-brand-green-200' : 'text-brand-muted'}`}>
          {String(index + 1).padStart(2, '0')} / {String(labels.length).padStart(2, '0')}
        </span>
        <span className="font-semibold">{labels[index]}</span>
      </div>
    </div>
  )
}
