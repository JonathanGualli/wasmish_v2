# Pantallas de carga (skeletons): plan de implementación

> Se ejecuta **nativo** (rama, PR y revisión cruzada, ver `AGENTS.md` § Planes). Los pasos usan casillas (`- [ ]`).

**Objetivo:** cambiar los «Cargando…», los círculos que giran y las páginas en blanco por skeletons con la forma de lo que va a llegar, con un solo lenguaje para toda la app.

**Arquitectura:**
- **Piezas comunes en `components/Skeleton/`:** los bloques (cada uno late y se oculta al lector), una fila de lista, el marco que anuncia la carga y sincroniza el pulso, y un hook que decide cuándo se ve el skeleton (300 ms de espera, 400 ms mínimos).
- **Contrato de cada pantalla:** `const { pending, visible } = useDelayedLoading(isLoading)`. Mientras `pending`, se pinta su skeleton con `visible`, aunque `isLoading` ya sea `false` (los 400 ms mínimos). El contenido real, solo con `!pending`. Todo skeleton recibe `visible: boolean`.
- **La tabla compartida (`DataTable`)** pinta su skeleton según lo que cada columna declara en `meta.skeleton`. Al recargar, atenúa las filas.
- **Cada pantalla** tiene su skeleton junto a su código y reutiliza las piezas comunes.

**Tecnologías:** React 19, TypeScript, Tailwind v4 (`@theme` en `App.css`), TanStack Table (`ColumnMeta`), React Query.

**Diseño:** `Design/Wasmish Pantallas de carga.html` (Claude Design), que responde al brief `docs/superpowers/specs/2026-10-15-skeletons-brief-ui.md`. Dentro del archivo, la plantilla está en la línea 382 (JSON) y los datos de cada pantalla en su script `text/x-dc`.

## Reglas globales (copiadas del diseño)

- **Lo que no depende de los datos se ve desde el primer momento:** títulos, buscador, filtros, botones y cabeceras. Lo que falta se sustituye por bloques con la medida de lo que va a llegar, y cuando llega no se mueve nada.
- **Tiempo:**
  - de **0 a 300 ms** no se muestra nada nuevo (si los datos llegan antes, no hubo carga);
  - pasados **300 ms**, aparece el skeleton;
  - una vez visible, se queda **al menos 400 ms**.
- **Pulso:** opacidad de 100 a 50 % y vuelta en **1,6 s**, `ease-in-out`, **todos los bloques a la vez** y sin brillo que recorra.
- **Reducir movimiento:** los bloques quedan quietos y la barra de recarga queda fija.
- **Lector de pantalla:**
  - la zona que carga lleva `role="status"` y `aria-busy`, con un texto oculto que dice qué carga;
  - los bloques se ocultan al lector;
  - al terminar se anuncia el resultado («248 contactos») o el error.
- **Después de cargar, nada cambia:** el estado vacío y el error de siempre. Las esperas de una acción («Enviando…», «Activando…», el progreso) se quedan como están.
- **Bloques:**

  | Bloque | Alto | Radio | Color |
  |---|---|---|---|
  | Texto principal | 10 px | 5 px | `#eef1f4` |
  | Texto secundario | 8 px | 4 px | `#f1f3f5` |
  | Píldora | 20 px | 10 px | `#f1f3f5` |
  | Cifra | 12 px | 4 px | `#eef1f4` |
  | Burbuja ajena | según el patrón | `12 12 12 3` | `#e6eaee` |
  | Burbuja propia | según el patrón | `12 12 3 12` | `#d7e5de` |

  El avatar tiene el mismo tamaño y radio que el real. Sobre la barra oscura, los bloques van en `#17503f`.
- **Recargar una tabla** (pasar de página, filtrar, buscar o «Sincronizar»):
  - las filas visibles se mantienen al **50 %** de opacidad y sin poder tocarlas;
  - bajo la cabecera, una **barra de 2 px**: el fondo `#d6f8e7` y un tramo del 30 % en `#1c8560` que va de `translateX(-100%)` a `translateX(340%)` en **1,4 s**, `ease-in-out`;
  - en el pie, «Cargando…» en `brand-accent-strong`.
- **Primera carga de una tabla:** **9 filas**.
- **Marca:** tokens, nunca colores sueltos (skill `brand-guidelines`).

## Decisiones (para que las revise Jonathan)

1. **Tres colores del diseño no existen como token.** Entran en `App.css` como `--color-brand-skeleton-soft: #f1f3f5`, `--color-brand-skeleton-bubble: #e6eaee` y `--color-brand-skeleton-bubble-own: #d7e5de`.
   - El bloque principal es `brand-raised` (`#eef1f4`).
   - Sobre la barra oscura van `brand-deep-active` y `brand-deep-hover`.
   - Dentro del bloque de identidad, `brand-deep` en lugar de `#0f3d30`, que es casi igual.
2. **El diseño dibuja cosas que la app no tiene.** No se añaden, porque el skeleton sigue la pantalla real:
   - filtros en Plantillas, Campañas y Admin;
   - «Nueva plantilla»;
   - el contador «248 contactos» junto a los filtros;
   - Ajustes a dos columnas;
   - otras columnas y otras etiquetas de cifras.
3. **El detalle de campaña no muestra los filtros de destinatarios** mientras carga. Los reales llevan la cuenta de cada estado y no existen hasta tener la campaña. Las cifras usan las 6 etiquetas fijas reales: Destinatarios, Enviados, Entregados, Leídos, Fallidos y Omitidos.
4. **Anunciar el resultado al terminar** se hace en las tablas (`resultLabel`, p. ej. «248 contactos»). En el resto se anuncia la carga, y el error ya se ve en pantalla.
5. **La ficha en Contactos** (la vista y la edición) no la dibuja el diseño aparte. Sigue sus estructuras reales: `ContactDetails` y `ContactForm`. Comparte los bloques con la de Chats, no el componente.
6. **Las filas del skeleton de la tabla miden lo mismo que las reales:** las mismas clases de celda (`px-4 py-3.5`), no los 56 px del diseño. Así el pie no salta al llegar los datos.
7. **Al recargar, las filas atenuadas no se pueden usar ni con el teclado** (`inert`), no solo con el ratón (revisión de Codex del plan).

## Por dónde puede fallar (y qué prueba lo cubre)

1. **Datos en caché o una respuesta en menos de 300 ms:** no puede aparecer ningún skeleton, ni un instante. Se prueba en las tareas 2 y 4.
2. **Una respuesta a los 350 ms:** el skeleton aparece y se queda al menos 400 ms. No puede parpadear. Tarea 2.
3. **Recargar una tabla que termina vacía o en error:** se pasa de las filas atenuadas al estado vacío o al error, nunca a «No se encontraron registros.» durante la carga. Tarea 2.
4. **Con «reducir movimiento»:** ningún bloque se anima y la barra queda quieta. Tarea 2.
5. **Una tabla con casillas de selección (Contactos), en un teléfono de 390 px:** el skeleton respeta la columna de la casilla y no aparece desplazamiento horizontal. Tarea 2.
6. **Fuera de las tablas, las mismas esperas:** con 50 ms no sale ningún skeleton, y con 350 ms se ve al menos 400 ms. Cada tarea de la 3 a la 8 lo prueba.

**Cómo se verifica:** el frontend no tiene tests. Cada tarea termina con `npm run lint` y `npm run build` (los dos sin errores) y con una prueba en el navegador. La prueba se hace con Playwright en el scratchpad, contra un backend y un Vite aparte (puertos 3999 y 5999, como en `pruebas-y-scripts.md` § Probar la UI en el navegador), con `page.route` retrasando la respuesta de la API que toque (`setTimeout(() => route.continue(), ms)`), en 1280 px y en 390 px con `isMobile`. Las comprobaciones dicen qué tiene que salir.

---

## PR 1 · `skeletons-base`: las piezas y las tablas

### Tarea 1: piezas comunes

**Archivos:**
- Modificar: `Frontend/src/App.css` (tokens y animaciones en `@theme`)
- Crear: `Frontend/src/hooks/useDelayedLoading.ts`
- Crear: `Frontend/src/components/Skeleton/Skeleton.tsx`
- Crear: `Frontend/src/components/Skeleton/SkeletonFrame.tsx`
- Crear: `Frontend/src/components/Skeleton/SkeletonListRow.tsx`

**Interfaces:**
- **Produce, en `App.css`:**
  - los tokens `brand-skeleton-soft`, `brand-skeleton-bubble` y `brand-skeleton-bubble-own`;
  - `--animate-skeleton-pulse: skeleton-pulse 1.6s ease-in-out infinite` (keyframes de opacidad 1 → 0.5 → 1);
  - `--animate-loading-bar: loading-bar 1.4s ease-in-out infinite` (de `translateX(-100%)` a `translateX(340%)`).
- **Produce, en `hooks/useDelayedLoading.ts`:**
  - `SKELETON_DELAY_MS = 300` y `SKELETON_MIN_VISIBLE_MS = 400`;
  - `useDelayedLoading(isLoading: boolean): { pending: boolean; visible: boolean }`.
    - `pending` sigue en `true` mientras se carga y durante los 400 ms mínimos.
    - `visible` pasa a `true` a los 300 ms.
    - Si la carga acaba antes de los 300 ms, los dos vuelven a `false` sin haber pasado por `visible`.
- **Produce, en `Skeleton.tsx`:**
  - `SkeletonLine({ width, soft?, className? })`: el texto principal (10 px) o, con `soft`, el secundario (8 px);
  - `SkeletonPill({ width })`;
  - `SkeletonNumber({ width })`;
  - `SkeletonBox({ className })`, para avatares, burbujas y cajas: el tamaño y el radio vienen en la clase;
  - `skeletonWidth(index: number, offset?: number, extra?: number): string`, un porcentaje sacado de la serie del diseño `[58, 44, 66, 50, 38, 62, 47, 55, 41, 69]`, en `(index + offset) % 10`, más `extra`.

  Todos llevan `aria-hidden` y `motion-safe:animate-skeleton-pulse`.
- **Produce, en `SkeletonFrame.tsx`:**
  - `SkeletonStatus({ label })`: un `<span role="status" aria-busy="true" className="sr-only">` con el texto;
  - `SkeletonFrame({ label, visible, className?, children })`: un `div` con el `SkeletonStatus` y los hijos.
    - Queda `invisible` mientras `!visible`: guarda el sitio sin enseñar nada.
    - **No anima ni oculta nada él mismo:** dentro puede ir texto real (el enlace «Campañas», las etiquetas de las cifras), que se sigue leyendo.
    - Al montarse y al pasar a `visible`, pone `startTime = 0` a las animaciones de su subárbol (`getAnimations({ subtree: true })`), para que todos los bloques, también los de otras zonas montadas antes, laten a la vez.
  - **El pulso va en cada bloque** (`motion-safe:animate-skeleton-pulse` en `Skeleton.tsx`), nunca en un contenedor. Así no se multiplica la opacidad al anidar, por ejemplo la tabla dentro del detalle de campaña.
- **Produce, en `SkeletonListRow.tsx`:** `SkeletonListRow({ index, avatar?: string, trailing?: 'time' | 'pill', pills?: number, lineTag?: boolean, className? })`, más `AVATAR_SM = 'w-[34px] h-[34px] rounded-[9px]'` y `AVATAR_LG = 'w-10 h-10 rounded-[10px]'`.
  - Es la fila de lista de todo el diseño: el avatar, cuyas clases de tamaño y radio llegan en `avatar` (sin él, no hay avatar), dos líneas, la hora o una píldora a la derecha, `pills` píldoras debajo y, con `lineTag`, el hueco de la etiqueta de línea (7 × 70 px).
  - La bandeja le pasa sus propias medidas de avatar (38 y 46 px).
  - Las medidas de cada pantalla vienen en `className` (el `padding`, el borde).

- [ ] **Paso 1:** los tokens y las dos animaciones en `App.css`, con un comentario de una línea que diga de dónde salen (el diseño de pantallas de carga).
- [ ] **Paso 2:** `useDelayedLoading`, con los dos temporizadores limpiados en el `return` del efecto.
- [ ] **Paso 3:** `Skeleton.tsx`, `SkeletonFrame.tsx` y `SkeletonListRow.tsx`, con las medidas de las reglas globales. Además, `SkeletonField({ label })` en `Skeleton.tsx`: la etiqueta real (13 px, 600, `brand-strong`) y una caja de 42 px con radio 8, para los formularios.
- [ ] **Paso 4:** `cd Frontend && npm run lint && npm run build`. Tienen que salir sin errores.
- [ ] **Paso 5:** commit «Skeletons: las piezas comunes (bloques, fila, zona y espera de 300 ms)».

### Tarea 2: la tabla compartida

**Archivos:**
- Crear: `Frontend/src/components/DataTable/TableSkeleton.tsx`
- Modificar: `Frontend/src/components/DataTable/DataTable.tsx`
- Modificar: las columnas, `pages/private/Contacts/ContactColumns.tsx`, `pages/private/Templates/TemplateColumns.tsx`, `pages/private/Campaigns/CampaignColumns.tsx`, `pages/private/Campaigns/Detail/RecipientColumns.tsx` y `pages/private/Admin/AdminColumns.tsx`
- Modificar: las páginas que usan la tabla, `ContactsPage`, `TemplatesPage`, `CampaignsPage`, `CampaignDetailPage` y `AdminPage`
- Modificar: `Frontend/src/hooks/useTemplates.ts`. El `onSuccess` de la sincronización **devuelve** la promesa de `invalidateQueries`, así `isSyncing` dura hasta que llega la lista nueva. Si no, las filas dejaban de estar atenuadas antes de tiempo (revisión de Codex del plan).
- Modificar: `AdminPage`, que pasa `isLoading={clientsLoading || clientsPlaceholder}` (`isPlaceholderData` de `useAdminClients`, que usa `keepPreviousData`).

**Interfaces:**
- **Consume:** todo lo de la tarea 1.
- **Produce:**
  - la ampliación de `ColumnMeta` de `@tanstack/react-table` con `skeleton?: CellSkeleton`, donde `type CellSkeleton = 'avatar' | 'title' | 'line' | 'pill' | 'number' | 'none'`. Va exportado desde `TableSkeleton.tsx`, y una columna sin `meta` cuenta como `'line'`;
  - las props nuevas de `DataTable`:
    - `loadingLabel: string`, obligatoria;
    - `resultLabel?: (total: number) => string`;
    - `mobileSkeleton?: Omit<SkeletonListRowProps, 'index'>`.

**Comportamiento de `DataTable`** (con `const { pending, visible } = useDelayedLoading(isLoading)`):
- **Sin filas y `pending`:** 9 filas de skeleton dentro de un `SkeletonFrame` con `loadingLabel` y `visible`. En el escritorio, una celda por columna según su `meta.skeleton`, con **las mismas clases de celda que la fila real** (decisión 6); con selección, una primera celda vacía. En el móvil, con `renderMobileRow`, 9 `SkeletonListRow` con `mobileSkeleton`. Nunca «No se encontraron registros.».
- **Con filas y `pending`:** las filas al 50 % (`opacity-50`) e **`inert`** (el `tbody` y la lista del móvil), y la barra de recarga bajo la cabecera. Fija con `motion-reduce` y animada con `motion-safe:animate-loading-bar`. «Cargando…» en el pie, junto al total, y el texto oculto «Cargando la página N».
- **Sin `pending`:** las filas, o el vacío de siempre. Si hay `resultLabel`, un `<span role="status" className="sr-only">` dice `resultLabel(totalCount)`, solo después de una carga.
- **Se quita** el velo con el círculo que gira («Cargando datos…»).

**`meta.skeleton` de cada columna:**
- **Contactos:** contacto `avatar`, empresa `line`, etiquetas `pill`, última `line`, estado `pill`.
- **Plantillas:** nombre `title`, ID `line`, cuerpo `title`, cabecera `line`, idioma `line`, estado `pill`, «Se envía desde» `pill`.
- **Campañas:** línea `pill`, campaña `title`, fecha `line`, estado `pill`, progreso `line`, resultados `line`.
- **Destinatarios:** contacto `avatar`, estado `pill`, hora `line`, la última (sin título) `none`.
- **Admin:** cliente `title`, WhatsApp `pill`; líneas, usuarios, convs, mensajes y fallidos `number`; última actividad `line`, alta `line`.

**Props de cada página:**

| Página | `loadingLabel` | `resultLabel` | `mobileSkeleton` |
|---|---|---|---|
| Contactos | `'Cargando contactos'` | `n => pluralize(n, 'contacto', 'contactos')` (de `utils/campaignDisplay.ts`), con la cifra delante | `{ avatar: AVATAR_LG, trailing: 'time', pills: 1 }` |
| Plantillas | `'Cargando plantillas'` | (no) | (no) |
| Campañas | `'Cargando campañas'` | (no) | `{ trailing: 'time', pills: 2 }` |
| Destinatarios | `'Cargando destinatarios'` | (no) | `{ avatar: AVATAR_LG, trailing: 'time', pills: 1 }` |
| Admin | `'Cargando clientes'` | (no) | (no) |

- [ ] **Paso 1:** `TableSkeleton.tsx`, con `TableSkeletonRows({ columns, hasSelection, rowCount = 9 })`, `TableLoadingBar()` y la ampliación de `ColumnMeta`. Cada celda: `avatar` es un `SkeletonBox` con `AVATAR_SM` y dos `SkeletonLine`; `title`, dos `SkeletonLine`; `line`, una; `pill`, un `SkeletonPill`; `number`, un `SkeletonNumber`. Los anchos salen de `skeletonWidth(fila, columna)`. La clase de la celda es una constante compartida con la fila real (`CELL_CLASS`), para que no se separen.
- [ ] **Paso 2:** `DataTable` con el comportamiento de arriba.
- [ ] **Paso 3:** `meta.skeleton` en las cinco columnas, las props en las cinco páginas, `useTemplates` y el `isPlaceholderData` de Admin.
- [ ] **Paso 4:** `cd Frontend && npm run lint && npm run build`. Tienen que salir sin errores.
- [ ] **Paso 5: en el navegador**, Contactos con `/api/contacts` retrasada:
  - **a.** Con 1500 ms, en 1280 px: a los 200 ms no hay ningún `[role=status][aria-busy=true]` visible. A los 500 ms hay uno con «Cargando contactos», 9 filas de skeleton y ningún «Cargando datos…» ni «No se encontraron registros.».
  - **b.** Con 50 ms: un `MutationObserver` no registra ninguna zona `aria-busy` visible en ningún momento.
  - **c.** Con 350 ms: el skeleton se ve al menos 400 ms (se mide del primer al último cuadro visible).
  - **d.** Pasar a la página 2 con 1500 ms: las filas de la página 1 al 50 %, la barra presente y «Cargando…» en el pie. Al llegar, el `status` dice «N contactos».
  - **e.** Un filtro que devuelve 0: se pasa de las filas atenuadas al estado vacío, sin «No se encontraron registros.».
  - **e2.** Durante la recarga de la página 2, Tab no llega a ninguna casilla ni fila de la tabla (`document.activeElement` fuera del `tbody`), en escritorio y en el móvil.
  - **e3.** La posición del pie de la tabla (`getBoundingClientRect().top`) es la misma con el skeleton que con las 9 primeras filas reales (±2 px).
  - **e4.** Plantillas: «Sincronizar» con `/api/templates` (el GET de después) retrasado 1500 ms. Las filas siguen atenuadas hasta que llega.
  - **e5.** Admin: pasar a la página 2 con 1500 ms atenúa las filas.
  - **f.** Con `reducedMotion: 'reduce'`: `getAnimations().length === 0` en la zona y en la barra.
  - **g.** En 390 px con `isMobile`, Contactos con la selección activa: 9 `SkeletonListRow` y `scrollWidth === 390`.
  - **h.** Plantillas, Campañas y Admin, primera carga: el skeleton con sus columnas (captura de cada una).
- [ ] **Paso 6:** documentación.
  - `docs/arquitectura/frontend.md`, una sección «Pantallas de carga» con las reglas, `useDelayedLoading`, el contrato de cada pantalla, `SkeletonFrame` y `meta.skeleton`.
  - `Frontend/AGENTS.md`, las piezas nuevas en «Componentes compartidos».
  - `.agents/skills/brand-guidelines/SKILL.md`, una sección «Skeletons» con los bloques y los tokens.
  - En el índice de `frontend.md`, la sección nueva.
- [ ] **Paso 7:** commit «Tablas: skeleton en la primera carga y filas atenuadas al recargar».

---

## PR 2 · `skeletons-chats`: entrar a la app y Chats

### Tarea 3: entrar a la app

**Archivos:**
- Crear: `Frontend/src/components/Skeleton/AppBootSkeleton.tsx`
- Modificar: `Frontend/src/guard/PrivateGuard.tsx` (sustituye el «Cargando...» con `text-gray-500`)

**Interfaces:**
- **Consume:** la tarea 1 y `LogoLockup` (`components/Logo/Logo`).
- **Produce:** `AppBootSkeleton({ visible }: { visible: boolean })`.

**Qué pinta:**
- Un `SkeletonFrame` con `label="Cargando Wasmish"` a todo el alto (`h-dvh`).
- **Desde 768 px:**
  - **La barra:** `bg-brand-deep`, de 236 px desde 1180 px y de 76 px por debajo, como `PrivateLayout`.
  - **Arriba**, el `LogoLockup onDeep` real (solo el símbolo si está colapsada).
  - **Los 6 accesos:** cuadro de 18 px y una línea de `[64, 52, 70, 66, 74, 90]` px en `brand-deep-active`, sin texto.
  - **Abajo:** el divisor, un acceso y el bloque de identidad `bg-brand-ink`, con su avatar de 30 px en `brand-deep-hover` y dos líneas.
  - **La página:** sello de 44 px, título 14 × 180 px, bajada 9 × 300 px y una tarjeta con la cabecera en `brand-bg` y 9 filas de avatar y dos líneas.
- **En el móvil:** la cabecera de 56 px con el icono `Menu` y el `LogoLockup size="sm"`, y 9 `SkeletonListRow` con `avatar: AVATAR_LG` y `trailing: 'time'`.
- `PrivateGuard` sigue el contrato: con `useDelayedLoading(isLoading)`, mientras `pending` pinta `AppBootSkeleton visible={visible}`, y solo después decide entre el login y la app.

- [ ] **Paso 1:** `AppBootSkeleton` y el cambio en `PrivateGuard`.
- [ ] **Paso 2:** `npm run lint && npm run build`. Tienen que salir sin errores.
- [ ] **Paso 3: en el navegador**, `/api/verify` retrasada 1500 ms: en 1280 px, en 1000 px (barra de 76 px) y en 390 px, el skeleton según lo descrito, y después la app. Con 50 ms no sale ningún skeleton; con 350 ms se ve al menos 400 ms.
- [ ] **Paso 4:** commit «Entrar a la app: el marco de Wasmish en lugar de «Cargando...»».

### Tarea 4: la bandeja y el hilo

**Archivos:**
- Crear: `Frontend/src/components/Chat/ChatSkeletons.tsx`
- Modificar: `Frontend/src/components/Chat/ConversationList.tsx` (el `CenteredState` de «Cargando conversaciones…»)
- Modificar: `Frontend/src/components/Chat/ChatThread.tsx` (el `CenteredMessage` de «Cargando mensajes…»)

**Interfaces:**
- **Consume:** la tarea 1 y `useLines().showLines`.
- **Produce:** `ConversationListSkeleton({ visible })` y `ThreadSkeleton({ visible })`.

**Qué pinta cada uno:**
- **`ConversationListSkeleton`:** 10 filas con las medidas de la fila real (`px-[18px] py-3.5`, el avatar de 38 px con radio 10, y de 46 px con radio 12 en el móvil), la hora y `lineTag` cuando `showLines`. Su `label` es «Cargando conversaciones».
- **`ThreadSkeleton`:** el patrón del diseño, de arriba abajo, en el lienzo `brand-bg`:
  - fecha;
  - ajena 46 % (máx. 64 %) × 58 px;
  - propia 52 % (72 %) × 80 px;
  - fecha;
  - propia 48 % (68 %) × 80 px;
  - ajena 40 % (58 %) × 58 px;
  - ajena 24 % (36 %) × 38 px.

  La fecha es una píldora de 64 × 22 px. Su `label` es «Cargando mensajes».
- **Lo que no cambia:** la cabecera y el cuadro de escribir del hilo, que ya se pintan mientras carga.

- [ ] **Paso 1:** `ChatSkeletons.tsx` y los dos cambios.
- [ ] **Paso 2:** `npm run lint && npm run build`. Tienen que salir sin errores.
- [ ] **Paso 3: en el navegador**, `/api/chats` y los mensajes retrasados 1500 ms: la bandeja y el hilo con su skeleton, en 1280 y en 390 px. Con la cuenta de cuatro líneas (`cliente-prueba-lineas`, si está sembrada), la fila reserva la etiqueta. Volver a una conversación ya abierta (en caché) no muestra skeleton. Con 50 ms ninguno sale, y con 350 ms se ven al menos 400 ms.
- [ ] **Paso 4:** commit «Chats: skeleton en la bandeja y en el hilo».

### Tarea 5: la ficha del contacto

**Archivos:**
- Crear: `Frontend/src/components/Chat/ContactSidebar/ContactSidebarSkeleton.tsx`
- Modificar: `Frontend/src/components/Chat/ContactSidebar/ContactSidebar.tsx`
- Crear: `Frontend/src/pages/private/Contacts/ContactPanelSkeletons.tsx`
- Modificar: `Frontend/src/pages/private/Contacts/ContactPanel.tsx` (`ContactView` y `EditContact`)

**Interfaces:**
- **Consume:** la tarea 1 (también `SkeletonField`) y `SidebarCard`.
- **Produce:** `ContactSidebarSkeleton({ visible })`, `ContactViewSkeleton({ visible })` y `ContactFormSkeleton({ visible })`.

**Qué pinta cada uno** (los títulos y etiquetas, siempre los reales):
- **`ContactSidebarSkeleton`** (Chats), el diseño 3.3: avatar de 48 px con radio 12 y dos líneas; las tarjetas reales (etiquetas, con 3 píldoras; notas, con dos cajas con borde de dos líneas cada una; datos, con «Empresa», «Origen»… y su bloque al lado). Con «Cargando la ficha del contacto».
- **`ContactViewSkeleton`** (Contactos, ver): la estructura de `ContactDetails`, que es la identidad (avatar y dos líneas), la fila de acciones (bloques del alto de los botones) y sus secciones con su `SectionLabel` real y bloques. Con «Cargando el contacto».
- **`ContactFormSkeleton`** (Contactos, editar): los campos de `ContactForm` como `SkeletonField` con su etiqueta real. Con «Cargando el contacto».

Los tres siguen el contrato del hook. La condición de carga es `!contact && !isError`.

- [ ] **Paso 1:** los tres componentes y los cambios.
- [ ] **Paso 2:** `npm run lint && npm run build`. Tienen que salir sin errores.
- [ ] **Paso 3: en el navegador**, `/api/contacts/:id` retrasada 1500 ms: la ficha en Chats (escritorio y pantalla completa en 390 px) y en Contactos (ver y editar). Al llegar, la identidad y la primera sección empiezan donde empezaba su bloque (±4 px). Con 50 y 350 ms, como en la tarea 4.
- [ ] **Paso 4:** commit «Ficha del contacto: skeleton en Chats y en Contactos».

**Al cerrar el PR 2:** `frontend.md` § Pantallas de carga, con la entrada, la bandeja, el hilo y la ficha.

---

## PR 3 · `skeletons-resto`: el detalle de campaña, Admin, Ajustes y los diálogos

### Tarea 6: el detalle de una campaña y las cifras de Admin

**Archivos:**
- Modificar: `Frontend/src/components/MetricGrid/MetricGrid.tsx`, añadiendo `MetricGridSkeleton`
- Crear: `Frontend/src/pages/private/Campaigns/Detail/CampaignDetailSkeleton.tsx`
- Modificar: `CampaignDetailPage.tsx` (sustituye `<div className="h-40" />`)
- Modificar: `AdminPage.tsx` (el `'—'` de `tile`)

**Interfaces:**
- **Consume:** las tareas 1 y 2.
- **Produce:**
  - `MetricGridSkeleton({ labels: string[]; columns: string })`: las etiquetas reales, una cifra de 22 px de alto y la nota como `SkeletonLine soft`;
  - `CampaignDetailSkeleton({ visible })`;
  - `StatTile` acepta un `value: ReactNode`.

**Qué pinta cada uno:**
- **`CampaignDetailSkeleton`:**
  - el enlace real «Campañas»;
  - el título, un bloque de 14 × 260 px, y su píldora;
  - a la derecha, dos bloques de 40 px de alto (112 y 140 px);
  - `MetricGridSkeleton` con las 6 etiquetas de la decisión 3 y las mismas `columns` que `CampaignMetrics`;
  - la `DataTable` de destinatarios con `data={[]}` e `isLoading`, que reutiliza la tarea 2.

  Todo en un `SkeletonFrame` con «Cargando la campaña». El enlace y las etiquetas de las cifras son texto real dentro del marco: se leen y se pueden usar. Solo los bloques se ocultan al lector, y el pulso, que va en cada bloque, no se multiplica con el de la tabla.
- **Admin:** con `statsLoading`, cada `StatTile` lleva un `SkeletonNumber` de 48 px de ancho y 28 px de alto, y un `SkeletonStatus` con «Cargando el panel de administración». Las etiquetas de las cifras se siguen leyendo.

- [ ] **Paso 1:** `MetricGridSkeleton`, `CampaignDetailSkeleton` y los cambios en las dos páginas.
- [ ] **Paso 2:** `npm run lint && npm run build`. Tienen que salir sin errores.
- [ ] **Paso 3: en el navegador**, `/api/campaigns/:id` y `/api/admin/stats` retrasadas 1500 ms: el detalle ya no sale en blanco, en 1280 y en 390 px, y las cifras de Admin son bloques. Ningún bloque baja del 50 % de opacidad (`getComputedStyle` de los bloques de la tabla, dentro del detalle). Con 50 y 350 ms, como en la tarea 4.
- [ ] **Paso 4:** commit «Detalle de campaña y Admin: skeleton en lugar de página en blanco y «—»».

### Tarea 7: Ajustes

**Archivos:**
- Crear: `Frontend/src/pages/private/Settings/SettingsListSkeleton.tsx`
- Modificar: `Lines/LinesCard.tsx`, `Team/TeamCard.tsx`, `ApiKeysCard.tsx` y `MyAccessCards.tsx` (sus «Cargando…»)

**Interfaces:**
- **Consume:** la tarea 1.
- **Produce:** `SettingsListSkeleton({ label: string; rows: number; avatar: string; pillBelow?: boolean; visible: boolean })`: filas con avatar de 34 px, dos líneas y una píldora a la derecha (o debajo, con `pillBelow`), dentro del borde y los separadores de la lista real.

**Cada tarjeta:**

| Tarjeta | `rows` | Avatar | `label` |
|---|---|---|---|
| Líneas | 2 | `AVATAR_SM` | «Cargando las líneas» |
| Equipo | 4 | `AVATAR_SM` | «Cargando el equipo» |
| API keys | 2 | 34 px con radio 8 | «Cargando las API keys» |
| Tus líneas | 3 | `AVATAR_SM`, `pillBelow` | «Cargando las líneas» |

El título, la explicación y el botón de cada tarjeta no cambian.

- [ ] **Paso 1:** el componente y los cuatro cambios.
- [ ] **Paso 2:** `npm run lint && npm run build`. Tienen que salir sin errores.
- [ ] **Paso 3: en el navegador**, las cuatro rutas retrasadas 1500 ms: como owner (Líneas, Equipo y API keys) y como agente (Tus líneas, con un miembro de `seedMember` o la cuenta de prueba), en 1280 y en 390 px. Con 50 y 350 ms, como en la tarea 4.
- [ ] **Paso 4:** commit «Ajustes: skeleton en las listas de líneas, equipo y API keys».

### Tarea 8: dentro de los diálogos

**Archivos:**
- Modificar: `Frontend/src/components/Chat/ChatSkeletons.tsx`, añadiendo `TemplateFormSkeleton`
- Modificar: `SendTemplateDialog.tsx` y `NewConversationPanel.tsx` (sus «Cargando plantillas…»)
- Modificar: `pages/private/Contacts/TagManager.tsx` (su «Cargando…»)

**Interfaces:**
- **Consume:** la tarea 1 (`SkeletonField`).
- **Produce:**
  - `TemplateFormSkeleton({ visible })`: lo que hay de verdad al cargar, es decir, el selector cerrado de `TemplatePicker`, con su etiqueta real «Plantilla» y la caja del alto de su `ListboxButton`, con «Cargando plantillas». El diseño dibuja una lista abierta, pero en la app es un selector (revisión de Codex del plan);
  - en `TagManager`, un `TagListSkeleton({ visible })` local: 5 filas con un punto de 10 px, una línea y una píldora de 44 px, con «Cargando etiquetas». Ahí sí hay una lista.

- [ ] **Paso 1:** los dos skeletons y los tres cambios.
- [ ] **Paso 2:** `npm run lint && npm run build`. Tienen que salir sin errores.
- [ ] **Paso 3: en el navegador**, `/api/templates` y `/api/tags` retrasadas 1500 ms:
  - enviar plantilla, la conversación nueva y gestionar etiquetas;
  - la caja del selector empieza donde empieza el selector real (±2 px);
  - con cero plantillas aprobadas, se pasa al aviso de siempre;
  - con un borrador de conversación nueva que ya tenía una plantilla elegida, al cargar sale el formulario con esa plantilla;
  - con 50 y 350 ms, como en la tarea 4.
- [ ] **Paso 4:** documentación. `frontend.md` § Pantallas de carga completa, `docs/estado.md` («Lo siguiente» sin el pendiente de los skeletons) y, en el brief, el enlace al diseño.
- [ ] **Paso 5:** commit «Diálogos: skeleton en el selector de plantillas y en las etiquetas».
