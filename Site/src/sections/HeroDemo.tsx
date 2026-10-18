import { useEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { HeroScene } from '../content/types.ts'
import { Caret, ChatHeader, ChatItemView, Composer, StepsBar } from '../components/app/Chat.tsx'

// La conversación del hero (componente «ChatFicha» del diseño v3): Ana atiende
// a una clienta, deja una nota en la ficha, y días después Luis la retoma
// sabiendo todo. Con la ficha al lado (≥ 560 px) o, en el celular, como una
// hoja que entra desde el costado.
//
// Sin parpadeo al cargar (docs/arquitectura/pagina-publica.md § Cómo se
// construye): el servidor dibuja la historia completa (`mode: 'still'`), que es
// lo que ve quien no tiene JavaScript o desactivó las animaciones. Con
// JavaScript, el CSS esconde desde el principio lo que todavía no llegó
// (`data-later`), y al montar arranca la animación en la primera fase.

type Phase = {
  show?: string[]      // mensajes que aparecen
  compose?: string     // mensaje que alguien está escribiendo
  press?: boolean      // se aprieta «Ficha»
  open?: boolean       // la ficha abierta (solo como hoja)
  type?: boolean       // se escribe la nota, letra por letra
  focus?: boolean      // la nota se ilumina: Luis la está leyendo
  sheet?: boolean      // fase que solo existe con la ficha como hoja
  step: number         // el paso que dice la barra
  ms?: number
}

// Las fases y los tiempos, tal cual el diseño.
const PHASES: Phase[] = [
  { show: ['d1', 'm1'], step: 0, ms: 1700 },
  { compose: 'm2', step: 0, ms: 1500 },
  { show: ['m2'], step: 0, ms: 900 },
  { show: ['m3'], step: 0, ms: 1300 },
  { show: ['m4'], step: 0, ms: 1400 },
  { press: true, sheet: true, step: 1, ms: 600 },
  { open: true, sheet: true, step: 1, ms: 700 },
  { open: true, type: true, step: 1 },
  { open: true, step: 1, ms: 1400 },
  { sheet: true, step: 1, ms: 700 },
  { show: ['d2', 'm5'], step: 2, ms: 1600 },
  { press: true, sheet: true, step: 2, ms: 600 },
  { open: true, focus: true, step: 2, ms: 2400 },
  { sheet: true, step: 2, ms: 700 },
  { compose: 'm6', step: 3, ms: 2000 },
  { show: ['m6'], step: 3, ms: 4800 },
]

const TYPE_MS = 40
const phasesFor = (side: boolean) => (side ? PHASES.filter((p) => !p.sheet) : PHASES)
const FIRST_SHOWN = new Set(PHASES[0].show)

export function HeroDemo({ scene }: { scene: HeroScene }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const sideRef = useRef(true)
  const [mode, setMode] = useState<'still' | 'anim'>('still')
  const [side, setSide] = useState(true)
  const [live, setLive] = useState(false)
  const [phase, setPhase] = useState(0)
  const [typed, setTyped] = useState(0)

  // Al montar: si se puede animar, la animación arranca en la primera fase y
  // solo corre mientras se ve. La ficha va al lado si caben 560 px.
  useEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Cambiar de disposición reinicia la historia: las fases no son las mismas.
    const measure = () => {
      const isSide = root.getBoundingClientRect().width >= 560
      if (isSide === sideRef.current) return
      sideRef.current = isSide
      setSide(isSide)
      setPhase(0)
    }
    measure()
    setMode('anim')
    const resize = new ResizeObserver(measure)
    resize.observe(root)
    const visible = new IntersectionObserver(([entry]) => setLive(entry.isIntersecting), { threshold: 0.3 })
    visible.observe(root)
    return () => {
      resize.disconnect()
      visible.disconnect()
    }
  }, [])

  const phases = phasesFor(side)
  const index = mode === 'still' ? phases.length - 1 : Math.min(phase, phases.length - 1)
  const current = phases[index]
  const noteLength = scene.note.text.length

  useEffect(() => {
    if (mode !== 'anim' || !live) return
    let typing: number | undefined
    let ms = current.ms ?? 1500
    if (current.type) {
      ms = noteLength * TYPE_MS + 700
      setTyped(0)
      typing = window.setInterval(() => setTyped((n) => Math.min(n + 1, noteLength)), TYPE_MS)
    }
    const next = window.setTimeout(() => setPhase((p) => (p + 1 >= phases.length ? 0 : p + 1)), ms)
    return () => {
      window.clearTimeout(next)
      window.clearInterval(typing)
    }
  }, [mode, live, index, current, noteLength, phases.length])

  const still = mode === 'still'
  const shown = new Set<string>()
  let noteSaved = still
  phases.forEach((p, i) => {
    if (i <= index) p.show?.forEach((id) => shown.add(id))
    if (i < index && p.type) noteSaved = true
  })
  const draft = !still && current.type ? scene.note.text.slice(0, typed) : ''
  const composing = current.compose ? scene.items.find((i) => i.id === current.compose) : undefined
  const open = !side && !still && !!current.open
  const pressed = side || open || !!current.press
  const labels = side ? scene.labels.side : scene.labels.sheet
  // En el modo quieto, la barra de pasos (que solo se ve con animaciones) dice el primero.
  const step = still ? 0 : current.step

  return (
    <div ref={rootRef} className="hero-demo grid w-full gap-3.5" data-hero={mode}>
      <div className="hero-grid">
        <div className="hero-chat flex min-w-0 flex-col overflow-hidden rounded-2xl border border-brand-border bg-white">
          <ChatHeader contact={scene.contact} pressed={pressed} />
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-[9px] overflow-hidden bg-brand-bg p-3.5">
            {scene.items.filter((i) => shown.has(i.id)).map((item) => (
              <ChatItemView key={item.id} item={item} later={still && !FIRST_SHOWN.has(item.id)} />
            ))}
          </div>
          <Composer text={composing && 'text' in composing ? composing.text : null} />
        </div>

        <div className="hero-ficha z-[2] flex min-w-0 flex-col overflow-hidden rounded-2xl border border-brand-border bg-white"
          data-open={open ? '' : undefined}>
          <div className="hero-back h-[52px] flex-none items-center border-b border-brand-raised px-1.5">
            <span className="flex h-11 items-center gap-1 px-2 text-[15px] font-semibold text-brand-accent-strong">
              <ChevronLeft size={18} aria-hidden />Chat
            </span>
          </div>
          <div className="hero-title h-[61px] flex-none items-center border-b border-brand-border px-3.5 text-[13px] font-bold text-brand-strong">
            Ficha del contacto
          </div>
          <div className="grid min-h-0 flex-1 content-start gap-[18px] overflow-hidden p-4">
            <div className="flex items-center gap-[11px]">
              <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-brand-deep text-sm font-bold text-brand-accent">
                {scene.contact.initials}
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold tracking-[-0.015em]">{scene.contact.name}</div>
                <div className="font-mono text-[11.5px] text-brand-gray-600">{scene.contact.phone}</div>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-brand-muted">Etiquetas</div>
              <div className="flex flex-wrap gap-1.5">
                {scene.tags.map((tag) => (
                  <span key={tag} className="flex h-7 items-center rounded-[5px] border border-site-tag-border px-[9px] text-[13px] font-medium text-brand-strong">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-brand-muted">Notas</div>
              {/* El campo para escribir, como en la app (1.0.26). */}
              <div className={`min-h-10 rounded-[10px] border px-3 py-2 text-sm leading-normal transition-[box-shadow,border-color,background-color] duration-300 ${
                current.type && !still ? 'border-brand-accent-strong bg-white shadow-[0_0_0_3px_rgba(18,82,63,0.14)]' : 'border-brand-border bg-site-field'}`}>
                {draft ? (
                  <><span className="text-brand-strong">{draft}</span>{typed < noteLength && <Caret />}</>
                ) : (
                  <span className="text-brand-subtle">Escriba una nota…</span>
                )}
              </div>
              {/* La nota guardada: quién la escribió y cuándo, como en la app. */}
              {noteSaved && (
                <div data-later={still ? '' : undefined}
                  className={`rounded-[10px] border px-2.5 py-2 transition-[box-shadow,border-color,background-color] duration-300 motion-safe:animate-[wm-in_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both] ${
                    current.focus && !still ? 'border-brand-warning bg-brand-warning-soft shadow-[0_0_0_3px_rgba(180,84,10,0.2)]' : 'border-transparent'}`}>
                  <div className="flex items-center gap-1.5 text-xs text-brand-subtle">
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-brand-raised text-[8.5px] font-bold text-brand-muted">
                      {scene.note.author.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-[13px] font-semibold text-brand-text">{scene.note.author}</span>
                    <span>· {scene.note.date}</span>
                  </div>
                  <p className="mt-1 text-sm leading-normal text-brand-strong">{scene.note.text}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <StepsBar labels={labels} index={step} />
    </div>
  )
}
