# Frontend

Para cualquier agente que trabaje en `Frontend/`. Las reglas generales y el mapa de toda la documentación están en el [AGENTS.md de la raíz](../AGENTS.md).

### Frontend (`Frontend/src/`)

React 19 + TypeScript + Vite + Tailwind v4. Estado: React Query v5 (server state) + React Context (auth, aviso global).

## Comandos

**Frontend** (React + Vite, port 5173):
```bash
cd Frontend && npm run dev     # vite dev server
cd Frontend && npm run build   # tsc -b && vite build
cd Frontend && npm run lint    # eslint
cd Frontend && npm run preview # preview production build
```

## Reglas del frontend

- **Antes de cualquier cambio visual, la skill de marca** (`.agents/skills/brand-guidelines/SKILL.md`): tokens de color, componentes y lo que no se hace. Nada de colores genéricos de Tailwind.
- **Reutilizar antes de maquetar**: la lista de componentes compartidos está abajo y la de hooks en [frontend.md § Hooks disponibles](../docs/arquitectura/frontend.md#hooks-disponibles).
- **Rutas con constantes** (`AppRoutes`), nunca strings sueltos.
- **Aviso o diálogo**: lo que pasó se cuenta con el aviso global (`useNoticeContext`); lo que hay que leer o decidir antes de seguir, con un diálogo (ver «Componentes compartidos»).
- **Textos de la interfaz en español**, con el tono de las pantallas que ya existen.

**Provider tree** (`main.tsx`):
```
QueryClientProvider
  └── AuthProvider          ← auth state, login/signup/logout
        └── SSEProvider     ← UNA sola conexión SSE global (pub/sub), solo con sesión
              └── NoticeProvider  ← aviso global (notificación arriba a la derecha)
                    └── App       ← renderiza <Notice /> + children
                          └── AppRouter
```

**Routing** (`AppRouter.tsx`):
- Público: `/login`, `/register`
- Protegido: `/*` → `PrivateGuard` → `PrivateRouter` → páginas bajo `PrivateLayout`
- Constantes de rutas en `models/routes.models.ts` (`AppRoutes`) — **no hardcodear strings de rutas**.

**Páginas privadas:** `quickStart` (destino de `/`), `chats`, `contacts`, `campaigns` (Campañas: lista, `campaigns/new` el asistente y `campaigns/:id` el detalle — rutas completas en `CampaignPaths`), `templates`, `docs` (documentación de la API pública), `settings`, y `admin` — esta última solo se registra en `PrivateRouter` si `user.rol === 'superadmin'`. `AppRoutes.private.dashboard` y `pages/private/DashboardPage` existen pero no están enrutados.

**Flujo de datos:**
- Todas las llamadas HTTP van por `services/api.service.ts` (base URL `http://localhost:3001/api`, `withCredentials: true`)
- Cada feature tiene un hook en `hooks/` que envuelve una mutation o query de React Query
- SSE: **una sola conexión global** vía `SSEProvider` (`context/sse.provider.tsx`). Los hooks se **suscriben** con `useSSE().subscribe(evento, handler)` (devuelve la función de des-suscripción); ya no abren su propia conexión. `createSSEConnection("stream", handlers)` se usa solo dentro del provider. Base URL relativa (`/api`) → pasa por el proxy de Vite
- **Reconexión del SSE:** si el servidor responde con error (un reinicio del backend en dev da 500 tras el proxy de Vite, un despliegue da 502), `EventSource` se rinde para siempre. El `SSEProvider` reconecta él mismo con espera creciente (1 s → 30 s) y, al volver tras un corte, hace `queryClient.invalidateQueries()` (solo se vuelven a pedir las de pantalla), porque los eventos del corte se perdieron. En dev había además una conexión **zombi**: el proxy de Vite no cerraba la respuesta al navegador cuando el backend moría, así que ni había error ni reconexión. Lo arregla el `configure` del proxy en `vite.config.ts`, que la destruye cuando se cierra la del backend

**Nunca mutar el cache de React Query.** `[...oldData.pages]` es una copia **shallow**: `newPages[0]` sigue apuntando al mismo objeto de página que está en el cache y en el snapshot de rollback de `onMutate`. Escribir `newPages[0].items = ...` corrompe ambos y rompe el structural sharing (renders omitidos o datos viejos en pantalla). El patrón correcto — en `onMutate` y en `onSuccess` de `useConversationSendMessages` — es `newPages[0] = { ...newPages[0], items: ... }`.

**Íconos:** `lucide-react` + `@heroicons/react`. Componentes UI accesibles con `@headlessui/react`.

**Componentes compartidos** (en `components/`, reutilizarlos antes de maquetar a mano): `PageShell`/`PageHeader`, `DataTable` (con `selection` opcional), `BlankState` (lista vacía o error a pantalla completa), `Callout` (avisos, con `action` opcional a la derecha; en móvil pasa debajo del texto), `ConfirmDialog` (confirmar una acción; `onSecondary` si el botón secundario hace algo más que cerrar; `confirmDisabled` mientras falte algo, como marcar una casilla), `Checkbox` (con estado parcial y área de toque de 44px), `SelectField` (desplegable nativo con el aspecto de `AuthField`; con `icon`, `invalid` y `labelHidden`), `ProgressBar`, las pantallas de carga en `components/Skeleton/` (`SkeletonLine`, `SkeletonPill`, `SkeletonNumber`, `SkeletonBox`, `SkeletonField`, `SkeletonListRow` y `SkeletonFrame`, con `useDelayedLoading`: [frontend.md § Pantallas de carga](../docs/arquitectura/frontend.md#pantallas-de-carga-skeletons); una tabla carga sola con `meta.skeleton` en sus columnas), `MetricGrid` (cifras con su aclaración: el detalle de campaña e Importar), `WizardHeader`/`WizardFooter` (en `components/Wizard/`: migas, pasos y pie fijo de un asistente de página entera; `CampaignWizardHeader` es el de campañas), `SearchInput` (la caja con lupa de la bandeja, Contactos y los destinatarios), `Pill`, en `components/Tag/` `TagChip`/`TagChips` (una etiqueta y las de una fila) y `TagSelector` (buscar, crear y quitar escribiendo), `components/Contact/ReferralCard` (el anuncio que trajo al contacto), `components/Line/` (las líneas de WhatsApp: `LineSwatch`, el cuadrito de color, el mismo en Ajustes, la bandeja, el chat y las campañas; `LineChip`, de qué línea es algo, solo con más de una, y con `wide` cuando tiene su fila o columna propia; `LineSelect`, «Enviar desde», solo con más de una conectada), `components/Contact/LineWindowList` (la ventana de 24 h por línea de un contacto), `components/Push/` (`NumberedSteps`, los pasos numerados de las guías de avisos; `IosInstallSteps`, añadir Wasmish a la pantalla de inicio del iPhone; y `ActivatePushSheet`, la hoja «Último paso»), y en `components/Chat/` `TemplatePicker` (genérico, con `disabledReason`), `CategoryPill`, `TemplateBubble` (con `highlights` para marcar dato o reserva) y `TemplateButtons`. `formatFileSize` vive en `utils/fileSize.ts`. El aviso global (`components/Notice`, `useNoticeContext`) es una notificación: arriba a la derecha, no bloquea la página y se cierra solo a los 5 s. Hasta el 2026-10-04 se llamaba `Modal`/`useModalContext`, y no lo es: un **modal** bloquea la página hasta que se elige algo (`ConfirmDialog`, `SendTemplateDialog`). Para avisar de lo que pasó, `useNoticeContext`; para que la persona lea o decida antes de seguir, un diálogo.

## Dónde está el detalle

| Tema | Archivo |
|---|---|
| Chat: hilo, bandeja, ficha, plantillas, archivos | [chat.md](../docs/arquitectura/chat.md) |
| Contactos, Importar, Etiquetas | [contactos.md](../docs/arquitectura/contactos.md) |
| Campañas: asistente, borrador, detalle | [campanas.md](../docs/arquitectura/campanas.md) |
| `AuthProvider`, errores de WhatsApp, hooks | [frontend.md](../docs/arquitectura/frontend.md) |
| Diseños de referencia | `../Design/*.html` y los briefs de `../docs/superpowers/specs/` |
