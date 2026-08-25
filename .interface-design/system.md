# Wasmish Interface Design System

> Deriva del **Manual de marca v1.0 · dirección 3b** (`Frontend/brand/wasmishbrand/`).
> Para colores y componentes, la fuente de verdad es el skill `/brand-guidelines`.
> Este documento cubre solo lo estructural: profundidad, spacing, radios, patrones.

## Product & Intent
B2B SaaS CRM para WhatsApp Business. Usuarios: operadores de negocio gestionando
mensajes de clientes. Feel: sala de control profesional — funcional, confiable,
con propósito. No decorativo.

## Direction
**Verde tinta sobre blanco puro y grises fríos.**
La marca vive en la navegación: barra lateral verde profundo, contenido siempre
blanco. La menta es el único acento vivo, y se gana: uno por pantalla.

Tres principios:
1. El verde es estructura — barras, no fondos.
2. Frío, nunca crema — grises con azul; cero beige, cero grises cálidos.
3. La menta se gana — un solo acento vivo por pantalla.

## Depth Strategy
**Borders first.** La separación se hace con líneas, no con sombras.
Ninguna card lleva `shadow-*`; el hover cambia borde y fondo, nunca eleva.
- Divisores y cards: `border-brand-border` (1px)
- Campos y botones outline: `border-brand-border-strong`
- Sombra: solo en piezas flotantes (modal, card de acceso), muy baja y fría —
  `0 24px 60px rgba(14,17,22,0.06)`. Nunca sombras dramáticas.
- La barra lateral no lleva borde: la separa su propio color.

## Surfaces (jerarquía, de más claro a más gris)
```
brand-surface #ffffff   ← contenido, cards, burbuja ajena, header
brand-bg      #f4f6f8   ← fondo de app, lienzo de conversación, hover de fila
brand-raised  #eef1f4   ← chips neutros, filas alternas
```
La única superficie oscura es `brand-deep #0b3b2e`: sidebar, burbuja propia,
hero de acceso. Nunca invertir la jerarquía clara.

## Spacing Base Unit
`4px` — Tailwind scale: gap-1 (4px), gap-2 (8px), gap-4 (16px), gap-6 (24px), gap-8 (32px).
Componentes: campos `px-[13px] py-[11px]`, cards `p-6`, paneles de página `p-8`–`p-10`.
Sidebar 236px / 76px colapsado. Bandeja de chats 360px. **No hay barra de título
global**: cada página trae su propio encabezado.

## Typography
- Sistema: `Inter` (400/500/600/700/800). Datos: `JetBrains Mono` (teléfonos, IDs,
  códigos, timestamps). Ambas se cargan en `Frontend/index.html`.
- Display 44/800/−0.035em · H1 30/700 · H2 22/700 · H3 17/600
- Cuerpo 15/1.6 `brand-strong` · Interfaz 14/500 · Dato mono 13
- Etiqueta: `text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted`
- Label de campo: `text-[13px] font-semibold text-brand-strong` (sentence-case)
- Wordmark: Inter 800, minúsculas, `tracking: -0.04em`

## Border Radius Scale
```
rounded-[8px]  → inputs, botones
rounded-[9px]  → ítems de nav, avatares de tarjeta
rounded-xl     → cards, paneles (12px)
rounded-2xl    → modales, card de acceso
rounded-full   → badges, chips pill
```
Burbujas: `12px 12px 12px 3px` (ajena) / `12px 12px 3px 12px` (propia).

## Signature Elements
- **Wasmish Mark**: dos chevrons desfasados en cuadrado de esquinas suaves
  (`<Logo />`, `<LogoLockup />`). Nunca redibujarlo a mano.
- **Barra menta de 3px**: marca lo activo — ítem de sidebar, conversación abierta.
- **Avatares superpuestos**: prueba social del hero de Entrar — cuadros de 26px
  radio 7px en `brand-deep-active` con iniciales menta, solapados −12px.

## Component Patterns

### CustomButton variants
| variant    | bg                | text                  |
|------------|-------------------|-----------------------|
| primary    | bg-brand-accent   | text-brand-ink        |
| secondary  | bg-brand-deep     | text-white            |
| outline    | bg-brand-surface  | text-brand-accent-strong |
| ghost      | transparent       | text-brand-gray-600   |
| danger     | bg-brand-danger   | text-white            |

Alto 40px, radio 8px, `font-semibold text-sm`. Una `primary` por vista.

### CustomInput
`bg-brand-bg border-brand-border-strong` → foco `bg-brand-surface`,
`border-brand-success`, anillo `ring-[3px] ring-brand-accent-soft`.
Labels 13/600 sentence-case.

### PasswordInput (local a páginas de auth)
Campo con toggle Eye/EyeOff de Lucide, `tabIndex={-1}` en el botón toggle.

### Páginas internas
Todas arrancan con `PageShell` + `PageHeader` (`components/Page/PageShell.tsx`).
Avisos con `Callout`; píldoras de estado con los tintes `*-soft`, nunca con
opacidades. Datos comparables o copiables en `font-mono tabular-nums`.

### SidebarItem
Sobre `brand-deep`. Reposo `text-brand-on-deep`; hover **solo** cambia el fondo a
`brand-deep-hover`; activo = barra menta 3px + `bg-brand-deep-active` + icono menta.
Colapsado (< 1180px) muestra tooltip en `brand-ink` con 400ms de espera.

### Pantalla de Chats
Tres columnas: sidebar 236 / bandeja 360 / hilo `1fr`. La bandeja y el hilo traen
su propia cabecera. En móvil se ve una u otra, con botón de volver en el hilo.
Faltan por backend: etiquetas, asignación, notas internas y filtros de bandeja.

## Páginas de Auth (Login / SignUp)
Card de 940px sobre `bg-brand-bg`: `grid-cols-[380px_1fr]`, `rounded-2xl`,
`border-brand-border`, sombra fría muy baja.
- **Hero de marca** (380px, `hidden lg:flex`): `bg-brand-deep`, padding 44/40,
  `min-h-[520px]`, tres bloques con `justify-between` (lockup / mensaje / pie).
- **Formulario** (`1fr`): padding 56/64, `grid gap-[18px]`, H1 30/700.
- Componentes en `components/Auth/` — no reutilizar `CustomInput` aquí: el campo
  de acceso sube a 16px en móvil para evitar el zoom de iOS.
- En móvil el hero desaparece y el lockup pasa arriba del formulario.

## Iconografía
Siempre Lucide React. Tamaños: sidebar=18, botones/acciones=16, chips=11–12.

## Foco
Anillo global `:focus-visible` de 2px `brand-accent-active` con offset 2px
(definido en `App.css`). No sobrescribirlo por componente.

## Anti-patterns registrados
- `#25d366` (verde de WhatsApp) — es de terceros y está prohibido en la marca
- `text-white` sobre `bg-brand-accent` (usar `text-brand-ink`)
- `text-brand-accent` como texto sobre claro (usar `text-brand-accent-strong`)
- Cremas, beiges y grises cálidos; degradados verde-azul o verde-lima
- `bg-gray-*` y colores Tailwind genéricos (usar tokens brand)
- `color` prop en CustomButton (no existe — usar `variant`)
- Fondos oscuros en páginas internas: el contenido siempre es blanco
- Inline styles para colores
