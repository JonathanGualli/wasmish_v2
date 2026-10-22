# Página pública `wasmish.com`

La página de venta de Wasmish: el inicio, una página por nicho, Privacidad y Términos. Vive en `Site/`, separada de la app (no comparte código con `Frontend/`), y se publica en Cloudflare Pages. El porqué de cada decisión está en el [spec](../superpowers/specs/2026-10-17-pagina-publica-design.md); qué dice la página, en el [brief](../superpowers/specs/2026-10-17-pagina-publica-brief.md).

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md).

## Contenido

- [Cómo se construye](#cómo-se-construye)
- [Agregar una página de nicho](#agregar-una-página-de-nicho)
- [Huecos y lanzamiento](#huecos-y-lanzamiento)
- [Vista previa en WhatsApp y SEO](#vista-previa-en-whatsapp-y-seo)
- [Cloudflare Pages](#cloudflare-pages)
- [Comandos y pruebas](#comandos-y-pruebas)

---

### Cómo se construye

React 19, Vite y Tailwind v4, como la app, pero **pre-renderizado**: WhatsApp y Google leen el HTML sin ejecutar JavaScript, así que cada página sale de la compilación ya escrita. `npm run build` hace tres pasos:

1. `vite build`: el JavaScript y el CSS del navegador, en `dist/assets/`.
2. `vite build --ssr src/entry-server.tsx`: el mismo código, para Node, en `dist-ssr/`.
3. `scripts/prerender.mjs`: por cada página, `render(ruta)` (`renderToString`) y el `<head>` (`lib/head.ts`), metidos en la plantilla `index.html` (`<!--head-->` y `<!--app-->`). Después escribe `sitemap.xml` y `robots.txt`, y borra `dist-ssr/`.

**Las rutas son datos** (`src/routes.ts`): la ruta, el archivo de salida (`imprentas.html`, que Cloudflare sirve en `/imprentas`), si hidrata y su `<head>`. `NOT_FOUND` escribe `404.html`: sin ese archivo, Cloudflare respondería el inicio, con 200, a cualquier dirección.

**Solo hidratan las páginas de venta**, que tienen movimiento. El navegador importa `routes.ts` y `salesPages.tsx`, nada más. Las páginas legales y la 404 salen sin la etiqueta `<script type="module">`, y `marked` (el Markdown) nunca llega al JavaScript del navegador. `findRoute` usa `normalizePath`, para que `/imprentas/` y `/imprentas.html` hidraten la página correcta.

**Lo que se anima** no puede dibujarse distinto en el servidor y en el navegador, o React rehace la página. El HTML es siempre el mismo, y el estado oculto lo pone el CSS gracias a la clase `js`, que un script en línea de `index.html` le pone a `<html>` antes de dibujar. Sin JavaScript, o con `prefers-reduced-motion`, se ve todo.

**El diseño es la v3 de Claude Design** («Wasmish Inicio v3 - Calma con vida», en la carpeta comercial privada de Jonathan, con capturas por sección). Sus medidas se copian tal cual, en Tailwind. Los tonos que el manual no tiene (las sombras «de tecla», las líneas sobre la banda oscura, algunos de las pantallas de ejemplo) son tokens `site-*` en `src/styles.css`, nunca colores sueltos. Los íconos son de Lucide, como en la app. El diseño suma el relleno lateral **por fuera** de los 1320 px: por eso los contenedores llevan `box-content`.

**La conversación del hero** (`sections/HeroDemo.tsx`, el componente «ChatFicha» del diseño) tiene 16 fases con sus tiempos: Ana atiende, deja una nota en la ficha (que se escribe letra por letra y queda con su nombre y su fecha, como en la app 1.0.26), y días después Luis retoma. Con la ficha al lado si caben 560 px (consulta de contenedor) o, en el celular, como una hoja que entra desde el costado. Para que no haya un salto al cargar:
- el servidor la dibuja completa (`data-hero="still"`): es lo que ven quien no tiene JavaScript, quien desactivó las animaciones, WhatsApp y Google;
- con la clase `js` y las animaciones permitidas, el CSS esconde desde el primer instante lo marcado `data-later` (lo que todavía no llegó) y pone la ficha como hoja;
- al montar, React pasa a `data-hero="anim"` en la primera fase, y la animación solo corre mientras se ve (`IntersectionObserver`).

**Las secciones**, en el orden del diseño (`pages/VentaPage.tsx`): el hero, «Lo que pasa hoy» (`BeforeAfter`), «Lo que ve su equipo» (`Features`), las respuestas automáticas (`AutoReplies`), la implementación (`Setup`), el precio (`Pricing`, `#precio`), «Lo que cambia» (`WhatChanges`, `#cambios`), las preguntas (`Faq`, con `<details>`: se abren sin JavaScript) y el cierre (`ClosingCta`).
- **«Lo que ve su equipo»:** en la computadora (≥ 900 px), la pantalla de la derecha queda fija (`sticky`) y cambia con la función que está en el centro, que se calcula al bajar; en el celular, cada función lleva su pantalla debajo. Las pantallas (`components/app/FeatureScreen.tsx`) animan su detalle cuando están en foco. Hasta montar, y siempre sin animaciones, se dibujan en su estado final.
- **El chat del bot** usa `useStory` (`components/app/useStory.ts`), la misma idea que el hero con menos estados: `data-story="still"` con la historia completa, `data-later` y la animación al montar.
- **«Probar»** son datos (`bot.examples` del nicho): cada pregunta trae su respuesta y por qué sale. No imita la lógica del bot.
- **Lo que dicen igual todas las páginas** (las cuatro formas del bot, los pasos de la implementación, «Lo que cambia», las preguntas) está en `content/home.ts`; lo propio de cada nicho, en `content/niches/`. **El JSON-LD del inicio** (`content/structuredData.ts`) toma el precio de `content/price.ts`, igual que la sección del precio.

**Las secciones aparecen al bajar** (`useReveal`, atributos `data-reveal` y `data-delay`): después de hidratar se esconden solo las que todavía no están en pantalla, así que nada parpadea.

**De la app solo se copian** los tokens de la marca (`src/styles.css`, de `Frontend/src/App.css`: si cambian allí, se cambian aquí), el logo y el favicon. Las fuentes (Inter y JetBrains Mono, variables) se sirven desde la página, sin Google Fonts.

### Agregar una página de nicho

Cada página de venta es un archivo de textos en `src/content/niches/` (tipo `Niche`, en `src/content/types.ts`), y `VentaPage` es el único molde. Para un nicho nuevo:

1. Crear `src/content/niches/<nicho>.ts`, con su `path`, su `demoLabel` (va en el texto del botón), su `meta` (título, descripción e imagen de vista previa) y lo propio de su página: el hero con su conversación, las parejas de «Lo que pasa hoy», las funciones con sus pantallas y el bot con sus ejemplos de «Probar».
2. Sumarlo a `NICHES`, en `src/routes.ts`.
3. Generar su imagen de vista previa: `npm run og` (ver «Vista previa en WhatsApp y SEO»).

Hoy hay tres: el inicio (`/`), `/capacitacion` e `/imprentas`. Las escenas de los nichos son las del diseño v3 (Daniela y el curso de contabilidad; Gabriela y los 1.000 volantes), y cada uno tiene sus palabras clave del bot, su «Probar», la palabra del cierre («su centro», «su imprenta») y, si hace falta, textos propios en la franja de las funciones (`stripText`: en imprentas, el límite de 16 MB y que los AI y PSD van por correo).

**Si la palabra resaltada del titular es larga** y puede no caber en un renglón («qué se le cotizó»), el titular lleva `wraps: true`: la píldora va en línea, partida por renglones (`box-decoration-break: clone`), en lugar de un bloque enorme.

El precio no va en el nicho: sale de `src/content/price.ts`, el mismo dato que usa el JSON-LD.

### Huecos y lanzamiento

Un dato que todavía no existe (el número de WhatsApp, un plazo de los Términos) **no se inventa**: en el código, `<Pending>`; en Privacidad y Términos (`src/legal/*.md`), `[pendiente: …]`, que `markdownToHtml` convierte en lo mismo. Los dos dejan `data-pending` en el HTML y se ven con la etiqueta «pendiente».

`LAUNCHED`, en `src/site.ts`, está en `true` desde el PR del lanzamiento (2026-10-19): una página con huecos **hace fallar el CI**, y así no se publica. Antes, con `false`, `tests/output/pending.test.mjs` solo avisaba.

Los textos legales dicen el proveedor del servidor (GTHost) y su país: si el servidor se muda, se corrige Privacidad. El plazo de los datos de facturación (siete años) es el de la normativa tributaria de Ecuador, sin revisar por un contador.

Los datos fijos (`SITE_URL`, `APP_LOGIN_URL`, `CONTACT_EMAIL`, `WHATSAPP_NUMBER`) están en `src/site.ts`. **El RUC no se publica** (decisión de Jonathan, 2026-10-19): ni en el pie de página ni en Privacidad ni en Términos.

Las cifras de Meta del ejemplo de un mes (`META_EXAMPLE`, en `src/sections/Pricing.tsx`) salen de su tabla de tarifas para «Resto de Latinoamérica», comprobada el 2026-10-19. Meta las cambia cada trimestre: hay que revisarlas cuando publica una tabla nueva.

### Vista previa en WhatsApp y SEO

`renderHead` escribe en cada página `<title>`, la descripción, `canonical` y las etiquetas `og:` y `twitter:`, **todas con direcciones completas** (`https://wasmish.com/...`), porque WhatsApp no entiende las relativas. La 404 lleva `noindex`. El JSON-LD se escribe con `<` escapado como `<`, para que un texto no pueda cerrar el `<script>`.

**Las imágenes de vista previa** (`public/og-*.png`, 1200 × 630, del diseño «og2») se generan con `npm run og`. Compila con `VITE_OG=1`, que agrega las tarjetas de `src/og/OgCard.tsx` como páginas sueltas; `scripts/og.mjs` las sirve en local y las fotografía con el Chrome del sistema (`playwright-core`, que no descarga navegadores); y vuelve a compilar sin ellas. Los PNG van en el repo, y un test comprueba que cada `og:image` existe, pesa menos de 300 KB y mide 1200 × 630.

**WhatsApp guarda la vista previa de un enlace un tiempo.** Si cambia una imagen de vista previa, cambia también su nombre (`og-inicio-1.png` → `og-inicio-2.png`).

El botón «Pedir una demostración» abre WhatsApp con un texto que dice de qué página viene: `Hola, quiero ver una demostración de Wasmish (<demoLabel>)`. Así se mide qué nicho trae demostraciones, sin cookies. Las visitas las cuenta Cloudflare Web Analytics, que se activa en el panel de Pages, sin código.

### Cloudflare Pages

Conectado al repo desde el panel de Cloudflare: no hay claves en GitHub.

| Ajuste | Valor |
|---|---|
| Rama de producción | `master` |
| Carpeta raíz | `Site` |
| Comando | `npm ci && npm run build` |
| Carpeta de salida | `dist` |
| Variable | `NODE_VERSION=22` |
| Rutas que disparan una compilación | `Site/*` |

- **Se publica al unir un PR que toca `Site/`**, y cada uno de esos PR tiene su vista previa en `*.pages.dev`.
- **`public/_headers`:** caché de un año para `/assets/*`, cabeceras de seguridad básicas y `X-Robots-Tag: noindex` para las direcciones `*.pages.dev`, para que Google indexe solo `wasmish.com`.
- **El DNS de `wasmish.com` está en Cloudflare** desde el 2026-10-17, y la página, en el aire desde el 2026-10-19:
  - `wasmish.com` es un dominio propio del proyecto de Pages (un CNAME a `wasmish-site.pages.dev`, «Proxied»);
  - `www` es «Proxied» y una *Redirect Rule* («www a wasmish.com»: `https://www.*` → `https://${1}`, 301, conservando los parámetros) lo manda a `wasmish.com`. Sin el proxy, la regla no actúa;
  - `app` sigue en «DNS only», al servidor: ver [deploy/README.md § Dominios](../../deploy/README.md#dominios);
  - `hola@wasmish.com` **recibe** con Email Routing (los tres MX `route*.mx.cloudflare.net` y el SPF de Cloudflare en `wasmish.com`), que lo reenvía al Gmail de Jonathan;
  - y **envía** desde el 2026-10-22 por **Resend** (región São Paulo): Gmail la tiene en «Enviar como», con el SMTP `smtp.resend.com:587` (TLS, usuario `resend`, una API key de solo envío para `wasmish.com`). En Cloudflare, solo los registros de envío: el DKIM `resend._domainkey` (TXT) y los CNAME `send` y `rsend`, más el DMARC `_dmarc` (`v=DMARC1; p=none;`). **En Resend, «Enable Receiving» va apagado:** pide un MX en `wasmish.com` que le quitaría el correo a Email Routing.

### Comandos y pruebas

En `Site/`:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite en modo desarrollo (sin pre-renderizar: para ver los componentes) |
| `npm run build` | Las dos compilaciones y el pre-renderizado, en `dist/` |
| `npm run preview` | Sirve `dist/` en local |
| `npm test` | Los tests de `tests/unit/` (funciones puras, con la eliminación de tipos de Node) y de `tests/output/` (el HTML generado: hay que compilar antes) |
| `npm run lint` | ESLint |
| `npm run og` | Genera las imágenes de vista previa (necesita Chrome instalado) |

**`vite preview` no se porta como Cloudflare:** responde el inicio a una ruta con barra final (`/privacidad/`) o desconocida. La barra final, las redirecciones y la 404 se comprueban en la vista previa de Pages.

El CI tiene el trabajo **`Site · lint, build y tests`**.
