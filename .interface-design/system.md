# Wasmish Interface Design System

## Product & Intent
B2B SaaS CRM para WhatsApp Business. Usuarios: operadores de negocio gestionando mensajes de clientes.
Feel: sala de control profesional — funcional, confiable, con propósito. No decorativo.

## Direction
**Dark, terminal-like, WhatsApp-green as the only accent.**
Inspirado en: terminales de trading, WhatsApp dark mode, herramientas de operaciones.

## Depth Strategy
**Borders only** — sin drop shadows dramáticos. Craft silencioso.
- Separación de secciones: `border-brand-border` (1px, sutil)
- Elevación en dark mode: mayor elevación = fondo levemente más claro
- Nunca mezclar borders + shadows decorativos

## Surfaces (jerarquía, de más oscuro a más claro)
```
brand-bg      #141413   ← sidebar, header, app bg
brand-surface #1c1c1b   ← panels, cards, layout
brand-raised  #262625   ← inputs, tooltips, elevated
```
Nunca invertir la jerarquía.

## Spacing Base Unit
`4px` — Tailwind scale: gap-1 (4px), gap-2 (8px), gap-4 (16px), gap-6 (24px), gap-8 (32px).
Componentes: `p-2.5` (inputs), `p-4` o `p-6` (cards), `p-8`–`p-10` (page panels).

## Typography
- Font: `Inter, ui-sans-serif, system-ui`
- Heading: `font-bold text-brand-text`
- Label: `text-xs font-medium uppercase tracking-wide text-brand-muted`
- Body: `text-sm text-brand-muted`
- Hint/placeholder: `text-brand-subtle`

## Border Radius Scale
```
rounded-md   → inputs, botones
rounded-lg   → logo mark pequeño, chips
rounded-xl   → logo mark grande, cards pequeñas
rounded-2xl  → modales, cards de página (login card)
rounded-full → badges, avatares, chips pill
```

## Signature Elements
- **Wasmish Mark**: rectángulo `bg-brand-accent` con "W" negro — `rounded-lg` (sm) / `rounded-xl` (lg)
- **ConversationPreview**: tarjeta frosted glass con conversación pendiente — usada en hero de login
- **Feature chips**: `bg-brand-raised/50 border-brand-border/40 rounded-full backdrop-blur-sm`

## Component Patterns

### CustomButton variants
| variant    | bg               | text         |
|------------|------------------|--------------|
| primary    | bg-brand-accent  | text-black   |
| secondary  | bg-brand-indigo  | text-white   |
| ghost      | transparent      | text-brand-muted |
| danger     | bg-brand-danger  | text-white   |

### CustomInput
`bg-brand-raised border-brand-border` + `focus:border-brand-accent focus:ring-brand-accent/30`
Labels: uppercase xs font-medium tracking-wide

### PasswordInput (local a páginas de auth)
Campo con toggle Eye/EyeOff de Lucide, `tabIndex={-1}` en el botón toggle.

### SidebarItem selected state
`bg-brand-accent/10 text-brand-accent font-medium` — nunca fondo sólido

## Páginas de Auth (Login / SignUp)
Layout: dos paneles en card `max-w-4xl min-h-[540px] rounded-2xl border-brand-border`
- **Panel imagen** (basis-3/5): imagen full bleed + `bg-brand-bg/50` + `gradient-to-t from-brand-bg/95`
  - Logo flotante top-left (absolute)
  - Contenido (headline + chips + signature) anclado con `mt-auto`
- **Panel formulario** (basis-2/5): `bg-brand-surface border-l border-brand-border px-10 py-10`
- Card wrapper: `ring-1 ring-white/[0.04]` para profundidad sutil

## Iconografía
Siempre Lucide React. Tamaños: sidebar=18, botones/acciones=16, hero chips=11–12.

## Anti-patterns registrados
- `bg-gray-*`, `text-white` (usar tokens brand)
- Texto blanco sobre `bg-brand-accent` (usar `text-black`)
- `color` prop en CustomButton (eliminado — usar `variant`)
- `bg-white` en páginas internas
- Inline styles para colores
