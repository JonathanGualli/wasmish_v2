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

Wasmish es un CRM B2B para gestionar conversaciones de WhatsApp Business.
Visual identity: **dark, professional, WhatsApp-green as primary CTA**.

---

## Design Tokens — Tailwind v4 (`@theme`)

Todos los tokens están definidos en `Frontend/src/App.css` vía `@theme {}`.
Usar **siempre** los tokens; nunca usar colores Tailwind genéricos (gray-800, blue-500, etc.).

```css
/* Fondos — de más oscuro a más claro */
--color-brand-bg:      #141413   /* App background, sidebar, header */
--color-brand-surface: #1c1c1b   /* Cards, panels, layout areas */
--color-brand-raised:  #262625   /* Inputs, tooltips, elevated surfaces */

/* Bordes */
--color-brand-border:  #2e2d2b   /* Divisores, bordes de card, inputs */

/* Texto */
--color-brand-text:    #f5f4f0   /* Texto principal */
--color-brand-muted:   #b0aea5   /* Texto secundario, labels, iconos inactivos */
--color-brand-subtle:  #6b6a66   /* Placeholders, disabled, hints */

/* Accents */
--color-brand-accent:  #25d366   /* Primary CTA — WhatsApp green */
--color-brand-indigo:  #6366f1   /* Secondary accent */
--color-brand-danger:  #ef4444   /* Errors, destructive actions */
```

### Uso en Tailwind
```
bg-brand-bg           bg-brand-surface      bg-brand-raised
text-brand-text       text-brand-muted      text-brand-subtle
border-brand-border
bg-brand-accent       text-brand-accent     bg-brand-accent/10
bg-brand-indigo       bg-brand-danger
```
Modificadores de opacidad: `bg-brand-accent/10`, `bg-brand-accent/85`, etc.

---

## Tipografía

- **Font**: `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`
- Configurado en `@theme` como `--font-sans`
- Usar `font-sans` en el body; nunca especificar otras fuentes
- Labels: `text-xs font-medium uppercase tracking-wide text-brand-muted`
- Headings: `font-bold text-brand-text`
- Body/secondary: `text-sm text-brand-muted`

---

## Identidad — Wasmish Mark

El logo de Wasmish es la letra "W" sobre fondo verde accent en un rectángulo redondeado.

```tsx
/* Tamaño estándar (sidebar, login) */
<div className="w-7 h-7 bg-brand-accent rounded-lg flex items-center justify-center flex-shrink-0">
  <span className="text-black font-bold text-sm leading-none">W</span>
</div>

/* Tamaño grande (login hero) */
<div className="w-10 h-10 bg-brand-accent rounded-xl flex items-center justify-center flex-shrink-0">
  <span className="text-black font-bold text-lg leading-none">W</span>
</div>
```

Texto negro sobre verde: es la combinación correcta por contraste (luminancia ~0.57).
Nunca usar texto blanco sobre `brand-accent`.

---

## Componentes

### CustomButton — `components/Button/Button.tsx`

Variantes disponibles vía prop `variant`:

| Variant | Fondo | Texto | Uso |
|---|---|---|---|
| `primary` (default) | `bg-brand-accent` | `text-black` | CTA principal |
| `secondary` | `bg-brand-indigo` | `text-white` | Acción secundaria |
| `ghost` | transparente | `text-brand-muted` | Acciones terciarias |
| `danger` | `bg-brand-danger` | `text-white` | Acciones destructivas |

```tsx
<CustomButton>Guardar</CustomButton>                         {/* primary */}
<CustomButton variant="secondary">Ver más</CustomButton>
<CustomButton variant="ghost">Cancelar</CustomButton>
<CustomButton variant="danger" onClick={handleDelete}>Eliminar</CustomButton>
<CustomButton isLoading={isPending}>Enviando...</CustomButton>
```

**No usar** el prop `color` — fue eliminado. Siempre usar `variant`.

---

### CustomInput — `components/Input/Input.tsx`

```tsx
<CustomInput
  label="Correo electrónico"   {/* uppercase pequeño automático */}
  required                      {/* asterisco rojo */}
  type="email"
  placeholder="email@ejemplo.com"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>

{/* Textarea auto-expandible */}
<CustomInput maxLines={4} sendOnEnter onEnter={handleSend} />
```

Estilos: fondo `brand-raised`, borde `brand-border`, focus ring verde.

---

### Sidebar — `components/Sidebar/Sidebar.tsx`

- Fondo: `bg-brand-bg`
- Borde derecho: `border-brand-border`
- Ancho expandido: `224px` / colapsado: `60px`
- Item seleccionado: `bg-brand-accent/10 text-brand-accent font-medium`
- Item hover: `bg-brand-raised text-brand-text`
- Iconos: Lucide React, `size={18}`

---

### PrivateLayout — `components/Layout/PrivateLayout.tsx`

```
bg-brand-surface          ← app background
bg-brand-bg border-b      ← header (más oscuro que el fondo)
bg-brand-bg border-r      ← sidebar
```

---

### Modal — `components/Modal/Modal.css`

- Fondo: `#262625` (= `brand-raised`)
- Borde: `1px solid #2e2d2b`
- Sombra: `0 10px 30px rgba(0,0,0,0.5)`
- Posición: esquina superior derecha, auto-dismiss en 5s

---

## Reglas de diseño

1. **Dark first**: toda nueva página/componente va sobre fondo oscuro (`brand-surface` o `brand-bg`).
2. **Un solo acento verde**: `brand-accent` es solo para el CTA principal y estados activos/seleccionados. No decorar con él.
3. **Jerarquía de fondos**: `brand-bg` (más oscuro) → `brand-surface` → `brand-raised`. Nunca invertir la jerarquía.
4. **Bordes sutiles**: usar `border-brand-border` para separar secciones; nunca `border-gray-*`.
5. **Texto en capas**: texto importante = `brand-text`, secundario = `brand-muted`, hints/placeholders = `brand-subtle`.
6. **Spacing**: preferir `gap-4`, `p-4`, `p-6` para cards. Inputs con `p-2.5`.
7. **Bordes redondeados**: inputs `rounded-md`, cards `rounded-xl`, modals `rounded-2xl`, logo mark `rounded-lg`/`rounded-xl`.
8. **Transiciones**: `transition-colors` en botones e items interactivos. `duration-300` en el sidebar.
9. **Responsive**: en mobile el sidebar es `fixed` con overlay `bg-black/50`.
10. **Iconos**: siempre Lucide React. En sidebar `size={18}`, en botones/acciones `size={16}` o `size={20}`.

---

## Páginas públicas (Login / SignUp)

Estructura de dos paneles:
- Panel imagen (3/5): imagen con overlay `bg-gradient-to-t from-brand-bg/90 via-brand-bg/30 to-transparent`
- Panel formulario (2/5): `bg-brand-surface border-brand-border`
- Wrapper: `bg-brand-bg`, card con `border border-brand-border rounded-2xl shadow-2xl`
- Links: `text-brand-accent font-medium hover:underline`
- Separador "o": `<hr className="flex-1 border-brand-border" />`

---

## Anti-patterns — nunca hacer esto

```tsx
// ❌ Colores Tailwind genéricos
className="bg-gray-800 text-white border-gray-600"

// ❌ Prop color eliminado
<CustomButton color="green">...</CustomButton>

// ❌ Texto blanco sobre verde
<div className="bg-brand-accent text-white">

// ❌ Fondo claro en páginas internas
className="bg-white"   // usar bg-brand-surface

// ❌ Inline styles para colores
style={{ backgroundColor: '#25d366' }}  // usar bg-brand-accent
```
