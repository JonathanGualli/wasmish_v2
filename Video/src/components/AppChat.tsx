import type { CSSProperties, ReactNode } from 'react'
import { interpolateColors } from 'remotion'
import type { ExampleContact } from '../../../Site/src/content/types.ts'
import { splitHighlight } from '../lib/subtitles.ts'
import type { VideoChatItem } from '../story/types.ts'
import { CLEAR_MINT, MINT, TONES, type Tone } from './tones.ts'

// El chat de la app a tamaño de video (storyboard de Claude Design, «VideoCuadro»):
// medidas propias, no las de la página escaladas, porque aquí cada mensaje
// cambia de estado (de silueta a texto, el nombre o el PDF resaltados). Es
// solo presentación: cada escena calcula los estados del cuadro y los pasa.

// Un mensaje y su estado en este cuadro, todo de 0 a 1 (por defecto, 1 o 0).
export type ChatRow = {
  item: VideoChatItem
  appear?: number // entra subiendo 28 px
  fill?: number // de silueta gris a mensaje
  markWho?: number // el nombre de quien respondió, sobre menta
  ring?: number // el PDF, rodeado de menta
}

export type ChatNote = { text: string; highlight: string; author: string; date: string; shown: number; mark: number }

const mono: CSSProperties = { fontFamily: 'var(--font-mono)' }
const mix = (t: number, from: string, to: string) => interpolateColors(t, [0, 1], [from, to])
const initials = (name: string) => name.slice(0, 2).toUpperCase()

export function AppChat({ tone, contact, assignee, rows, scroll = 0, camera, note, composer, caret = false }: {
  tone: Tone
  contact: ExampleContact
  // «Asignar», que pasa a «Asignada a …» con `progress`; sin `assignee`, no hay botón.
  assignee?: { name: string; progress: number }
  rows: ChatRow[]
  scroll?: number
  camera?: { scale: number; x: number; y: number }
  note?: ChatNote
  composer?: string
  caret?: boolean
}) {
  const cam = camera ?? { scale: 1, x: 480, y: 437 }
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: -14, borderRadius: 40, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 14, transformOrigin: `${cam.x}px ${cam.y}px`, transform: `scale(${cam.scale})` }}>
        <div style={{ position: 'absolute', inset: 0, background: '#ffffff', borderRadius: 40, boxShadow: TONES[tone].cardShadow, overflow: 'hidden' }}>
          <Header contact={contact} assignee={assignee} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 124, bottom: 124, background: '#f4f6f8', overflow: 'hidden' }}>
            <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 18, transform: `translateY(${-scroll}px)` }}>
              {rows.map((row) => <Row key={row.item.id} row={row} />)}
            </div>
          </div>
          <Composer text={composer} caret={caret} />
          {note && <NoteSheet note={note} contact={contact} />}
        </div>
      </div>
    </div>
  )
}

function Header({ contact, assignee }: { contact: ExampleContact; assignee?: { name: string; progress: number } }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 124, boxSizing: 'border-box', borderBottom: '2px solid #e4e7eb', display: 'flex', alignItems: 'center', gap: 20, padding: '0 30px' }}>
      <span style={{ flex: 'none', width: 72, height: 72, borderRadius: 18, background: '#d6f8e7', color: '#12523f', fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{contact.initials}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.015em', whiteSpace: 'nowrap' }}>{contact.name}</div>
        <div style={{ ...mono, fontSize: 23, color: '#6b7684' }}>{contact.phone}</div>
      </div>
      <span style={{ flex: 1 }} />
      {assignee && <AssignPill name={assignee.name} progress={assignee.progress} />}
    </div>
  )
}

// «Asignar» se vuelve la pastilla oscura «Asignada a Gabriela» (storyboard 3a).
function AssignPill({ name, progress }: { name: string; progress: number }) {
  const on = progress >= 0.5
  return (
    <span style={{
      flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 12, height: 64, boxSizing: 'border-box',
      padding: `0 24px 0 ${on ? 9 : 24}px`, borderRadius: 32, whiteSpace: 'nowrap', fontSize: 26, fontWeight: 700,
      background: mix(progress, '#ffffff', '#0b3b2e'), color: mix(progress, '#2e3540', '#ffffff'), border: `2px solid ${mix(progress, '#c3c9d1', '#0b3b2e')}`,
    }}>
      {on && <span style={{ width: 46, height: 46, borderRadius: 23, background: MINT, color: '#06251c', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(name)}</span>}
      {on ? `Asignada a ${name}` : 'Asignar'}
    </span>
  )
}

function Row({ row }: { row: ChatRow }) {
  const { item, appear = 1, fill = 1, markWho = 0, ring = 0 } = row
  let body: ReactNode
  if (item.kind === 'chip') {
    body = <span style={{ alignSelf: 'center', fontSize: 22, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4b5361', background: '#e4e7eb', borderRadius: 30, padding: '8px 22px' }}>{item.text}</span>
  } else if (item.kind === 'event') {
    body = (
      <span style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 25, fontWeight: 600, color: '#2e3540', background: '#ffffff', border: '2px solid #d5dae0', borderRadius: 30, padding: '10px 24px' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#12523f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m16 11 2 2 4-4" /></svg>
        {item.text}
      </span>
    )
  } else if (item.kind === 'in') {
    body = (
      <div style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
        <div style={{ ...bubble, background: mix(fill, '#e4e7eb', '#ffffff'), color: mix(fill, 'rgba(14, 17, 22, 0)', '#0e1116'), border: '2px solid #e4e7eb', borderRadius: '28px 28px 28px 8px' }}>{item.text}</div>
        <div style={{ ...mono, fontSize: 23, color: '#6b7684', marginTop: 6, opacity: fill }}>{item.time}</div>
      </div>
    )
  } else if (item.kind === 'pdf') {
    body = (
      <div style={{ alignSelf: 'flex-end', width: 600, maxWidth: '84%' }}>
        <div style={{ background: mix(fill, '#d5dae0', '#0b3b2e'), borderRadius: '28px 28px 8px 28px', padding: 10, boxShadow: `0 0 0 ${8 * ring}px ${MINT}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: mix(fill, '#c9d0d8', '#12523f'), borderRadius: 20, padding: 18 }}>
            <span style={{ flex: 'none', width: 76, height: 76, borderRadius: 14, background: mix(fill, '#e4e7eb', '#ffffff'), color: mix(fill, 'rgba(192, 57, 43, 0)', '#c0392b'), fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>PDF</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 28, lineHeight: 1.25, fontWeight: 600, color: mix(fill, 'rgba(255, 255, 255, 0)', '#ffffff'), wordBreak: 'break-all' }}>{item.file}</div>
              <div style={{ ...mono, fontSize: 22, color: mix(fill, 'rgba(207, 227, 218, 0)', '#cfe3da'), marginTop: 4 }}>{item.size}</div>
            </div>
          </div>
        </div>
        <OutMeta time={item.time} who={item.who} fill={fill} markWho={markWho} />
      </div>
    )
  } else {
    // 'out' y 'out-app': la burbuja propia; lo de la app sale sin nombre, con su marca.
    body = (
      <div style={{ alignSelf: 'flex-end', maxWidth: '84%' }}>
        <div style={{ ...bubble, background: mix(fill, '#d5dae0', '#0b3b2e'), color: mix(fill, 'rgba(255, 255, 255, 0)', '#ffffff'), borderRadius: '28px 28px 8px 28px' }}>{item.text}</div>
        <OutMeta time={item.time} who={item.kind === 'out' ? item.who : undefined} fromApp={item.kind === 'out-app'} fill={fill} markWho={markWho} />
      </div>
    )
  }
  return <div style={{ display: 'flex', flexDirection: 'column', opacity: appear, transform: `translateY(${(1 - appear) * 28}px)` }}>{body}</div>
}

const bubble: CSSProperties = { padding: '18px 24px', fontSize: 38, lineHeight: 1.34, letterSpacing: '-0.01em', whiteSpace: 'pre-line', textWrap: 'pretty' }

function OutMeta({ time, who, fromApp = false, fill, markWho }: { time: string; who?: string; fromApp?: boolean; fill: number; markWho: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 25, color: '#6b7684', opacity: fill }}>
      <span style={{ ...mono, fontSize: 23 }}>{time}</span>
      {who === 'Bot' && <span style={{ fontWeight: 700, color: '#12523f', background: '#d6f8e7', borderRadius: 10, padding: '2px 12px' }}>Bot</span>}
      {who && who !== 'Bot' && <span style={{ fontWeight: 700, color: '#0e1116', background: mix(markWho, CLEAR_MINT, MINT), borderRadius: 10, padding: '2px 10px' }}>{who}</span>}
      {fromApp && <span style={{ fontWeight: 700, color: '#2e3540', background: '#e4e7eb', borderRadius: 8, padding: '2px 10px' }}>Desde la app de WhatsApp</span>}
      <span style={{ color: '#1c8560', fontWeight: 600 }}>Leído</span>
    </div>
  )
}

// El campo de abajo: vacío, o con lo que alguien escribe y su cursor.
function Composer({ text, caret }: { text?: string; caret: boolean }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 124, boxSizing: 'border-box', borderTop: '2px solid #e4e7eb', background: '#ffffff', padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0, height: 80, boxSizing: 'border-box', background: '#f4f6f8', border: '2px solid #e4e7eb', borderRadius: 20, padding: '0 24px', display: 'flex', alignItems: 'center', fontSize: 32, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {text
          ? <><span>{text}</span><span style={{ display: 'inline-block', width: 3, height: 38, background: '#0e1116', marginLeft: 2, opacity: caret ? 1 : 0 }} /></>
          : <span style={{ color: '#97a1ad' }}>Escriba un mensaje…</span>}
      </div>
      <span style={{ flex: 'none', width: 80, height: 80, borderRadius: 20, background: MINT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#06251c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z" /></svg>
      </span>
    </div>
  )
}

// La ficha del contacto con la nota, que sube desde abajo (storyboard 2c).
function NoteSheet({ note, contact }: { note: ChatNote; contact: ExampleContact }) {
  const [before, highlight, after] = splitHighlight(note.text, note.highlight)
  const firstName = contact.name.split(' ')[0]
  return (
    <div style={{
      position: 'absolute', left: 20, right: 20, bottom: 20, boxSizing: 'border-box', background: '#ffffff', border: '2px solid #e4e7eb', borderRadius: 34,
      boxShadow: '0 -18px 50px rgba(14, 17, 22, 0.16)', padding: '30px 32px 32px', display: 'grid', gap: 20,
      opacity: Math.min(1, note.shown * 1.6), transform: `translateY(${(1 - note.shown) * 115}%)`,
    }}>
      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b7684' }}>Ficha de {firstName} · Notas</span>
      <div style={{ fontSize: 37, lineHeight: 1.42, color: '#2e3540', textWrap: 'pretty' }}>
        {before}
        <span style={{ background: mix(note.mark, CLEAR_MINT, MINT), color: '#0e1116', borderRadius: 10, padding: '0 6px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{highlight}</span>
        {after}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 27, color: '#4b5361' }}>
        <span style={{ width: 52, height: 52, borderRadius: 14, background: '#e4e7eb', color: '#2e3540', fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(note.author)}</span>
        <span style={{ fontWeight: 700, color: '#0e1116' }}>{note.author}</span>
        <span>·</span>
        <span style={{ ...mono, fontSize: 24 }}>{note.date}</span>
      </div>
    </div>
  )
}
