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

**Las secciones aparecen al bajar** (`useReveal`, atributos `data-reveal` y `data-delay`): después de hidratar se esconden solo las que todavía no están en pantalla, así que nada parpadea.

**De la app solo se copian** los tokens de la marca (`src/styles.css`, de `Frontend/src/App.css`: si cambian allí, se cambian aquí), el logo y el favicon. Las fuentes (Inter y JetBrains Mono, variables) se sirven desde la página, sin Google Fonts.

### Agregar una página de nicho

Cada página de venta es un archivo de textos en `src/content/niches/` (tipo `Niche`, en `src/content/types.ts`), y `VentaPage` es el único molde. Para un nicho nuevo:

1. Crear `src/content/niches/<nicho>.ts`, con su `path`, su `demoLabel` (va en el texto del botón), su `meta` (título, descripción e imagen de vista previa) y sus textos.
2. Sumarlo a `NICHES`, en `src/routes.ts`.
3. Generar su imagen de vista previa.

El precio no va en el nicho: sale de `src/content/price.ts`, el mismo dato que usa el JSON-LD.

### Huecos y lanzamiento

Un dato que todavía no existe (el número de WhatsApp, el RUC, una cifra de Meta) **no se inventa**: en el código, `<Pending>`; en Privacidad y Términos (`src/legal/*.md`), `[pendiente: …]`, que `markdownToHtml` convierte en lo mismo. Los dos dejan `data-pending` en el HTML y se ven con la etiqueta «pendiente».

`LAUNCHED`, en `src/site.ts`, está en `false` hasta el lanzamiento. Mientras tanto, `tests/output/pending.test.mjs` solo **avisa** de las páginas con huecos. Con `true`, una página con huecos **hace fallar el CI**, y así no se publica.

Los datos fijos (`SITE_URL`, `APP_LOGIN_URL`, `CONTACT_EMAIL`, `WHATSAPP_NUMBER`, `BILLING`) están en `src/site.ts`.

### Vista previa en WhatsApp y SEO

`renderHead` escribe en cada página `<title>`, la descripción, `canonical` y las etiquetas `og:` y `twitter:`, **todas con direcciones completas** (`https://wasmish.com/...`), porque WhatsApp no entiende las relativas. La 404 lleva `noindex`. El JSON-LD se escribe con `<` escapado como `<`, para que un texto no pueda cerrar el `<script>`.

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
- **El DNS de `wasmish.com` está en Cloudflare** desde el 2026-10-17. Hasta el lanzamiento, los tres registros A (`@`, `www` y `app`) apuntan al servidor en «DNS only», y `wasmish.com` sigue llevando a la app. `hola@wasmish.com` se reenvía con Email Routing. Lo que cambia al lanzar está en el [spec, § 6 y § 7](../superpowers/specs/2026-10-17-pagina-publica-design.md#6-publicación-dns-y-correo).

### Comandos y pruebas

En `Site/`:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite en modo desarrollo (sin pre-renderizar: para ver los componentes) |
| `npm run build` | Las dos compilaciones y el pre-renderizado, en `dist/` |
| `npm run preview` | Sirve `dist/` en local |
| `npm test` | Los tests de `tests/unit/` (funciones puras, con la eliminación de tipos de Node) y de `tests/output/` (el HTML generado: hay que compilar antes) |
| `npm run lint` | ESLint |

**`vite preview` no se porta como Cloudflare:** responde el inicio a una ruta con barra final (`/privacidad/`) o desconocida. La barra final, las redirecciones y la 404 se comprueban en la vista previa de Pages.

El CI tiene el trabajo **`Site · lint, build y tests`**.
