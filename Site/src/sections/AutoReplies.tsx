import { useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { BotScene, ProbeExample } from '../content/types.ts'
import { AUTO_REPLY_FORMS } from '../content/home.ts'
import { Highlight } from '../components/Highlight.tsx'
import { RichText, sectionWrap } from '../components/RichText.tsx'
import { ChatHeader, ChatItemView, Composer, StepsBar } from '../components/app/Chat.tsx'
import { useStory } from '../components/app/useStory.ts'

// El chat de una noche (componente «ChatAnimado», escena «bot», del diseño):
// alguien escribe con el negocio cerrado, el bot responde lo que el negocio
// preparó, y a la mañana Ana sigue a mano.
function BotDemo({ scene }: { scene: BotScene }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const { mode, index } = useStory(rootRef, scene.phases)
  const still = mode === 'still'
  const first = new Set(scene.phases[0].show)
  const shown = new Set(scene.phases.slice(0, index + 1).flatMap((p) => p.show ?? []))
  const current = scene.phases[index]
  const composing = current.compose ? scene.items.find((i) => i.id === current.compose) : undefined

  return (
    <div ref={rootRef} className="grid w-full gap-3.5" data-story={mode}>
      <div className="story-chat flex flex-col overflow-hidden rounded-2xl border border-brand-border bg-white shadow-[0_1px_2px_rgba(14,17,22,0.05),0_30px_60px_-30px_rgba(11,59,46,0.35)]">
        <ChatHeader contact={scene.contact} />
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-[9px] overflow-hidden bg-brand-bg p-3.5">
          {scene.items.filter((i) => shown.has(i.id)).map((item) => (
            <ChatItemView key={item.id} item={item} later={still && !first.has(item.id)} />
          ))}
        </div>
        <Composer text={composing && 'text' in composing ? composing.text : null} />
      </div>
      <StepsBar labels={scene.labels} index={still ? 0 : current.step} />
    </div>
  )
}

const keyword = 'rounded px-1.5 py-px font-mono text-[13px] text-brand-text bg-brand-raised'

// «Lo que siempre preguntan ya tiene respuesta»: las cuatro formas y «Probar»,
// con respuestas de ejemplo de un negocio.
export function AutoReplies({ scene, examples, selected }: { scene: BotScene; examples: ProbeExample[]; selected: number }) {
  const [pick, setPick] = useState(selected)
  const example = examples[pick]

  return (
    <section className={`flex flex-wrap items-start gap-[clamp(36px,5vw,80px)] py-[clamp(64px,9vw,120px)] ${sectionWrap}`}>
      <div className="min-w-0 max-w-[460px] flex-[1_1_360px]">
        <BotDemo scene={scene} />
      </div>

      <div className="min-w-0 flex-[1.25_1_440px]">
        <div data-reveal="" className="font-mono text-xs uppercase tracking-[0.1em] text-brand-gray-600">Respuestas automáticas</div>
        <h2 data-reveal="" className="mt-3.5 mb-0 text-[clamp(34px,4.4vw,60px)] leading-[1.02] font-extrabold tracking-[-0.045em] text-balance">
          Lo que siempre preguntan ya tiene <Highlight>respuesta</Highlight>.
        </h2>
        <p data-reveal="" className="mt-4 mb-0 text-[17px] leading-[1.55] text-brand-gray-600 text-pretty">
          Usted escribe sus respuestas una vez y Wasmish las envía de cuatro formas.
        </p>

        <div data-reveal="" className="mt-6 overflow-hidden rounded-3xl border border-brand-border bg-white shadow-[0_5px_0_var(--color-brand-border)]">
          <div className="grid">
            {AUTO_REPLY_FORMS.map((form) => (
              <div key={form.name} className="flex flex-wrap gap-x-4 gap-y-0.5 border-b border-brand-raised px-5 py-3.5">
                <span className="flex-[0_0_150px] text-[15px] font-bold">{form.name}</span>
                <span className="flex-[1_1_220px] text-[14.5px] leading-normal text-brand-gray-600">
                  {form.keywords ? (
                    <>Si el mensaje dice <span className={keyword}>{form.keywords[0]}</span> o <span className={keyword}>{form.keywords[1]}</span>, responde el texto que usted preparó.</>
                  ) : (
                    <RichText parts={form.text} />
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="bg-brand-bg px-5 pt-4 pb-5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="text-[15px] font-bold">Probar</span>
              <span className="text-[13px] text-brand-gray-600">Toque un mensaje de ejemplo</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-2 gap-y-2.5">
              {examples.map((e, i) => {
                const on = i === pick
                return (
                  <button key={e.question} type="button" aria-pressed={on} onClick={() => setPick(i)}
                    className={`min-h-11 cursor-pointer rounded-[22px] border px-4 text-sm font-semibold transition-[transform,box-shadow] duration-75 ${
                      on
                        ? 'translate-y-0.5 border-brand-deep bg-brand-deep text-white shadow-[0_3px_0_var(--color-site-deep-shadow)]'
                        : 'border-brand-border-strong bg-white text-brand-text shadow-[0_3px_0_var(--color-brand-border-strong)]'}`}>
                    {e.question}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex flex-col gap-2" aria-live="polite">
              <div className="max-w-[85%] self-start rounded-[12px_12px_12px_3px] border border-brand-border bg-white px-3 py-2 text-sm leading-[1.45]">{example.question}</div>
              <div key={pick} className="max-w-[88%] self-end motion-safe:animate-[wm-pop_0.35s_ease_both]">
                <div className="rounded-[12px_12px_3px_12px] bg-brand-deep px-3 py-2 text-sm leading-[1.45] text-white">{example.answer}</div>
                <div className="mt-[3px] flex justify-end gap-1.5 text-[11px] text-brand-gray-600">
                  <span>{example.reason}</span><span>·</span><span className="font-bold text-brand-accent-strong">Bot</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div data-reveal="" className="mt-[22px] grid gap-2.5 text-[15px] leading-normal text-brand-strong">
          {[
            <><b>Cuando alguien del equipo responde, el bot se calla</b> en esa conversación durante las horas que usted elija. También si responde desde la app.</>,
            <>En el chat, lo que envía el bot lleva la marca «Bot».</>,
            <>Se prueba antes de encenderlo, y viene apagado.</>,
          ].map((line, i) => (
            <div key={i} className="flex gap-2.5">
              <Check size={18} strokeWidth={2.6} className="mt-0.5 flex-none text-brand-accent-strong" aria-hidden />
              <span>{line}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
