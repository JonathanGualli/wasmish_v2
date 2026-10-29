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

// `at`, en cuadros; `x` e `y`, el punto del lienzo que queda al centro.
export type CameraKey = { at: number; scale: number; x: number; y: number }
type CameraState = Omit<CameraKey, 'at'>

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clampZoom = ({ scale, x, y }: CameraState): CameraState => ({ scale: Math.min(scale, MAX_ZOOM), x, y })

// Desde donde estaba la cámara al llegar la llave (aunque la anterior no hubiera
// terminado), hasta la llave, en CAMERA_FRAMES.
export function cameraAt(frame: number, keys: CameraKey[]): CameraState {
  let state = clampZoom(keys[0])
  for (let i = 1; i < keys.length && frame >= keys[i].at; i++) {
    const from = cameraAt(keys[i].at, keys.slice(0, i))
    const to = clampZoom(keys[i])
    const t = progress(frame, keys[i].at, CAMERA_FRAMES)
    state = { scale: lerp(from.scale, to.scale, t), x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) }
  }
  return state
}
