# Página pública `wasmish.com` — plan de implementación

> En Wasmish los planes se ejecutan **nativos**: rama, PR y revisión cruzada (ver «Planes» en `AGENTS.md`). Los pasos usan casillas (`- [ ]`).

**Objetivo:** la página pública de Wasmish (inicio, `/capacitacion`, `/imprentas`, Privacidad, Términos y 404), con la vista previa en WhatsApp y el SEO, publicada en Cloudflare Pages.

**Arquitectura:** un espacio de trabajo nuevo, `Site/`, con React 19, Vite y Tailwind v4. Al compilar, un script pre-renderiza cada página a un HTML completo, con su `<head>` escrito, y en el navegador React hidrata solo las páginas que tienen movimiento. Los nichos son datos: un solo molde (`VentaPage`) y un archivo de textos por página. Cloudflare Pages compila `Site/` al unir en `master`, y genera una vista previa por PR.

**Stack:** React 19, Vite 7, Tailwind v4 (`@tailwindcss/vite`), TypeScript 5.8, `marked` (Markdown al compilar), `@fontsource` (Inter y JetBrains Mono), `node:test` con la eliminación de tipos de Node 22, y `playwright-core` con el Chrome del sistema (solo para las imágenes de vista previa y las capturas).

**Spec:** [docs/superpowers/specs/2026-10-17-pagina-publica-design.md](../specs/2026-10-17-pagina-publica-design.md). **Contenido:** [el brief](../specs/2026-10-17-pagina-publica-brief.md) (manda sobre los textos del diseño). **Diseño:** «Wasmish Inicio v3 - Calma con vida» (inicio) y la 3a y la 3b del lienzo «Wasmish Inicio - 3 direcciones» (nichos). Los dos están en la carpeta comercial privada de Jonathan, con capturas por sección en `diseno-v3-capturas/`. **Las notas del contacto** se dibujan como en la app 1.0.26, siguiendo `Design/Wasmish Notas del contacto.html`.

## Restricciones globales

- **Node 22**, igual que el CI y los Dockerfiles. Las versiones de React, Vite, Tailwind, TypeScript y ESLint son las mismas que en `Frontend/package.json`.
- **`Site/` no importa nada de `Frontend/` ni de `Backend/`**: los tokens, el logo y el favicon se copian.
- **Direcciones fijas:** `SITE_URL = 'https://wasmish.com'`, `APP_LOGIN_URL = 'https://app.wasmish.com/login'` y `CONTACT_EMAIL = 'hola@wasmish.com'`.
- **Las rutas y sus archivos:**

  | Ruta | Archivo | Hidrata |
  |---|---|---|
  | `/` | `index.html` | sí |
  | `/capacitacion` | `capacitacion.html` | sí |
  | `/imprentas` | `imprentas.html` | sí |
  | `/privacidad` | `privacidad.html` | no |
  | `/terminos` | `terminos.html` | no |
  | 404 | `404.html` | no |

  La dirección canónica, sin barra final ni `.html`. La 404 lleva `noindex` y no entra en el sitemap.
- **El texto prellenado del botón:** `Hola, quiero ver una demostración de Wasmish (<etiqueta>)`, con las etiquetas `web` (inicio), `capacitación` e `imprentas`.
- **Los precios, de un solo sitio** (`src/content/price.ts`): USD 30 al mes; fundador, USD 20 durante 12 meses, para los 10 primeros; usuario extra, USD 5. Los usan la página y el JSON-LD.
- **Huecos:** todo dato sin confirmar se dibuja con `<Pending>`, que pone `data-pending` en el HTML y muestra la etiqueta «pendiente», como el diseño. En Markdown se escribe `[pendiente: …]`, y el pre-renderizado lo convierte en lo mismo.
- **`LAUNCHED = false`** en `src/site.ts` hasta el PR del lanzamiento.
- **Nada de cookies, ni de Google Fonts, ni de scripts de terceros.** La analítica de Cloudflare la inyecta Pages, no el código.
- **Movimiento:** con `prefers-reduced-motion: reduce`, todo se ve en su estado final y sin animar. Nada depende del movimiento para leerse.
- **Las imágenes de vista previa:** 1200 × 630, PNG, menos de 300 KB, con nombre versionado (`og-inicio-1.png`).
- **Lo que hace la app hoy y nada más** (brief, § 5). **Usted** en toda la página. Datos de ejemplo, nunca de clientes.
- **Comentarios, commits y PR en español**, y los identificadores nuevos en inglés. Ningún dato privado en el repo: ni la IP del servidor, ni cuentas, ni el nombre del cliente real.

## Lo que más puede fallar sin que un test lo vea

1. **La ruta con barra final o con `.html`** (`/imprentas/`, `/imprentas.html`): tiene que hidratarse la página correcta, no la del inicio ni ninguna. Test de `findRoute` en la tarea 1.
2. **La hidratación con desajuste:** si un componente dibuja algo distinto en el servidor y en el navegador (una hora, `window`, un número al azar), React rehace la página y avisa en la consola. Las animaciones arrancan siempre después de montar. Comprobación sin errores en la consola en las tareas 6 y 9.
3. **Con las animaciones desactivadas**, todo lo que aparece al bajar tiene que verse (opacidad 1, sin desplazamiento). Comprobación en el navegador en la tarea 9.
4. **Comillas, `&` y «» en títulos y descripciones** no deben romper el `<head>`. Test de `renderHead` en la tarea 1.
5. **Tildes y paréntesis en el texto del botón:** el enlace de WhatsApp tiene que llevar el texto exacto, codificado. Test de `demoHref` en la tarea 1.

---

## PR 1 · Documentos (rama `pagina-publica`)

El spec, el brief, la decisión en `docs/decisiones.md` y este plan. Lo revisa Codex antes de programar.

**Antes del PR 2, Jonathan:** crea la cuenta de Cloudflare, mueve el DNS y activa el correo (spec, § 6, «El DNS de `wasmish.com` pasa a Cloudflare»).

## PR 2 · El esqueleto de `Site/` (rama `pagina-esqueleto`)

### Tarea 1: Proyecto, configuración y funciones puras

**Archivos:**
- Crear: `Site/package.json`, `Site/vite.config.ts`, `Site/tsconfig.json`, `Site/eslint.config.js`, `Site/index.html` y `Site/src/styles.css`.
- Crear: `Site/src/site.ts`, `Site/src/lib/paths.ts`, `Site/src/lib/links.ts` y `Site/src/lib/head.ts`.
- Test: `Site/tests/unit/paths.test.ts`, `Site/tests/unit/links.test.ts` y `Site/tests/unit/head.test.ts`.

**Interfaces:**
- Produce:
  - `site.ts`: `SITE_URL`, `APP_LOGIN_URL`, `CONTACT_EMAIL`, `WHATSAPP_NUMBER: string | null` (`null`), `BILLING: { name: 'Jonathan Gualli'; ruc: string | null }` (`ruc: null`) y `LAUNCHED: boolean` (`false`).
  - `lib/paths.ts`: `normalizePath(pathname: string): string`.
  - `lib/links.ts`: `demoMessage(label: string): string`, `buildDemoHref(number: string, label: string): string` (`https://wa.me/<número>?text=<mensaje codificado>`) y `demoHref(label: string): string | null`, que da `null` si `WHATSAPP_NUMBER` es `null`.
  - `lib/head.ts`: `type PageMeta = { path: string; title: string; description: string; ogImage: string; noindex?: boolean; jsonLd?: object[] }`, `escapeHtml(s: string): string` y `renderHead(meta: PageMeta): string`.

- [ ] **Paso 1: El proyecto.**
  - **`package.json`:** las dependencias en las versiones de `Frontend/package.json`, más `marked`, `@fontsource/inter`, `@fontsource/jetbrains-mono` y `playwright-core` (de desarrollo). Los scripts:
    - `"build": "tsc -b && vite build && vite build --ssr src/entry-server.tsx --outDir dist-ssr && node scripts/prerender.mjs"`
    - `"lint": "eslint ."`
    - `"test": "node --experimental-strip-types --test tests/unit/*.test.ts tests/output/*.test.mjs"`
  - **`tsconfig.json`:** `allowImportingTsExtensions` y `noEmit`, para que `node:test` importe los `.ts` de `lib/` con su extensión. Los módulos de `lib/` no usan JSX ni dependencias.
  - **`eslint.config.js`:** copia del de `Frontend/`, ignorando `dist` y `dist-ssr`. `.gitignore` con `dist` y `dist-ssr`.
  - **`styles.css`:** `@import "tailwindcss"`, el `@theme` con los tokens copiados de `Frontend/src/App.css` (con el comentario: «copiado de Frontend/src/App.css; si cambian allí, se cambian aquí») y las fuentes latinas de `@fontsource`: Inter en 400, 500, 600, 700 y 800, y JetBrains Mono en 400 y 500.
  - **`index.html`:** `<html lang="es-EC">`, un script en línea al principio del `<head>`, `<script>document.documentElement.classList.add('js')</script>`, para que el CSS sepa antes de dibujar que habrá animaciones (tarea 5), `<!--head-->` dentro de `<head>`, `<div id="app"><!--app--></div>` y `<script type="module" src="/src/entry-client.tsx">`.
  - **Copiar:** el favicon y el logo de `Frontend/public/brand/` a `Site/public/brand/`.

- [ ] **Paso 2: Los tests de las funciones puras.**

```ts
// paths.test.ts
assert.equal(normalizePath('/'), '/')
assert.equal(normalizePath('/imprentas/'), '/imprentas')
assert.equal(normalizePath('/imprentas.html'), '/imprentas')
assert.equal(normalizePath('/index.html'), '/')
assert.equal(normalizePath('/Imprentas'), '/imprentas')

// links.test.ts (con WHATSAPP_NUMBER = null, como hoy)
assert.equal(demoMessage('capacitación'), 'Hola, quiero ver una demostración de Wasmish (capacitación)')
assert.equal(demoHref('web'), null)
// con un número de prueba inyectado: buildDemoHref('593999999999', 'capacitación')
assert.equal(decodeURIComponent(new URL(buildDemoHref('593999999999', 'capacitación')).searchParams.get('text')!),
  'Hola, quiero ver una demostración de Wasmish (capacitación)')
assert.match(buildDemoHref('593999999999', 'web'), /^https:\/\/wa\.me\/593999999999\?text=/)

// head.test.ts
const head = renderHead({ path: '/imprentas', title: 'Wasmish · «Cotice» & "responda"', description: 'a < b', ogImage: '/og-imprentas-1.png' })
assert.match(head, /<title>Wasmish · «Cotice» &amp; &quot;responda&quot;<\/title>/)
assert.match(head, /<meta name="description" content="a &lt; b">/)
assert.match(head, /<link rel="canonical" href="https:\/\/wasmish\.com\/imprentas">/)
assert.match(head, /<meta property="og:image" content="https:\/\/wasmish\.com\/og-imprentas-1\.png">/)
assert.match(head, /<meta property="og:locale" content="es_EC">/)
assert.match(renderHead({ path: '/404', title: 'x', description: 'y', ogImage: '/og-inicio-1.png', noindex: true }), /<meta name="robots" content="noindex">/)
const ld = renderHead({ path: '/', title: 'x', description: 'y', ogImage: '/og-inicio-1.png', jsonLd: [{ name: 'a</script><b>' }] })
assert.equal(ld.match(/<\/script>/g).length, 1)                      // el bloque no se cierra antes de tiempo
assert.equal(JSON.parse(ld.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]).name, 'a</script><b>')
```


- [ ] **Paso 3: Comprobar que fallan.** `cd Site && npm install` (crea `Site/package-lock.json`, que va en el commit; desde aquí, y en el CI, `npm ci`) y `node --experimental-strip-types --test tests/unit/*.test.ts`, que debe dar FAIL porque los módulos no existen.

- [ ] **Paso 4: Implementar** `normalizePath`, `demoMessage`, `buildDemoHref`, `demoHref`, `escapeHtml` y `renderHead`.
  - **`renderHead`** escribe:
    - `<title>` y `description`;
    - `canonical` = `SITE_URL` + `path` (el inicio, `https://wasmish.com/`);
    - `og:title`, `og:description`, `og:image` (dirección completa), `og:url`, `og:type` (`website`), `og:locale` (`es_EC`) y `og:site_name` (`Wasmish`);
    - `twitter:card` (`summary_large_image`);
    - `robots` (`noindex`) si `noindex` está activado;
    - un `<script type="application/ld+json">` por cada objeto de `jsonLd`, escrito con `JSON.stringify(obj).replace(/</g, '\\u003c')`, para que un `</script>` dentro de un texto no cierre el bloque.

- [ ] **Paso 5: Comprobar que pasan.** El mismo comando debe dar PASS, y `npm run lint` debe salir limpio.

- [ ] **Paso 6: Commit** (con `Site/package-lock.json`). `Página: proyecto Site/ y funciones de rutas, enlaces y head`.

### Tarea 2: Pre-renderizado, páginas base y archivos de Cloudflare

**Archivos:**
- Crear: `Site/src/routes.ts`, `Site/src/salesPages.tsx`, `Site/src/entry-server.tsx`, `Site/src/entry-client.tsx` y `Site/scripts/prerender.mjs`.
- Crear: `Site/src/content/types.ts`, `Site/src/content/price.ts` y `Site/src/content/niches/inicio.ts`.
- Crear: `Site/src/pages/VentaPage.tsx` (por ahora solo el titular y el botón), `Site/src/pages/LegalPage.tsx` y `Site/src/pages/NotFoundPage.tsx`.
- Crear: `Site/src/components/Pending.tsx` y `Site/public/_headers`.
- Test: `Site/tests/output/helpers.mjs` (`read(file)`, `allHtmlFiles()`, `title(file)` y `jsonLdBlocks(html)`, sobre `Site/dist/`) y `Site/tests/output/pages.test.mjs`.

**Interfaces:**
- Consume: `renderHead`, `PageMeta`, `normalizePath` y `demoHref` (tarea 1).
- Produce:
  - `content/types.ts`: `type Niche = { slug: 'inicio' | 'capacitacion' | 'imprentas'; path: string; demoLabel: string; meta: Omit<PageMeta, 'path'>; hero: Hero; beforeAfter: { before: string; after: string }[]; features: Feature[]; bot: Bot }`. `Hero`, `Feature` y `Bot` se definen aquí con lo que pida la tarea 6.
  - `content/price.ts`: `PRICE = { currency: 'USD', regular: 30, founder: 20, founderMonths: 12, founderSlots: 10, extraUser: 5 } as const`.
  - `routes.ts` (solo datos, sin componentes): `type Route = { path: string; file: string; hydrate: boolean; meta: PageMeta }`, `ROUTES: Route[]`, `NOT_FOUND: Route` y `findRoute(pathname: string): Route | undefined`, que usa `normalizePath`.
  - `salesPages.tsx`: `renderSalesPage(path: string): ReactElement`, solo para las páginas que hidratan (`VentaPage` con su nicho). **Es lo único que importa `entry-client.tsx`**, junto con `routes.ts`: así `marked` y las páginas legales nunca llegan al JavaScript del navegador.
  - `entry-server.tsx`: `render(path: string): { html: string; head: string }` (las páginas de venta con `renderSalesPage`, y las legales y la 404 con sus componentes), y `listRoutes(): Route[]`, que devuelve `[...ROUTES, NOT_FOUND]`.
  - `<Pending>{children}</Pending>`: el valor de ejemplo más la etiqueta «pendiente», con `data-pending` en el elemento.

- [ ] **Paso 1: El test del HTML generado**, que lee `Site/dist/`.

```js
// pages.test.mjs — después de `npm run build`
const PAGES = [['index.html','/'],['privacidad.html','/privacidad'],['terminos.html','/terminos']]   // la tarea 10 suma los nichos
for (const [file, path] of PAGES) {
  const html = read(file)
  assert.match(html, /<html lang="es-EC">/)
  assert.match(html, new RegExp(`<link rel="canonical" href="https://wasmish\\.com${path === '/' ? '/' : path}">`))
  assert.match(html, /<meta property="og:image" content="https:\/\/wasmish\.com\/og-[a-z]+-\d+\.png">/)
  assert.doesNotMatch(html, /<!--(head|app)-->/)
}
assert.match(read('404.html'), /<meta name="robots" content="noindex">/)
assert.doesNotMatch(read('privacidad.html'), /<script type="module"/)   // las legales no hidratan
assert.match(read('index.html'), /<script type="module"/)
const sitemap = read('sitemap.xml')
assert.match(sitemap, /<loc>https:\/\/wasmish\.com\/<\/loc>/)
assert.doesNotMatch(sitemap, /404/)
assert.match(read('robots.txt'), /Sitemap: https:\/\/wasmish\.com\/sitemap\.xml/)
assert.match(read('_headers'), /https:\/\/:project\.pages\.dev\/\*\n\s+X-Robots-Tag: noindex/)
```

- [ ] **Paso 2: Comprobar que falla:** `npm run build` falla, porque no hay `entry-server.tsx`.
- [ ] **Paso 3: Implementar** las rutas, las dos entradas, las páginas base y `prerender.mjs`.
  - **`prerender.mjs`:**
    - lee `dist/index.html` (la plantilla que dejó Vite) y `dist-ssr/entry-server.js`;
    - para cada ruta de `listRoutes()`, reemplaza `<!--head-->` y `<!--app-->`; si la ruta no hidrata, quita la etiqueta `<script type="module" …></script>`;
    - escribe `dist/<file>`;
    - después escribe `sitemap.xml` (las rutas de `ROUTES`, sin la 404) y `robots.txt` (`User-agent: *`, `Allow: /` y la línea del sitemap), y borra `dist-ssr/`.
  - **`entry-client.tsx`:** `findRoute(location.pathname)`; si la ruta hidrata, `hydrateRoot(document.getElementById('app')!, renderSalesPage(route.path))`.
  - **`LegalPage`** recibe el HTML ya convertido (tarea 3). Por ahora, un texto de prueba.
- [ ] **Paso 4: `_headers`**, con estos valores:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: frame-ancestors 'none'
https://:project.pages.dev/*
  X-Robots-Tag: noindex
```

  El HTML no lleva caché larga: Cloudflare Pages ya lo sirve validándolo, con su ETag. Se comprueba con `curl -I` en la vista previa de la tarea 4.
- [ ] **Paso 5: Comprobar que pasa:** `npm run build && npm test` da PASS. En `npx vite preview`, `/privacidad` y `/privacidad.html` dan la página legal. **La barra final (`/privacidad/`) no se prueba en local:** `vite preview` busca `privacidad/index.html` y responde con el inicio. Eso se comprueba en la vista previa de Pages (tarea 4), donde también se miran las redirecciones y la 404. `findRoute` ya cubre la barra en su test.
- [ ] **Paso 6: Commit.** `Página: pre-renderizado, rutas, sitemap y cabeceras de Cloudflare`.

### Tarea 3: Privacidad, Términos y el chequeo de huecos

**Archivos:**
- Crear: `Site/src/legal/privacidad.md` y `Site/src/legal/terminos.md`.
- Crear: `Site/src/lib/markdown.ts`.
- Modificar: `Site/src/entry-server.tsx`, `Site/src/routes.ts` y `Site/src/pages/LegalPage.tsx`.
- Test: `Site/tests/unit/markdown.test.ts` y `Site/tests/output/pending.test.mjs`.

**Interfaces:**
- Consume: `LAUNCHED` (tarea 1) y `Pending` (tarea 2).
- Produce: `markdownToHtml(md: string): string`, en `lib/markdown.ts`, con `marked` y el reemplazo de `[pendiente: …]` por `<span data-pending>…</span>`. Lo usa solo `entry-server.tsx`.

- [ ] **Paso 1: El test.**

```ts
// markdown.test.ts — con una entrada de prueba, no con el contenido real
const html = markdownToHtml('Lo guardamos [pendiente: 30] días.\n\n## Título')
assert.match(html, /<span data-pending[^>]*>30<\/span>/)
assert.doesNotMatch(html, /\[pendiente:/)
assert.match(html, /<h2[^>]*>Título<\/h2>/)
```

```js
// pending.test.mjs — sobre lo publicado
const pending = allHtmlFiles().filter(f => read(f).includes('data-pending'))
if (LAUNCHED) assert.deepEqual(pending, [], `Páginas con huecos: ${pending.join(', ')}`)
else if (pending.length) console.warn(`Aviso: ${pending.length} páginas con huecos (no bloquea hasta el lanzamiento)`)
for (const f of allHtmlFiles()) assert.doesNotMatch(read(f), /\[pendiente:/)   // ningún hueco sin convertir
```

  `LAUNCHED` se lee de `src/site.ts`, con la eliminación de tipos de Node.

- [ ] **Paso 2: Comprobar que falla:** `npm run build && npm test`.
- [ ] **Paso 3: El contenido.** Copiar a `privacidad.md` y `terminos.md` **solo el texto citado** (`> …`) de los borradores de la carpeta comercial de Jonathan (`2026-10-17-borradores-faq-y-legales.md`, § 2 y § 3), sin las notas para él, y cambiando cada `[…]` por `[pendiente: …]`. Las decisiones de cancelar ya están tomadas: 30 días desde el fin del mes pagado, contactos y conversaciones en Excel, y desconexión ese día. Implementar `markdownToHtml` y usarlo en `entry-server.tsx` para `LegalPage`, con la misma cabecera y el mismo pie que la página de venta (tarea 5).
- [ ] **Paso 4: Comprobar que pasa:** `npm run build && npm test` da PASS, con el aviso de huecos.
- [ ] **Paso 5: Commit.** `Página: Privacidad y Términos, y el chequeo de huecos`.

### Tarea 4: El CI, Cloudflare Pages y la documentación del esqueleto

**Archivos:**
- Modificar: `.github/workflows/ci.yml`.
- Crear: `docs/arquitectura/pagina-publica.md`.
- Modificar: `AGENTS.md` (comandos y mapa) y `docs/estado.md` («En curso»).

- [ ] **Paso 1: El trabajo `site`** en el CI, con el nombre `Site · lint, build y tests`, calcado del de `frontend`: Node 22, caché de `Site/package-lock.json`, y `npm ci`, `npm run lint`, `npm run build` y `npm test`.
- [ ] **Paso 2: La documentación.**
  - **`docs/arquitectura/pagina-publica.md`,** con su índice. Cuenta:
    - cómo se agrega un nicho;
    - cómo se pre-renderiza;
    - los huecos y `LAUNCHED`;
    - la vista previa en WhatsApp y el cambio de nombre de las imágenes;
    - Cloudflare Pages (la tabla de ajustes del spec, § 6).
  - **`AGENTS.md`:** la fila en el mapa y la columna `Site/` en la tabla de comandos.
  - Comprobar con `node .github/scripts/check-docs.mjs`.
- [ ] **Paso 3: Jonathan conecta Cloudflare Pages** con los ajustes del spec, § 6, y suma `Site · lint, build y tests` a la regla de `master`. **Comprobar en la vista previa del PR:**
  - `/` responde;
  - `/no-existe` da 404 con la página 404;
  - `/privacidad/` y `/privacidad.html` llevan a `/privacidad` (o la sirven) sin dar el inicio;
  - `curl -I` de la dirección `*.pages.dev` trae `X-Robots-Tag: noindex`.

  Y Jonathan **activa Web Analytics** en el proyecto de Pages: sin código y sin cookies.
- [ ] **Paso 4: Commit y PR.** `Página: trabajo Site en el CI y documentación`.

## PR 3 · El inicio (rama `pagina-inicio`)

Cada tarea dibuja una parte de la v3 con el texto del brief. Los valores visuales salen del diseño y de sus capturas.

### Tarea 5: Piezas comunes y las imitaciones de la app

**Archivos:**
- Crear, en `Site/src/components/`: `Header.tsx`, `Footer.tsx`, `DemoButton.tsx`, `Highlight.tsx`, `Reveal.tsx` y `useReducedMotion.ts`.
- Crear, en `Site/src/components/app/` (imitaciones de la app): `ChatWindow.tsx`, `Bubble.tsx`, `ContactCard.tsx` y `NoteItem.tsx`.

**Interfaces:**
- Consume: `demoHref`, `demoMessage` (tarea 1), `Pending` (tarea 2), `APP_LOGIN_URL`, `CONTACT_EMAIL`, `WHATSAPP_NUMBER` y `BILLING`.
- Produce:
  - `<DemoButton label={string} />`: si `demoHref` da `null`, un botón con `<Pending>`.
  - `<Highlight>texto</Highlight>`: la palabra en la píldora verde tinta.
  - `<Reveal>`: aparece al entrar en pantalla. El HTML del servidor es el mismo siempre, para que la hidratación no choque. El estado oculto lo pone el CSS: `html.js [data-reveal]:not([data-in])` dentro de `@media (prefers-reduced-motion: no-preference)`, y un `IntersectionObserver`, en un efecto, pone `data-in`. Sin JavaScript o con movimiento reducido, se ve todo.
  - `useReducedMotion(): boolean`.
  - `<Bubble from="client|team" author? time status? bot? businessApp?>`.
  - `<NoteItem text author when edited? />`, como en la 1.0.26.
- [ ] **Paso 1:** implementar las piezas siguiendo la v3. El pie, con `WHATSAPP_NUMBER` y el RUC en `<Pending>`, y la línea de Meta tal como la dice el brief, § 3.9.
- [ ] **Paso 2:** `npm run build && npm test` en verde, y en `vite preview`, sin avisos de hidratación en la consola.
- [ ] **Paso 3: Commit.** `Página: cabecera, pie, botón e imitaciones de la app`.

### Tarea 6: El hero con su conversación animada

**Archivos:**
- Crear: `Site/src/sections/Hero.tsx` y `Site/src/sections/HeroDemo.tsx`.
- Modificar: `Site/src/content/types.ts` (`Hero`) y `Site/src/content/niches/inicio.ts`.

**Interfaces:**
- Produce: `type Hero = { eyebrow: string; title: { before: string; highlight: string; after: string }; subtitle: string; demo: HeroStep[] }` y `type HeroStep = { caption: string; messages: …; note?: … }`. Son los 4 pasos de la v3: «Ana atiende a María», «Ana abre la ficha y deja una nota», el regreso del cliente y Luis respondiendo.
- [ ] **Paso 1:** implementar.
  - El servidor dibuja **todos los mensajes**, cada uno con `data-step`, para que sin JavaScript se vea la historia entera. Con la clase `js` y movimiento permitido, el CSS oculta los pasos que todavía no llegaron, así no hay un salto al hidratar. La animación avanza sola, con su barra «01 / 04».
  - **Con movimiento reducido** se queda en el paso 4.
  - La nota del paso 2 usa `NoteItem`, con su autora (Ana) y su fecha. Sin la línea «Ana la escribió el martes…».
- [ ] **Paso 2:** en `vite preview`, en celular (390 px), **la conversación asoma en la primera pantalla**, como en la captura `movil-00`. Sin errores en la consola.
- [ ] **Paso 3: Commit.** `Página: hero con la conversación de Ana y Luis`.

### Tarea 7: «Lo que pasa hoy» y las funciones una por una

**Archivos:**
- Crear: `Site/src/sections/BeforeAfter.tsx` y `Site/src/sections/Features.tsx`.
- Modificar: `Site/src/content/types.ts` (`Feature`) y `Site/src/content/niches/inicio.ts`.

- [ ] **Paso 1: `BeforeAfter`,** con las 4 parejas del anexo (brief) envueltas en `Reveal`, y los íconos flotantes solo con CSS (`@media (prefers-reduced-motion: no-preference)`).
- [ ] **Paso 2: `Features`,** sobre verde tinta, con las 4 funciones de la v3 y la franja de cuatro columnas de abajo.
  - **En computadora:** la pantalla de la derecha es `sticky` y cambia con la función activa, que se detecta con `IntersectionObserver`; el contador «n / 4» y su barra.
  - **En celular:** apiladas, cada una con su contador, **sin `sticky`**, para que no cueste pasar de largo.
  - La función 2 usa `NoteItem` con su autor.
- [ ] **Paso 3:** comprobar en `vite preview`, en los dos anchos y con movimiento reducido.
- [ ] **Paso 4: Commit.** `Página: lo que pasa hoy y las funciones`.

### Tarea 8: Respuestas automáticas y «Probar»

**Archivos:**
- Crear: `Site/src/sections/AutoReplies.tsx`.
- Modificar: `Site/src/content/types.ts` (`Bot`) y `Site/src/content/niches/inicio.ts`.

**Interfaces:**
- Produce: `type Bot = { chat: HeroStep[]; examples: { question: string; answer: string; reason: string }[] }`. Los ejemplos de «Probar» **son datos**, sin lógica: cada uno con la respuesta y el motivo («Palabra clave «precio»», «Si no entiende»…).
- [ ] **Paso 1:** implementar.
  - **El chat de la izquierda,** con sus 3 pasos; el mensaje del bot lleva la marca «Bot».
  - **La tabla de las cuatro formas.**
  - **«Probar»:** los botones son `<button>` y muestran la pareja elegida; en el servidor sale elegida la segunda, como en la v3.
  - **Las tres líneas de confianza** del brief, § 3.3.
  - **Al menos un ejemplo responde con «Si no entiende».**
- [ ] **Paso 2:** comprobar en `vite preview`.
- [ ] **Paso 3: Commit.** `Página: respuestas automáticas y Probar`.

### Tarea 9: Implementación, precio, lo que cambia, preguntas y cierre

**Archivos:**
- Crear, en `Site/src/sections/`: `Setup.tsx`, `Pricing.tsx`, `WhatChanges.tsx`, `Faq.tsx` y `ClosingCta.tsx`.
- Crear: `Site/src/content/faq.ts`.
- Modificar: `Site/src/routes.ts`, para el JSON-LD del inicio en su `meta`.
- Test: `Site/tests/output/content.test.mjs`.

- [ ] **Paso 1: El test.**

```js
// content.test.mjs
const home = read('index.html')
const ld = JSON.parse(home.match(/<script type="application\/ld\+json">(.+?)<\/script>/s)[1])   // el primero: Organization
assert.equal(ld['@type'], 'Organization')
const app = jsonLdBlocks(home).find(b => b['@type'] === 'SoftwareApplication')
assert.deepEqual(app.offers.map(o => o.price).sort(), ['20', '30'])
assert.ok(app.offers.every(o => o.priceCurrency === 'USD'))
assert.match(home, /USD 20/)                        // la página dice el mismo precio que el JSON-LD
assert.match(home, /<details[\s>]/)                  // las preguntas funcionan sin JavaScript
assert.match(home, /¿Tengo que dejar la app de WhatsApp Business\?/)
```

- [ ] **Paso 2: Comprobar que falla:** `npm run build && npm test`.
- [ ] **Paso 3: Implementar.**
  - **`Setup`:** los 4 pasos grandes, la línea de las 2 horas y la tarjeta de Jonathan.
  - **`Pricing`:** con `PRICE`, y la suma del ejemplo con las cifras de Meta en `<Pending>`.
  - **`WhatChanges`:** el brief, § 3.4.
  - **`Faq`:** con `<details>`/`<summary>`, sin JavaScript. Las 9 preguntas del brief, § 3.7, en ese orden. Las respuestas de «¿Qué pasa si cancelo?», «¿De quién son mis datos?» y «¿Qué necesito para empezar?» salen de los borradores (decisiones de cancelar tomadas el 2026-10-17).
  - **`ClosingCta`:** «Véalo con el caso de su negocio, en 15 minutos».
  - **El JSON-LD:** `Organization` (nombre, `url`, `logo`, `email`) y `SoftwareApplication` (`applicationCategory: 'BusinessApplication'`; `offers` con 30 y 20 desde `PRICE`, como cadenas).
- [ ] **Paso 4: Comprobar que pasa:** `npm run build && npm test` da PASS.
- [ ] **Paso 5: Comprobación en el navegador,** con `playwright-core` y el Chrome del sistema, sobre `vite preview`:
  - capturas de toda la página en 390 px y en 1440 px;
  - **con `reducedMotion: 'reduce'`, ningún elemento de `Reveal` tiene opacidad menor que 1;**
  - **sin errores ni avisos de hidratación en la consola;**
  - el peso transferido del inicio, **menos de 300 KB** sin las fuentes.
  
  Las capturas se miran contra `diseno-v3-capturas/`.
- [ ] **Paso 6: Commit y PR.** `Página: implementación, precio, preguntas y cierre`. En el PR van las capturas en celular y la dirección de la vista previa.

## PR 4 · Las páginas por nicho y las imágenes de vista previa (rama `pagina-nichos`)

### Tarea 10: `/capacitacion` e `/imprentas`

**Archivos:**
- Crear: `Site/src/content/niches/capacitacion.ts` y `Site/src/content/niches/imprentas.ts`.
- Modificar: `Site/src/routes.ts` y `Site/src/salesPages.tsx`.
- Modificar: `Site/tests/output/pages.test.mjs`, para sumar las dos páginas.
- Crear: `Site/tests/output/niches.test.mjs`.

- [ ] **Paso 1: El test.**

```js
for (const [file, label] of [['index.html','web'],['capacitacion.html','capacitación'],['imprentas.html','imprentas']]) {
  const html = read(file)
  // el botón lleva su etiqueta (cuando hay número) o el hueco marcado (mientras no lo hay)
  assert.ok(html.includes(encodeURIComponent(`Wasmish (${label})`)) || /data-pending/.test(html))
}
assert.match(read('imprentas.html'), /16 MB/)          // el límite de archivos (brief, § 3.3)
assert.notEqual(title('imprentas.html'), title('capacitacion.html'))
```

- [ ] **Paso 2: Comprobar que falla.**
- [ ] **Paso 3: Implementar** los dos archivos de textos:
  - **El titular, el problema y los ejemplos:** el brief, § 3.1 a § 3.3.
  - **La conversación:** la de la 3a y la 3b. Capacitación: el interesado en el curso; imprentas: la cotización de 1.000 volantes con su PDF.
  - **El «antes y después»** adaptado a cada nicho, con el mismo sentido.
  - **Los ejemplos de «Probar»** de cada nicho: en imprentas, el bot no cotiza.
  - **El `meta`** propio.
  
  Agregar las dos rutas.
- [ ] **Paso 4: Comprobar que pasa.** `npm run build && npm test`, y capturas de las dos páginas en celular.
- [ ] **Paso 5: Commit.** `Página: capacitación e imprentas`.

### Tarea 11: Las imágenes de vista previa

**Archivos:**
- Crear: `Site/src/og/OgCard.tsx` y `Site/scripts/og.mjs`.
- Crear: `Site/public/og-inicio-1.png`, `Site/public/og-capacitacion-1.png` y `Site/public/og-imprentas-1.png`.
- Modificar: `Site/tests/output/pages.test.mjs`.

- [ ] **Paso 1: El test.** Cada `og:image` de las páginas existe en `dist/`, pesa menos de 300 KB, y su PNG mide 1200 × 630, leído de los bytes 16 a 23 de la cabecera.
- [ ] **Paso 2: Comprobar que falla.**
- [ ] **Paso 3: Implementar.**
  - **`OgCard`:** el diseño «og2», con el titular del nicho y su ejemplo.
  - **`og.mjs`:** dibuja `OgCard` con el SSR, con el CSS compilado incrustado, en una página de `playwright-core` (`channel: 'chrome'`) de 1200 × 630, y guarda los PNG. **Se corre a mano** (`npm run og`) y los PNG se guardan en el repo.
- [ ] **Paso 4: Comprobar que pasa.** Mirar las tres imágenes.
- [ ] **Paso 5: Commit y PR.** `Página: imágenes de vista previa`. **En el PR, Jonathan** se manda por WhatsApp las tres direcciones de la vista previa y confirma que la imagen y el texto salen bien.

## PR 5 · El lanzamiento (rama `pagina-lanzamiento`)

Cuando Jonathan tenga el contenido del spec, § 9: el número, el RUC y el IVA, los textos legales revisados y las tarifas de Meta.

### Tarea 12: Llenar los huecos y encender `LAUNCHED`

- [ ] **Paso 1:**
  - **En `site.ts`:** `WHATSAPP_NUMBER`, `BILLING.ruc` y `LAUNCHED = true`.
  - **El resto:** los huecos de `price.ts`, de las preguntas y del Markdown.
  - **Si cambió una imagen de vista previa,** su número de versión sube.
- [ ] **Paso 2:** `npm run build && npm test`, que da PASS **sin ningún `data-pending`**. Desde aquí el chequeo hace fallar el CI.
- [ ] **Paso 3:** PageSpeed de la vista previa, **90 o más en celular**.
- [ ] **Paso 4: Commit.** `Página: contenido final y lanzamiento`.

### Tarea 13: El dominio, el servidor y la documentación

**Archivos:**
- Modificar: `deploy/compose.yml` (quitar los routers `prod-wasmish-main-site` y `prod-wasmish-main-www`, sus middlewares, y `wasmish.com` y `www.wasmish.com` de la regla de `prod-wasmish-main-http`).
- Modificar: `deploy/README.md` § Dominios, `docs/arquitectura/pagina-publica.md` y `docs/estado.md`.

- [ ] **Paso 1: Jonathan,** después de unir el PR de la tarea 12:
  - en Cloudflare Pages, conecta `wasmish.com` como dominio propio, que reemplaza el registro A de `@`;
  - **`www` pasa a «con proxy» (nube naranja)**, para que Cloudflare pueda redirigir: sin el proxy, las visitas siguen llegando al servidor y la regla no actúa. `app` sigue en «solo DNS». Después, una regla de Cloudflare `www.wasmish.com/*` → `https://wasmish.com/${1}` (301, conservando la ruta y los parámetros), como en la [guía de Cloudflare](https://developers.cloudflare.com/pages/how-to/www-redirect/);
  - **antes de quitar los routers del servidor**, comprobar con `curl -I` que `https://www.wasmish.com/imprentas?x=1` da 301 a `https://wasmish.com/imprentas?x=1` con un certificado válido;
  - comprueba `wasmish.com`, `www` y las tres páginas, y que `app.wasmish.com/api/version`, los entrantes del webhook y `POST /api/v1/templates/send` siguen respondiendo;
  - conecta **Google Search Console** (registro TXT en Cloudflare) y le da `https://wasmish.com/sitemap.xml`.
- [ ] **Paso 2:** el cambio del `compose.yml` y la documentación, en un PR que sale con el siguiente despliegue de la app.
- [ ] **Paso 3: Commit y PR.** `Dominios: wasmish.com sale del servidor`.
