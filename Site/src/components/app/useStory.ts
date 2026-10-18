import { useEffect, useState, type RefObject } from 'react'

// El motor de una historia animada simple (el chat del bot): avanza fase por
// fase, en bucle, y solo mientras se ve. Empieza en `still` (la historia
// completa, lo mismo que dibuja el servidor) y pasa a `anim` al montar, salvo
// que se hayan desactivado las animaciones. Ver sections/HeroDemo.tsx, que hace
// lo mismo con más estados.
export function useStory(rootRef: RefObject<HTMLElement | null>, phases: { ms: number }[]) {
  const [mode, setMode] = useState<'still' | 'anim'>('still')
  const [live, setLive] = useState(false)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setMode('anim')
    const visible = new IntersectionObserver(([entry]) => setLive(entry.isIntersecting), { threshold: 0.3 })
    visible.observe(root)
    return () => visible.disconnect()
  }, [rootRef])

  useEffect(() => {
    if (mode !== 'anim' || !live) return
    const next = window.setTimeout(() => setIndex((i) => (i + 1 >= phases.length ? 0 : i + 1)), phases[index].ms)
    return () => window.clearTimeout(next)
  }, [mode, live, index, phases])

  return { mode, index: mode === 'still' ? phases.length - 1 : index }
}
