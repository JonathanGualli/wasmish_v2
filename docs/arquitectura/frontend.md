# Frontend: auth, errores y hooks

Lógica no obvia del `AuthProvider`, los errores de WhatsApp en palabras y la lista de hooks disponibles.

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md).

## Contenido

- [`AuthProvider` — lógica no obvia](#authprovider--lógica-no-obvia)
- [Errores de WhatsApp en palabras (`utils/whatsappErrors.ts`)](#errores-de-whatsapp-en-palabras-utilswhatsapperrorsts)
- [Hooks disponibles](#hooks-disponibles)

---

### `AuthProvider` — lógica no obvia

**`AuthProvider` — lógica no obvia:**
- `isLoading = !authChecked || loginMutation.isPending`
- `authChecked` se setea en `true` cuando `isVerifying` (de `useVerifyLogin`) termina
- `PrivateGuard` bloquea el render hasta que `isLoading` sea `false`
- Si `verifyData` llega → setea `user`; si `verifyError` → setea `user = null`
- **Al salir y al entrar se vacía la caché de React Query** (`clearSessionCache`, menos la de `useVerifyLogin`): las claves no llevan la cuenta (`['lines']`, `['conversations']`…), y sin esto quien entra después en el mismo navegador veía un momento los datos de la sesión anterior (revisión de Codex del PR #21). Al salir se borran también los borradores (`clearAllDrafts`, `clearAllCampaignDrafts`)

### Errores de WhatsApp en palabras (`utils/whatsappErrors.ts`)

**Errores de WhatsApp en palabras (`utils/whatsappErrors.ts`):** un diccionario de los códigos de Meta (cuenta, ritmo, destinatario, plantilla) con qué hacer cuando hay algo que hacer. Lo usan el «Fallido» de cada mensaje del chat (motivo en palabras, y debajo el código y el texto original de Meta, para soporte), `templateSendError` y las campañas (`failureLabel`). Un código que no esté se enseña con el detalle de Meta, en inglés. Sin código, el error es nuestro (de antes de llamar a Meta) y ya viene en español.

### Hooks disponibles

**Hooks disponibles:**
- `useLogin`, `useSignUp`, `useLogOut`, `useVerifyLogin` — auth
- `useConversations` — lista de conversaciones (query + suscripción SSE)
- `useConversationMessages(conversationId)` — mensajes paginados + suscripción SSE
- `useConversationSendMessages` — envío de mensajes (UI optimista; marca `failed` en error)
- `useSendMediaMessage` — envío de archivos (`send`, `retry`, `discard`), con progreso y UI optimista; `useOutgoingAttachment` (el archivo que se prepara) y `useWindowFileDrag` (se arrastra un archivo sobre la página)
- `useUpdateWhatsappToken` — carga manual de credenciales de WhatsApp (conecta, renueva o reemplaza una línea; vuelve a pedir las líneas)
- `useConnectWhatsapp` — Embedded Signup (SDK de Facebook → `/api/whatsapp/connect`); `isConnecting` cubre también el rato con la ventana de Facebook abierta
- `useLines` — las líneas de WhatsApp de la cuenta (Fase 2c): `lines`, `activeLines`, `previousLines`, `defaultLine`, `nextDefaultLine`, `maxLines`, `isMultiLine` (plan de varias o más de una conectada), `colorOf(lineId)` (el color de cada línea por orden de conexión, `utils/lineDisplay.ts`) y `rename` / `makeDefault` / `disconnect`. Cada mutación vuelve a pedir la lista al terminar
- `useCopyToClipboard(resetMs)` — copiar con `copied` un momento en true (las API keys, los IDs de línea, `CodeBlock`)
- `useConversationWindow(windowExpiresAt)` — cuenta atrás de la ventana de 24 h (tick de 60 s); con `msSinceClosed` para «hace 2 días»
- `useAutosave(value, { savedValue, save, delay, onLost })` — guardar solo mientras se escribe (las notas de la ficha del chat)
- `useAutosizeTextarea(ref, value, maxHeight)` — un `<textarea>` que crece con lo escrito (el campo de escribir y las notas)
- `useSendTemplate` — envío de plantilla a una conversación (sin UI optimista); `useStartConversation`, en el mismo archivo, la conversación nueva
- `useTemplateForm` — estado compartido del formulario de plantilla (elegida, valores, botones, payload); lo usan `SendTemplateDialog` y `NewConversationPanel`
- `useHeaderMediaUpload(template, onUploaded)` — subir el archivo de la cabecera de un envío (progreso, cancelar, error en palabras)
- `useFilePicker(onFile)` — elegir un archivo con el selector del sistema o soltándolo encima (`inputProps`, `dropProps`, `open`, `isDragging`); lo usan `HeaderMediaField` e Importar
- `useImportPreview`, `useImportRun`, `importError` — importar contactos (en `useContactImport.ts`); `useRefreshContacts` (en `useContacts.ts`) invalida contactos, bandeja y etiquetas
- `useTemplates` — sync + listado de plantillas, y `uploadHeaderMedia` / `removeHeaderMedia` (el archivo de la cabecera; `utils/templateHeader.ts` replica `templateHeaderIssue` para los selectores y `TemplateBubble` pinta la cabecera con `template`)
- `useApiKey` — gestión de API keys (listar / generar / revocar)
- `useAdminStats`, `useAdminClients`, `useUpdateAccountLimits` — el panel de superadmin (en `useAdmin.ts`)
- `useContacts(pageIndex, pageSize, search, filter, tagIds)`, `useContact(id)`, `useLiveContact(id, conversationId)`, `useContactByPhone(phone)`, `useContactMutations` (create/update/remove, y `saveNotes`/`setTags` para la ficha del chat) — en `useContacts.ts`
- `useTags`, `useTagSelectionSummary(selection, enabled)`, `useTagMutations` (create/rename/remove/bulk y `createMissing`), `tagError` — etiquetas (en `useTags.ts`)
- `useDebouncedValue` — retrasa un valor (la búsqueda de contactos)
- `useOnVisible(onVisible, enabled)` — centinela de scroll infinito (IntersectionObserver); al reactivarse vuelve a avisar si sigue a la vista
- `useThrottledInvalidate(queryKey, ms)` — invalida como mucho una vez por intervalo (la primera al momento, la última al final). Lo usan `useConversations` (conversaciones nuevas), `useContacts` y `useCampaign`: sin él, una campaña pedía la lista entera en cada evento SSE, y como invalidar cancela la petición en curso, la lista podía no pintarse hasta el final
- `useCampaigns(pageIndex, pageSize)`, `useCampaign(id)`, `useCampaignRecipients(id, state, …)`, `useCampaignFailures(id, enabled)`, `useCampaignPreview(input)` (devuelve también `isUpdating`), `useCampaignAudience(input, search, pageSize)` (infinita), `useCampaignMutations` (create/pause/resume/cancel), `campaignErrors` — campañas (en `useCampaigns.ts`). `campaign_progress` actualiza la campaña en la caché sin pedir nada; el detalle escucha también los `message_status` con su `campaignId`, porque entregas y lecturas llegan horas después. La vista previa espera 400 ms y mantiene la anterior mientras recalcula
