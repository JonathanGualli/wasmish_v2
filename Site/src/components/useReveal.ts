import { useEffect } from 'react'

// Las secciones aparecen al bajar (diseño v3). El HTML del servidor no las
// esconde: aquí, después de hidratar, se esconden solo las que todavía no están
// en pantalla, así que nada parpadea. Sin JavaScript o con las animaciones
// desactivadas, todo se ve desde el principio.
//   data-reveal=""  → sube un poco
//   data-reveal="l" → entra desde la izquierda; "r", desde la derecha
//   data-delay="180" → en milisegundos
export function useReveal() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !('IntersectionObserver' in window)) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          el.style.opacity = '1'
          el.style.transform = 'none'
          observer.unobserve(el)
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    )

    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) return
      const dir = el.dataset.reveal
      const delay = Number(el.dataset.delay ?? 0)
      el.style.opacity = '0'
      el.style.transform = dir === 'l' ? 'translateX(-56px)' : dir === 'r' ? 'translateX(56px)' : 'translateY(24px)'
      el.style.transition = `opacity .7s ${delay}ms cubic-bezier(.2,.7,.2,1), transform .8s ${delay}ms cubic-bezier(.2,.7,.2,1)`
      observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])
}
