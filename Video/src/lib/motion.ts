import { Easing, interpolate } from 'remotion'

// El movimiento del storyboard: una sola curva para la cámara y las entradas.

export const EASE = Easing.bezier(0.45, 0, 0.2, 1)

// La cámara se acerca como mucho ×1,5, y llega a cada llave en 1 s.
export const MAX_ZOOM = 1.5
export const CAMERA_FRAMES = 30

// 0 antes de `start`, 1 desde `start + duration`, con la curva en medio.
export function progress(frame: number, start: number, duration: number): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

// Un valor que va de llave en llave: cada una se alcanza en `duration` cuadros
// con EASE, desde donde estaba el valor al llegarle (aunque la anterior no
// hubiera terminado). Antes de la primera llave, la primera. Las llaves se
// ordenan por `at`; sin ninguna no hay valor que dar.
export type ValueKey = { at: number; value: number }

export function valueAt(frame: number, keys: ValueKey[], duration = CAMERA_FRAMES): number {
  if (keys.length === 0) throw new Error('valueAt necesita al menos una llave.')
  return reach(frame, [...keys].sort((a, b) => a.at - b.at), duration)
}

function reach(frame: number, keys: ValueKey[], duration: number): number {
  let value = keys[0].value
  for (let i = 1; i < keys.length && frame >= keys[i].at; i++) {
    const from = reach(keys[i].at, keys.slice(0, i), duration)
    value = from + (keys[i].value - from) * progress(frame, keys[i].at, duration)
  }
  return value
}

// La cámara de un chat: `scale` y el punto de origen del acercamiento (`x`,
// `y`, en píxeles del chat), como `transform-origin` en el storyboard.
export type CameraKey = { at: number; scale: number; x: number; y: number }

export function cameraAt(frame: number, keys: CameraKey[]): { scale: number; x: number; y: number } {
  const channel = (pick: (key: CameraKey) => number) => valueAt(frame, keys.map((key) => ({ at: key.at, value: pick(key) })))
  return { scale: Math.min(channel((key) => key.scale), MAX_ZOOM), x: channel((key) => key.x), y: channel((key) => key.y) }
}
