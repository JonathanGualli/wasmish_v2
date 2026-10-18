# Página pública `wasmish.com`: diseño técnico

Fecha: 2026-10-17. Diseño acordado con Jonathan en una sesión de Claude, una decisión a la vez (§ 2). **Qué dice la página** está en el [brief](2026-10-17-pagina-publica-brief.md); **cómo se ve**, en el diseño de Claude Design («Wasmish Inicio v3 - Calma con vida»), que vive en la carpeta comercial privada de Jonathan, no en este repo. Este documento dice **dónde vive, con qué se construye, cómo se publica y cómo se prueba**.

## 1. Qué es y por qué

Hoy `wasmish.com` redirige a la app. Wasmish empieza a venderse en frío a pequeños negocios de Quito y Guayaquil, y lo primero que hace quien recibe el mensaje es buscar Wasmish o abrir el enlace desde WhatsApp. Hace falta una página que diga qué es, cuánto cuesta en total y cómo pedir una demostración: el inicio y una página por nicho (`/capacitacion` e `/imprentas`), más Privacidad y Términos.

Lo que más importa técnicamente:
- **La vista previa del enlace en WhatsApp**: es lo primero que ve el prospecto.
- **Liviana con datos móviles**: casi todos la abren desde el celular.
- **Independiente del servidor de la app**, que va a cambiar de máquina cuando haya clientes que paguen.

## 2. Decisiones (Jonathan, 2026-10-17)

| Decisión | Por qué |
|---|---|
| **Se aloja en Cloudflare Pages**, gratis | La página son archivos estáticos: no necesita servidor, y así no hay que moverla cuando se migre la app. Permite uso comercial (GitHub Pages no). Se descartaron la EC2 de otro proyecto de Jonathan (vence la capa gratuita y ata la página a ese servidor) y el servidor actual (es temporal). |
| **React 19 + Vite + Tailwind v4, con pre-renderizado** | Lo que Jonathan conoce, igual que la app. Como WhatsApp y Google leen el HTML sin ejecutar JavaScript, cada página se genera completa al compilar (§ 4). Se descartaron Astro (nuevo para Jonathan) y el HTML a mano (cada nicho sería una copia). |
| **El código en `Site/`**, en la raíz del repo | Un tercer espacio de trabajo junto a `Backend/` y `Frontend/`, con su propio `package.json`: mismos PR, revisión cruzada y CI, sin compartir peso ni código con la app. |
| **Medición sin cookies**: el texto del botón dice de qué página viene, y Cloudflare Web Analytics cuenta las visitas | El experimento de ventas compara nichos. Sin cookies no hace falta cartel de consentimiento y la política de privacidad sigue siendo cierta. |
| **Se publica sola al unir un PR que toca `Site/`**, con una vista previa por PR | Publica Jonathan al unir; ningún agente publica. La vista previa sirve para revisar en el celular antes de unir. |

## 3. Arquitectura

```
Site/
  package.json            React, Vite, Tailwind (mismas versiones que Frontend)
  index.html              plantilla: <!--head--> y <!--app--> se reemplazan al pre-renderizar
  public/                 logo, favicon, fuentes, imágenes de vista previa (og-*.png), _headers
  src/
    routes.ts             la lista de páginas: ruta, archivo de salida, etiquetas, si hidrata
    nichos/               un archivo por página de venta: inicio.ts, capacitacion.ts, imprentas.ts
    legal/                privacidad.md y terminos.md
    pages/                VentaPage (el molde de inicio y nichos), LegalPage, NotFoundPage
    components/           secciones de la página y las imitaciones de la app (chat, ficha, «Probar»)
    entry-client.tsx      hidrata la página que corresponde a la ruta
    entry-server.tsx      render(ruta) → { html, head }
  scripts/
    prerender.mjs         genera el HTML de cada página, sitemap.xml y robots.txt
    og.mjs                genera las imágenes de vista previa (se corre a mano)
  tests/                  revisan el HTML generado (§ 8)
```

- **Las páginas:** `/` (inicio), `/capacitacion`, `/imprentas`, `/privacidad`, `/terminos` y la 404.
- **Los nichos son datos, no copias.** `VentaPage` es un solo molde, y cada archivo de `nichos/` tiene los textos de su página: titular, el problema, la conversación de ejemplo, las frases del «antes y después», las respuestas del bot para «Probar», el texto prellenado del botón y sus etiquetas para WhatsApp y Google. **Agregar un nicho** es crear un archivo y sumarlo a `routes.ts`. El inicio es un nicho más.
- **Privacidad y Términos en Markdown**: se convierten en HTML al pre-renderizar (`marked`, solo de desarrollo) y **no cargan JavaScript**.
- **Las pantallas de la app no son capturas**: son componentes que imitan la app (el chat, la ficha del contacto, «Probar»), como en el diseño. Pesan menos, se ven nítidos y se animan. Siempre con datos de ejemplo y **solo lo que la app hace hoy** (brief, § 5).
- **Fuentes propias**: Inter y JetBrains Mono, con `@fontsource`, servidas desde la misma página. Más rápido y sin terceros (la app las carga de Google; la página no).
- **Movimiento** con CSS y lo mínimo de JavaScript. Con `prefers-reduced-motion`, todo queda quieto y se lee igual.
- **De la app solo se copian los tokens de la marca** (de `Frontend/src/App.css`, con un comentario que dice de dónde vienen y que, si cambian allí, se cambian aquí), el logo y el favicon. **«Iniciar sesión»** lleva a `https://app.wasmish.com/login`.

## 4. Pre-renderizado

La compilación (`npm run build`) hace tres pasos:
1. `vite build`: el JavaScript y el CSS del navegador, con huella en el nombre.
2. `vite build --ssr src/entry-server.tsx`: el mismo código, para Node.
3. `node scripts/prerender.mjs`: para cada página de `routes.ts`, `render(ruta)` con `renderToString`, y escribe el HTML con su `<head>` ya completo. También escribe `sitemap.xml` y `robots.txt` con la misma lista.

**Archivos de salida:** `index.html` para el inicio, y `capacitacion.html`, `imprentas.html`, `privacidad.html` y `terminos.html` para las demás. Cloudflare Pages sirve cada una **sin `.html` ni barra final** (`/imprentas`), y esa es la dirección canónica. La 404 se escribe en **`404.html`**: sin ese archivo, Cloudflare trataría el sitio como una SPA y respondería 200 con el inicio a cualquier ruta.

**En el navegador**, `entry-client.tsx` hidrata con `hydrateRoot` la página que corresponde a `location.pathname`. Las páginas legales y la 404 no llevan el script.

## 5. Vista previa en WhatsApp y SEO

**En el `<head>` de cada página**, desde `routes.ts`:
- `<title>` y `<meta name="description">` propios, en español de Ecuador. Los textos salen del brief y Jonathan los revisa en el PR.
- `<link rel="canonical">` con la dirección completa.
- `og:title`, `og:description`, `og:image`, `og:url`, `og:type` (`website`), `og:locale` (`es_EC`) y `og:site_name`, más `twitter:card` (`summary_large_image`). **Todas las direcciones van completas** (`https://wasmish.com/...`): WhatsApp no entiende las relativas.
- `<html lang="es-EC">`.

**Imágenes de vista previa:** una de 1200 × 630 por página de venta (inicio, capacitación e imprentas); Privacidad y Términos usan la del inicio. Las genera `scripts/og.mjs` (una plantilla HTML fotografiada con `playwright-core` y el Chrome del sistema, como en las pruebas de la app; no descarga navegadores) a partir del diseño «og2», y se guardan en `public/` como PNG de **menos de 300 KB**. **WhatsApp guarda la vista previa** de un enlace un tiempo: si cambia una imagen, cambia también su nombre (`og-inicio-2.png`).

**Para Google:**
- `sitemap.xml` con las cinco páginas (no la 404) y `robots.txt` que lo indica. La 404 lleva `noindex`.
- **Datos estructurados (JSON-LD)** en el inicio: `Organization` (nombre, dirección, logo, contacto) y `SoftwareApplication`, con la oferta (USD 30 al mes, y la de fundador). El precio sale del mismo dato que muestra la página, para que nunca se contradigan.
- **Velocidad:** la meta es **90 o más en PageSpeed, en celular**.
- **Google Search Console:** lo conecta Jonathan con un registro TXT en el DNS de Cloudflare y le da el sitemap.

## 6. Publicación, DNS y correo

### Cloudflare Pages

Un proyecto conectado al repo de GitHub, una sola vez, desde el panel de Cloudflare. **No se guardan claves en GitHub**: el CI sigue sin secretos.

| Ajuste | Valor |
|---|---|
| Rama de producción | `master` |
| Carpeta raíz | `Site` |
| Comando | `npm ci && npm run build` |
| Carpeta de salida | `dist` |
| Variable | `NODE_VERSION=22` |
| Rutas que disparan una compilación | `Site/*` |

- **Cada PR que toca `Site/` tiene su vista previa** en una dirección `*.pages.dev`.
- **`public/_headers`:**
  - caché de un año para `/assets/*` (con huella);
  - `no-cache` para el HTML, para que un cambio de texto se vea enseguida;
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `Content-Security-Policy: frame-ancestors 'none'`;
  - `X-Robots-Tag: noindex` para los hosts `*.pages.dev`, para que Google no indexe las vistas previas ni la dirección interna.
- **Hasta el lanzamiento, la página vive solo en `*.pages.dev`**: el dominio se conecta en el PR del lanzamiento (§ 7).

### El DNS de `wasmish.com` pasa a Cloudflare (Jonathan, antes de programar)

Se puede hacer ya: copiando los registros tal como están, **nada cambia** para la app ni para `wasmish.com`, que sigue en el servidor con su 302 a la app.

1. **Crear la cuenta de Cloudflare** (plan Free) y **agregar el dominio `wasmish.com`**. Cloudflare lee los registros que hay en Namecheap.
2. **Revisar los registros** antes de seguir. Tienen que estar los tres A (`@`, `www` y `app`) apuntando a la IP del servidor, **todos en «solo DNS» (nube gris)**. Con la nube naranja, Cloudflare se pondría en medio: el certificado de Traefik y el tiempo real de la app podrían fallar.
3. Si en Namecheap está activo **DNSSEC**, apagarlo antes del paso 4.
4. **En Namecheap** (*Domain List* → *Manage* → *Nameservers* → *Custom DNS*), poner los dos *nameservers* que da Cloudflare. El dominio sigue registrado en Namecheap y a nombre de Jonathan. El cambio tarda de minutos a unas horas.
5. **Comprobar,** cuando Cloudflare diga «Active»:
   - `https://app.wasmish.com/api/version` responde;
   - `https://wasmish.com` sigue llevando a la app;
   - la app abre en el celular y el tiempo real funciona.
6. **El correo** (*Email Routing*): activarlo, verificar el Gmail de Jonathan como destino y crear la regla `hola@wasmish.com` → ese Gmail. Cloudflare agrega solo los registros MX y SPF. **Solo recibe**: se responde desde el Gmail. Responder como `hola@wasmish.com` necesita un servicio de envío y queda para después.

`wasmish.solventyc.com` es otro dominio y no se toca: el webhook de Meta y la API pública siguen igual.

### En el servidor, al lanzar

Un PR quita del `deploy/compose.yml` los routers de `wasmish.com` y `www.wasmish.com` (y esos dos hosts de la regla del router HTTP), y actualiza `deploy/README.md § Dominios`. Sin esto, Traefik seguiría intentando renovar unos certificados de dominios que ya no recibe, y el log se llenaría de errores. **Sale con el siguiente despliegue de la app**, y antes de ese despliegue nada se rompe.

## 7. Orden de trabajo

Cada PR, con la revisión cruzada de Codex. Si uno pasa de unas 500 líneas, se parte.

1. **Este spec, el brief y el plan** (solo documentos). El plan lo revisa Codex antes de empezar a programar.
2. **El esqueleto de `Site/`**:
   - el pre-renderizado, el `<head>` de cada página, el sitemap, `robots.txt` y `_headers`;
   - Privacidad y Términos con los borradores, con los huecos marcados;
   - la 404, la tarea `Site` en el CI y los tests del § 8;
   - **Jonathan conecta Cloudflare Pages**: desde aquí, cada PR tiene su vista previa.
3. **El inicio**, según el diseño v3.
4. **Las páginas de nicho** y las imágenes de vista previa.
5. **El lanzamiento:**
   - el chequeo de huecos pasa (§ 8);
   - Jonathan conecta `wasmish.com` al proyecto de Pages; `www` pasa a «con proxy» (nube naranja: sin proxy, la regla no actúa) y redirige a `wasmish.com` con una regla de Cloudflare (301, con la ruta y los parámetros). `app` sigue en «solo DNS». La redirección se comprueba antes de quitar los routers del servidor;
   - el PR del § 6 («En el servidor»);
   - la documentación: `docs/arquitectura/pagina-publica.md` en el mapa de `AGENTS.md`, y `docs/estado.md`.

**La regla de `master`** pide que pasen los trabajos del CI: Jonathan suma el trabajo nuevo, `Site · lint, build y tests`, a la regla (*Settings → Rules → Rulesets*) cuando exista, en el PR 2.

## 8. Pruebas

**En el CI** (trabajo `Site`, Node 22): `npm ci`, `npm run lint`, `npm run build` y `npm test`. Los tests (`node:test`) leen la carpeta `dist` ya generada y comprueban que:
- cada página de `routes.ts` existe, con `lang="es-EC"`, `<title>`, descripción, `canonical` y `og:image`, todos con direcciones completas en `https://wasmish.com`;
- cada `og:image` existe en `public/` y pesa menos de 300 KB;
- `sitemap.xml` lista las páginas y no la 404, y `404.html` lleva `noindex`;
- el texto prellenado del botón de cada página de venta dice su nicho;
- **el chequeo de huecos**: ninguna página contiene la marca de contenido pendiente (el atributo `data-pending`, que el diseño muestra como la etiqueta «pendiente»). Hasta el lanzamiento solo avisa; **desde el PR 5 hace fallar el CI**, para que nunca se publique un hueco.

**En el navegador**, en cada PR con cambios visibles: capturas de cada página en celular (390 px) y en computadora, también con `prefers-reduced-motion`, y la vista previa de Pages abierta en un celular de verdad.

**Antes de lanzar:**
- PageSpeed de 90 o más en celular;
- la vista previa en WhatsApp de verdad: Jonathan se manda los tres enlaces;
- después de conectar el dominio, que `app.wasmish.com`, el webhook (`POST` entrantes en los logs) y `POST /api/v1/templates/send` siguen respondiendo.

## 9. Lo que bloquea publicar (no programar)

Se construye todo con los huecos marcados (`data-pending`). No se lanza hasta llenarlos:
- el número de WhatsApp del botón;
- quién factura (nombre y RUC) y si el precio lleva IVA;
- Privacidad y Términos revisados por un abogado o contador;
- las tarifas de Meta, confirmadas en la información oficial.

## 10. Fuera de alcance

Blog, versión en inglés, chat en vivo, pago en línea, registro por cuenta propia (brief, § 7), responder correos como `hola@wasmish.com`, analítica con cookies, y la migración del servidor de la app.
