---
name: brand-guidelines
description: >
  Wasmish brand guidelines — colors, tokens, components, and design rules for this project.
  ALWAYS consult this skill before: creating any React component, modifying styles or CSS,
  choosing colors, designing pages or layouts, updating existing components, or making any
  visual decision. If the user asks how something should look, what color to use, how a
  component should be styled, or anything touching the UI — use this skill first.
  Do not rely on Tailwind defaults or generic color names; always use brand tokens.
license: Complete terms in LICENSE.txt
---

# Wasmish Brand Guidelines

**Manual de marca v1.0 · dirección 3b «Barra oscura».**
Fuente original: `Frontend/brand/wasmishbrand/Manual de marca Wasmish.dc.html`
(no vive en `dist/` — un `npm run build` borraría esa carpeta).

Wasmish es un CRM B2B para gestionar conversaciones de WhatsApp Business.
Identidad: **verde tinta sobre blanco puro y grises fríos**. La marca vive en la
navegación: se ve todo el día sin invadir la conversación.

## Los tres principios

1. **El verde es estructura** — barras, no fondos. El contenido siempre es blanco.
2. **Frío, nunca crema** — grises con azul. Cero amarillos, cero beige, cero grises cálidos.
3. **La menta se gana** — un solo acento vivo por pantalla: la acción principal.

> Si dudas, quita color. La marca aguanta.

---

## Design Tokens — Tailwind v4 (`@theme`)

Definidos en `Frontend/src/App.css`. Usar **siempre** los tokens; nunca colores
Tailwind genéricos (`gray-800`, `blue-500`, `green-500`…).

```css
/* Superficies — gris frío */
--color-brand-surface: #ffffff   /* Lienzo de contenido, cards, burbuja ajena */
--color-brand-bg:      #f4f6f8   /* Gris frío 50 — fondo de app, hover de fila */
--color-brand-raised:  #eef1f4   /* Gris frío 100 — chips neutros, filas alternas */

/* Bordes */
--color-brand-border:        #e4e7eb   /* Divisores por defecto */
--color-brand-border-strong: #c4cbd4   /* Inputs, botón outline */

/* Texto */
--color-brand-text:   #0e1116   /* Titulares y texto principal */
--color-brand-strong: #2e3540   /* Cuerpo largo, labels de campo */
--color-brand-muted:  #6b7684   /* Secundario, previews, etiquetas */
--color-brand-subtle: #97a1ad   /* Placeholders, timestamps, disabled */

/* Verde profundo — la estructura */
--color-brand-deep:          #0b3b2e   /* Sidebar, burbuja propia, botón sólido */
--color-brand-deep-hover:    #12523f   /* Hover dentro de la barra oscura */
--color-brand-deep-active:   #17503f   /* Ítem activo dentro de la barra oscura */
--color-brand-ink:           #06251c   /* Verde 900 — texto sobre menta, overlays */
--color-brand-on-deep:       #cfe3da   /* Texto en reposo sobre verde profundo */
--color-brand-on-deep-muted:  #7fa596  /* Texto terciario sobre verde profundo */
--color-brand-on-deep-subtle: #5d8474  /* Etiquetas de grupo sobre verde profundo */

/* Menta — el acento vivo */
--color-brand-accent:        #6fe3ae   /* Acción principal, activo, badge no leído */
--color-brand-accent-hover:  #45c892
--color-brand-accent-active: #2aa675
--color-brand-accent-strong: #12523f   /* Verde para TEXTO sobre fondo claro */
--color-brand-accent-soft:   #d6f8e7   /* Verde 100 — tints, avatares, badges */

/* Estados */
--color-brand-success: #1c8560   /* «Leído», aprobada */
--color-brand-warning: #b4540a   /* Nota interna, pendiente */
--color-brand-danger:  #c0392b   /* Error de formulario, cerrar sesión, fallido */
--color-brand-info:    #2563a8   /* Informativo del sistema */

/* Tintes de estado — fondos tenues del manual, NO opacidades inventadas */
--color-brand-warning-soft:  #fdf7f0   /* Fondo de nota interna / pendiente */
--color-brand-danger-soft:   #fdf6f5   /* Fondo de error / rechazada */
--color-brand-danger-border: #f0d5d2
```

**Nunca uses opacidades para tintar** (`bg-brand-accent/10`, `bg-brand-danger/10`).
Existen tokens sólidos para eso: `brand-accent-soft`, `brand-warning-soft`,
`brand-danger-soft`. Las opacidades cambian con el fondo y ensucian la paleta.

**Rampas completas** (para casos que los alias no cubren):
`brand-green-50…900` y `brand-gray-0…900`.

| Verde | | | Gris frío | |
|---|---|---|---|---|
| 50 `#effcf5` | 400 `#45c892` | 800 `#0b3b2e` | 0 `#ffffff` | 400 `#97a1ad` |
| 100 `#d6f8e7` | 500 `#2aa675` | 900 `#06251c` | 50 `#f4f6f8` | 500 `#6b7684` |
| 200 `#a8f0ce` | 600 `#1c8560` | | 100 `#eef1f4` | 600 `#4b5361` |
| 300 `#6fe3ae` | 700 `#12654a` | | 200 `#e4e7eb` | 700 `#2e3540` |
| | | | 300 `#c4cbd4` | 900 `#0e1116` |

### La regla de los dos verdes

Es el error más fácil de cometer. Los dos verdes tienen trabajos distintos:

| | Verde profundo `#0b3b2e` | Menta `#6fe3ae` |
|---|---|---|
| Rol | **Estructura** | **Acento** |
| Dónde | Sidebar, burbuja propia, botón sólido, hero de acceso | CTA principal, ítem activo, badge sin leer |
| Cuántos | Los que haga falta | **Uno sólido por pantalla** |
| Texto encima | Blanco / `brand-on-deep` | `brand-ink` `#06251c` — **nunca blanco** |

Para **texto verde sobre fondo claro** usar siempre `text-brand-accent-strong`
(`#12523f`). La menta sobre blanco no se lee.
Los tints (`bg-brand-accent-soft`, `bg-brand-accent/10`) no cuentan como el
elemento menta de la pantalla: son fondo de badge, no acción.

---

## Tipografía

**Inter** para todo el sistema. **JetBrains Mono** solo para datos: teléfonos,
IDs de pedido, códigos y timestamps — lo que el usuario copia o compara.
Ambas se cargan desde Google Fonts en `Frontend/index.html`.

| Rol | Spec | Tailwind |
|---|---|---|
| Display | 44/1.05 · 800 · −0.035em | `text-[44px] font-extrabold tracking-[-0.035em]` |
| H1 | 30/1.15 · 700 · −0.03em | `text-[30px] font-bold tracking-[-0.03em]` |
| H2 | 22/1.25 · 700 · −0.02em | `text-[22px] font-bold tracking-[-0.02em]` |
| H3 | 17/1.35 · 600 | `text-[17px] font-semibold` |
| Cuerpo | 15/1.6 · 400 | `text-[15px] text-brand-strong` |
| Interfaz | 14/1.45 · 500 | `text-sm font-medium` |
| Etiqueta | 11/1 · 600 · 0.1em mayúsculas | `text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted` |
| Dato | Mono 13/1.4 | `font-mono text-[13px]` |
| Label de campo | 13 · 600 | `text-[13px] font-semibold text-brand-strong` |

El **wordmark** va en Inter 800, minúsculas, `tracking: -0.04em`: `wasmish`.

---

## Identidad — el símbolo

Dos chevrons desfasados dentro de un cuadrado de esquinas suaves: el primero
baja, el segundo sube. Juntos leen como **W** y como **intercambio** (ida y
vuelta, dos voces).

Usar siempre el componente, nunca redibujar el SVG:

```tsx
import { Logo, LogoLockup } from '@/components/Logo/Logo';

<Logo className="w-7 h-7" />                 {/* deep — principal, sobre claro */}
<Logo className="w-8 h-8" variant="mint" />  {/* inversa, SOBRE verde profundo */}
<Logo variant="mono" />                      {/* monocromo tinta */}
<Logo variant="bare" />                      {/* símbolo suelto, sin sello */}
<Logo className="w-6 h-6" small />           {/* <32px: trazo +25% */}

<LogoLockup />              {/* símbolo + wordmark, sobre claro */}
<LogoLockup onDeep />       {/* sobre verde profundo */}
<LogoLockup size="lg" />    {/* sm | md | lg */}
```

**Geometría:** margen libre = 25% del alto del símbolo por lado. Trazo = 8,6%
del lado del cuadrado. Mínimos: símbolo **24px**, lockup **104px** de ancho.

**Usos incorrectos:** verde de terceros (`#25d366`), rotarlo o inclinarlo, bajo
contraste, los dos chevrons en menta.

Archivos: `Frontend/public/brand/logo.svg` (sello verde profundo, 1024px),
`favicon.svg` (trazo +25%), `logo.png` (apple-touch-icon, 512px).

---

## Componentes

### Estructura de página — `components/Page/PageShell.tsx`

**No hay barra de título global**, así que toda página interna empieza igual:

```tsx
<PageShell width="wide">          {/* `wide` (max-w-6xl) para páginas con tabla */}
  <PageHeader
    icon={<LayoutTemplate size={20} />}
    title="Plantillas"
    description="…"
    actions={<CustomButton …/>}   {/* opcional, a la derecha */}
  />
  <SectionTitle description="…">Clientes</SectionTitle>
  …
</PageShell>
```

`PageHeader` da el sello de icono en `accent-soft`, H1 30/700 y bajada 15
`brand-muted`. `SectionTitle` da el H2 22/700. Excepción: Inicio rápido tiene su
propia bienvenida, y Chats ocupa toda la altura sin `PageShell`.

### Callout — `components/Callout/Callout.tsx`

Avisos en el patrón de «nota interna» del manual: borde izquierdo de 3px y fondo
tenue. Tonos `info` (menta sobre `brand-bg`), `warning` y `danger` (sobre sus
tintes). Único componente de aviso: no maquetar cajas de nota a mano.

```tsx
<Callout tone="warning" icon={<AlertTriangle size={16} />} title="Copia tu key ahora">
  No se volverá a mostrar.
</Callout>
```

### Píldoras de estado

Siempre `rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em]`
con el par tinte/texto que corresponda:

| Estado | Clases |
|---|---|
| Positivo (aprobada, activa, conectado) | `bg-brand-accent-soft text-brand-accent-strong` |
| En espera (pendiente) | `bg-brand-warning-soft text-brand-warning` |
| Negativo (rechazada, inactiva) | `bg-brand-danger-soft text-brand-danger` |
| Neutro (sin conectar, cerrada) | `bg-brand-raised text-brand-muted` |

### DataTable — `components/DataTable/DataTable.tsx`

Card con borde, **sin sombra**. Cabecera sobre `brand-bg` con la escala
«Etiqueta» (11/600/0.1em mayúsculas), filas con hover a `brand-bg`, y pie de
paginación sobre `brand-bg` con los contadores en mono.

**Todo dato comparable o copiable va en `font-mono`**: identificadores de
plantilla, IDs de Meta, cifras de las columnas y de las tarjetas de estadística
(con `tabular-nums`). Es la regla de datos del manual aplicada a tablas.

### CustomButton — `components/Button/Button.tsx`

Alto 40px, radio 8px, `font-semibold text-sm`.
`size="lg"` para las pantallas de acceso: 49px, texto 15/16, radio 10 en móvil.

| Variant | Fondo | Texto | Uso |
|---|---|---|---|
| `primary` (default) | `brand-accent` | `brand-ink` | La acción principal — **una por vista** |
| `secondary` | `brand-deep` | blanco | Acción de apoyo con peso |
| `outline` | `brand-surface` + borde | `brand-accent-strong` | Cancelar, descartar |
| `ghost` | transparente | `brand-gray-600` | Terciarias |
| `danger` | `brand-danger` | blanco | Destructivas |

```tsx
<CustomButton>Conectar WhatsApp</CustomButton>
<CustomButton variant="secondary">Sincronizar</CustomButton>
<CustomButton variant="outline">Cancelar</CustomButton>
<CustomButton variant="ghost">Ver historial</CustomButton>
<CustomButton variant="danger" onClick={handleDelete}>Eliminar</CustomButton>
<CustomButton isLoading={isPending}>Enviando…</CustomButton>
<CustomButton disabled>Deshabilitado</CustomButton>
```

Deshabilitado: fondo `brand-raised`, texto `brand-subtle`.
**No usar** el prop `color` — no existe. Siempre `variant`.

### CustomInput — `components/Input/Input.tsx`

Alto 42px, radio 8px. Reposo sobre gris frío con borde `border-strong`; al
enfocar pasa a blanco con borde `brand-success` y anillo de 3px `accent-soft`.
Label en 13/600 sentence-case (no mayúsculas).

```tsx
<CustomInput label="Correo de trabajo" required type="email" ... />
<CustomInput maxLines={4} sendOnEnter onEnter={handleSend} />
```

Error: borde `brand-danger` + mensaje `text-xs text-brand-danger` debajo.

### Sidebar — `components/Sidebar/`

Fuente: `Frontend/brand/wasmishbrand/Sidebar y Chats.dc.html`.
La barra oscura **es** la marca. `bg-brand-deep`, sin borde derecho, padding
`px-[14px] pt-5 pb-4`. Ancho **236px** / **76px** colapsada (por debajo de
1180px colapsa sola). **No hay barra de título global**: la identidad, los
ajustes y la salida viven aquí, y cada página trae su propio encabezado.

Estructura de arriba abajo:
1. `<LogoLockup onDeep />` (sello 34px, wordmark 21px) + botón de colapsar
2. Etiqueta de grupo «Trabajo»: 10/700/0.12em mayúsculas en `brand-on-deep-subtle`
3. Nav (`grid gap-[3px]`) — el ítem de Chats lleva el contador de sin leer
4. `mt-auto`: divisor `bg-brand-deep-active`, luego Ajustes y Cerrar sesión
5. Bloque de identidad: `bg-brand-ink rounded-[9px]`, avatar 30px menta con
   iniciales en `brand-ink`, nombre 13/600 blanco, correo 11 `brand-on-deep-muted`

Estados del ítem (`SidebarItem`):
- Reposo `text-brand-on-deep` peso 500 · Hover: **solo** el fondo a `brand-deep-hover`
- Activo: barra menta de 3px pegada al borde izquierdo
  (`left-0 top-[9px] bottom-[9px] rounded-r-[3px]`) + `bg-brand-deep-active`
  + icono menta + peso 600
- Colapsado: tooltip en `bg-brand-ink` a la derecha con **400ms de espera**;
  el contador se convierte en punto menta sobre el icono

### PrivateLayout — `components/Layout/PrivateLayout.tsx`

**Sin barra de título.** El contenido ocupa toda la altura; cada página pone su
propio encabezado. En móvil sí queda una barra de 56px con el botón de menú y el
lockup, porque ahí el sidebar está fuera de pantalla.

```
bg-brand-deep       ← sidebar
bg-brand-surface    ← área de contenido (siempre blanca)
bg-brand-ink/50     ← overlay móvil
```

### Bandeja — `components/Chat/ConversationList.tsx`

Columna de **360px** fijos, `bg-brand-surface`, borde derecho.
- Cabecera `px-[18px] pt-5 pb-3.5`, borde inferior `brand-raised`: «Bandeja»
  20/700/−0.025em, contador de sin leer 13 `brand-muted` a la derecha, y botón
  «+» de 32px radio 8 en menta (abre `NewConversationDialog`)
- Buscador: 13px sobre `brand-bg`, borde `brand-border`, radio 8, lupa a 11px
- Fila: `px-[18px] py-3.5`, `gap-3`, borde inferior `brand-bg`, avatar **38px**
  radio 10. Abierta: `bg-brand-bg` + borde izquierdo de 3px `brand-deep`, con el
  avatar en `bg-brand-deep`/`text-brand-accent`; en reposo va en `brand-raised`
- Nombre 14/600 · hora `font-mono text-[11px] brand-subtle` (hoy la hora, «Ayer»,
  luego el día de la semana, luego dd/mm — `utils/formatChatTime.ts`)
- Preview 13 `brand-muted` truncado · badge de sin leer 18px radio 9 en menta

### Conversación — `components/Chat/ChatThread.tsx`

- Cabecera: `bg-brand-surface`, borde inferior, avatar 36px radio 9 en
  `accent-soft`/`accent-strong`, nombre 15/600, teléfono en mono 11 `brand-muted`.
  En móvil añade el botón de volver a la bandeja
- Lienzo `bg-brand-bg`, `px-6 py-[22px]`, `gap-3`, `flex-col-reverse`
- Burbujas `max-w-[62%]`, `px-3.5 py-2.5`, 14/1.5:

| | Fondo | Texto | Radio |
|---|---|---|---|
| Ajena | `brand-surface` + borde | `brand-text` | `12px 12px 12px 3px` |
| Propia | `brand-deep` | blanco | `12px 12px 3px 12px` |

- **La hora y el acuse van FUERA de la burbuja**, debajo: mono 11 `brand-subtle`.
  El acuse va **en palabras** («Enviado», «Entregado», «Leído» en `brand-success`
  600, «Fallido» en `brand-danger` con tooltip del error de Meta), no en checks
- Separador de día: píldora `bg-brand-border`, 10/700/0.08em mayúsculas
- Composer: `bg-brand-surface`, borde superior, `px-6 py-3.5`; textarea sobre
  `brand-bg` radio 10 con auto-alto hasta 6 líneas, y botón de envío de 44px
  radio 10 en menta

**Lo que la maqueta muestra y la app no tiene todavía** (falta modelo en el
backend): etiquetas por conversación, asignación de agente («Sin asignar»,
«Asignarme», «Respondiendo como…»), notas internas y los filtros Todos / Míos /
Sin asignar. Están omitidos a propósito — no maquetar botones que no hacen nada.

### Modal — `components/Modal/Modal.css`

Tarjeta clara (el contenido siempre es blanco): `#ffffff`, borde
`#e4e7eb`, borde izquierdo 3px menta, radio 12px, esquina superior derecha,
auto-dismiss a los 5s. El contenido lo inyectan las páginas con tokens de texto
sobre claro — **no oscurecer este modal**, rompería ese contraste.

---

## Páginas públicas (Login / SignUp) — «06 · Acceso»

Fuente: `Frontend/brand/wasmishbrand/Acceso - Login y Registro.dc.html`.
Piezas compartidas en `components/Auth/`: `AuthShell`, `AuthHero`, `AuthAvatars`,
`AuthField`, `AuthPasswordField`. **No usar `CustomInput` en estas pantallas** —
el campo de acceso es más grande y sube a 16px en móvil para evitar el zoom de iOS.

**Card** — 940px, `grid-cols-[380px_1fr]`, radio 16px, borde `brand-border`,
sombra `0 24px 60px rgba(14,17,22,0.06)`, centrada sobre `bg-brand-bg`.

**Hero de marca** (380px fijo, `hidden lg:flex`): `bg-brand-deep`, padding 44/40,
`min-h-[520px]`, `justify-between` en tres bloques:
1. `<LogoLockup onDeep size="lg" />`
2. Titular 30/1.2/700/−0.03em blanco + apoyo (subtítulo 15 en `brand-green-200`,
   o checklist con iconos `Check` menta y texto 14 en `brand-green-100`)
3. Pie 12px en `brand-on-deep-muted`; los enlaces ahí van en `text-brand-accent`

**Formulario** (`1fr`): padding 56/64 (`lg:px-16 lg:py-14`), `justify-center`.
- H1 30/700/−0.03em · subtítulo 15 `brand-muted` a 8px
- `grid gap-[18px]` a 30px del subtítulo
- Label 13/600 `brand-strong`, gap 7px. Acción a la derecha del label con `ml-auto`
- Campo: **fondo blanco**, borde `brand-border-strong`, 15px/radio 8/padding 13-14
  (móvil: 16px/radio 10/padding 15-14). Foco: borde `brand-success` + `ring-[3px]`
  en `brand-accent-soft`
- Contraseña: toggle **de texto** «Mostrar»/«Ocultar» a la derecha (13/600
  `brand-gray-600`), no icono de ojo. En registro añade medidor de 3 barras
- Botón principal `<CustomButton size="lg">` — 15/16px, radio 8/10
- **Sin separador «o»** y sin login social

**Móvil** (`< lg`): el hero desaparece; el lockup va arriba del formulario. En
Entrar, «¿La olvidaste?» baja a su propia fila. En Crear cuenta, cabecera con
botón de vuelta (cuadro 40px con borde) porque no hay hero que enlace a Entrar.

## Reglas de diseño

1. **Light, no dark.** El contenido va sobre blanco o gris frío. Lo único oscuro
   es la barra lateral y el hero de acceso.
2. **Jerarquía de superficies:** `brand-surface` (blanco, contenido) →
   `brand-bg` (gris frío, lienzo/hover) → `brand-raised` (chips). Nunca invertirla.
3. **Un solo elemento menta sólido por vista.** Si hay dos CTA, el segundo es
   `secondary` u `outline`.
4. **Bordes sutiles:** `border-brand-border`; `border-brand-border-strong` solo
   en campos y botones outline. Nunca `border-gray-*`.
5. **Texto en capas:** `brand-text` → `brand-strong` → `brand-muted` → `brand-subtle`.
6. **Datos en mono.** Teléfonos, IDs, códigos y horas: `font-mono` + `tabular-nums`.
7. **Radios:** botones e inputs `rounded-[8px]`, ítems de nav `rounded-[9px]`,
   cards `rounded-xl` (12px), modales y paneles de acceso `rounded-2xl`.
8. **Spacing:** `gap-4`, `p-6` en cards; campos `px-[13px] py-[11px]`.
9. **Transiciones:** `transition-colors` en botones e ítems; `duration-300` en el sidebar.
10. **Iconos:** siempre Lucide React. Sidebar `size={18}`, acciones `size={16}`/`size={20}`.
11. **Foco:** no quitar el `:focus-visible` global (anillo menta de 2px, offset 2px).

---

## Anti-patterns — nunca hacer esto

```tsx
// ❌ El verde de WhatsApp. Es de terceros y está prohibido en la marca.
className="bg-[#25d366]"          // usar bg-brand-accent (menta) o bg-brand-deep

// ❌ Texto blanco sobre menta — no hay contraste
<div className="bg-brand-accent text-white">   // usar text-brand-ink

// ❌ Menta como texto sobre blanco — no se lee
<span className="text-brand-accent">Guardado</span>  // usar text-brand-accent-strong

// ❌ Menta sobre verde profundo como fondo de bloque
<div className="bg-brand-deep"><div className="bg-brand-accent">…

// ❌ Cremas, beiges y grises cálidos
className="bg-[#fdfbf6] border-[#e5e0d8]"      // usar la rampa brand-gray-*

// ❌ Degradados verde-azul o verde-lima
className="bg-gradient-to-br from-brand-accent to-blue-400"

// ❌ Tintar con opacidad en vez del token sólido
className="bg-brand-accent/10"      // usar bg-brand-accent-soft
className="bg-brand-danger/10"      // usar bg-brand-danger-soft

// ❌ Sombras decorativas en cards — el sistema separa con bordes
className="rounded-xl border shadow-sm hover:shadow-md hover:-translate-y-0.5"

// ❌ Escala tipográfica genérica en vez de la del manual
className="text-xl font-semibold"   // usar text-[22px] font-bold tracking-[-0.02em]
className="text-xs uppercase tracking-wide"  // usar text-[11px] font-semibold tracking-[0.1em]

// ❌ Colores Tailwind genéricos
className="bg-gray-800 text-white border-gray-600"

// ❌ Inline styles para colores
style={{ backgroundColor: '#6fe3ae' }}          // usar bg-brand-accent

// ❌ Fondo oscuro en páginas internas — el contenido siempre es blanco
className="bg-brand-deep p-6"                   // usar bg-brand-surface
```
