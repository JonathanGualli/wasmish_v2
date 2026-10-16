# Deploy — Wasmish (producción)

Guía para desplegar **Wasmish** en el servidor de producción (`app.wasmish.com`; ver «Dominios» abajo).

---

## 1. Arquitectura

Dos contenedores Docker detrás de **Traefik** (que termina TLS con Let's Encrypt):

```
Internet ──▶ Traefik ──▶ wasmish-web (nginx)  ──┐
                          · sirve el SPA (React) │  reverse-proxy /api
                          · proxya /api ─────────┘──▶ wasmish-api (Node :3001)
                                                              │
                                                              ▼
                                              Mongo COMPARTIDO (prod-mongo-main-db-ct)
```

- **`wasmish-web`** (nginx): sirve el frontend compilado **y** hace de reverse-proxy de `/api` → API. Es el único expuesto a Traefik.
- **`wasmish-api`** (Node/Express): no se expone a Traefik; solo lo alcanza la web por la red interna. Se conecta al **Mongo compartido** por la red `prod-mongo-main-internal-net`.
- **Mongo NO se despliega aquí** — se reutiliza el contenedor compartido `prod-mongo-main-db-ct`.

### Redes
| Red | Tipo | Para qué |
|-----|------|----------|
| `prod-wasmish-main-internal-net` | propia | web ↔ api |
| `prod-traefik-proxy-net` | externa (ya existe) | Traefik ↔ web |
| `prod-mongo-main-internal-net` | externa (ya existe) | api ↔ Mongo compartido |

### Dominios

Los sirve todos el mismo contenedor `wasmish-web`, con un router de Traefik por dominio (cada uno con su certificado: si uno falla, los demás siguen). Las redirecciones las hace Traefik, no el nginx. Desde el 2026-10-16:

| Dominio | Qué hace |
|---|---|
| `app.wasmish.com` | la app y su `/api` |
| `wasmish.solventyc.com/api/*` | **igual que siempre, sin fecha de fin**: ahí apuntan el webhook de Meta y la API pública del cliente real, y un POST redirigido no llega (muchos clientes no siguen la redirección o la convierten en GET) |
| `wasmish.solventyc.com` (el resto) | 301 a la misma ruta en `app.wasmish.com` |
| `wasmish.com` | la página pública; mientras no exista, **302** (temporal) a `app.wasmish.com`: un 301 se queda guardado en el navegador |
| `www.wasmish.com` | 301 a `wasmish.com` |
| `http://` de cualquiera | 301 a `https://` |

- La app instalada (PWA), sus avisos push y la cookie de sesión van atados al dominio exacto: quien la tenía instalada desde `wasmish.solventyc.com` la vuelve a instalar desde `app.wasmish.com` y vuelve a activar los avisos.
- La app de Meta tiene **los dos** dominios en *Dominios de la app*, en las URI de OAuth y en los dominios del SDK de JavaScript (el Embedded Signup se abre desde `app.wasmish.com`). El webhook sigue en `wasmish.solventyc.com`.
- Los DNS de `wasmish.com` (registros A de `@`, `www` y `app`) están en Namecheap; tienen que apuntar al servidor **antes** de desplegar un dominio nuevo, o Let's Encrypt no emite su certificado.

---

## 2. Layout en el servidor

```
/opt/docker-projects/prod-wasmish-main/
├── compose.yml              ← copia de deploy/compose.yml
├── .env                     ← build args VITE_* (públicos)   [copia de deploy/build.env.example]
├── config/
│   └── api.env              ← secretos del backend           [copia de deploy/config/api.env.example]
└── app/
    ├── Backend/             ← código del backend (repo Backend/)
    └── Frontend/            ← código del frontend (repo Frontend/)
```

- Acceso al server: `ssh megaserver`
- Nombres de contenedor: `prod-wasmish-main-api-ct`, `prod-wasmish-main-web-ct`
- Los archivos `*.env` reales **nunca** van a git (solo los `*.example`).

---

## 3. Requisitos previos (ya cumplidos)

- DNS `app.wasmish.com`, `wasmish.com`, `www.wasmish.com` y `wasmish.solventyc.com` → IP del server.
- Traefik corriendo con el resolver `letsencrypt` y la red `prod-traefik-proxy-net`.
- Mongo compartido activo con el usuario/BD de Wasmish creados:
  `mongodb://wasmish_app:<pass>@prod-mongo-main-db-ct:27017/wasmish?authSource=wasmish`

---

## 4. Primer despliegue (setup inicial)

> Solo la primera vez. Para actualizaciones posteriores, ir a la sección 5.

### 4.1 Crear el layout y copiar la config
```bash
ssh megaserver
mkdir -p /opt/docker-projects/prod-wasmish-main/{config,app/Backend,app/Frontend}
```

Desde **tu máquina local**, en la raíz del repo, sube el compose y las plantillas de env:
```bash
scp deploy/compose.yml            megaserver:/opt/docker-projects/prod-wasmish-main/
scp deploy/build.env.example      megaserver:/opt/docker-projects/prod-wasmish-main/.env
scp deploy/config/api.env.example megaserver:/opt/docker-projects/prod-wasmish-main/config/api.env
```

### 4.2 Rellenar los secretos en el server
```bash
ssh megaserver
nano /opt/docker-projects/prod-wasmish-main/config/api.env   # MONGO_URI, TOKEN_SECRET, META_APP_SECRET, WHATSAPP_VERIFY_TOKEN, VAPID_*...
nano /opt/docker-projects/prod-wasmish-main/.env             # normalmente ya trae los VITE_* correctos
```
> ⚠️ Los secretos reales se escriben **directo en el server**, nunca por chat ni en git.
> Generar aleatorios: `openssl rand -hex 32`.

### 4.3 Subir el código de la app
Ver sección 5.1 (Backend) y 5.2 (Frontend) — subes ambos.

### 4.4 Primer arranque (construye ambas imágenes)
```bash
cd /opt/docker-projects/prod-wasmish-main
docker compose up -d --build
```

### 4.5 Verificar
```bash
docker compose ps
docker compose logs -f wasmish-api    # esperar: "Server on port 3001" + ">>> DB is connected"
curl -sI https://app.wasmish.com   # HTTP/2 200
```

---

## 5. Despliegue de una actualización (flujo normal)

> **Se hace con la skill `deploy`** (`.agents/skills/deploy/SKILL.md`; en Claude Code, `/deploy`), que sigue estos pasos con una confirmación en cada comando del servidor. Esta sección es la referencia de qué hace cada paso. **Solo se despliega desde `master` limpio, al día y con el CI en verde**, y lo desplegado queda registrado con una **etiqueta de git `vX.Y.Z`**: el último despliegue es `git describe --tags --abbrev=0 --match 'v*'`.

El código de la app se sincroniza con **`git archive` sobre SSH** (la máquina local no tiene `rsync`): exporta solo los archivos **versionados** del commit, así que nada sin seguimiento (`.env*`, `media/`, `node_modules`, claves `*.pem`) puede colarse. `set -o pipefail` hace que una subida a medias falle en vez de dar éxito. Hasta el 2026-10-11 se usaba `tar` sobre la carpeta, con `--exclude`; la revisión de Codex encontró que subiría cualquier archivo ignorado por git que no estuviera en la lista.
La compilación (tanto del front como del back) ocurre **dentro de Docker**, no en local.

**Regla práctica: reconstruye solo lo que cambió.**

> ⚠️ **Si cambió `deploy/compose.yml`, hay que subirlo aparte.** La subida solo
> sincroniza `app/Backend` y `app/Frontend`; el compose vive un nivel más arriba
> y no viaja con él. Se olvida fácil y falla en silencio: el despliegue funciona
> pero sin el volumen o la red nueva que acabas de añadir.
> ```bash
> scp deploy/compose.yml megaserver:/opt/docker-projects/prod-wasmish-main/
> ```
> Lo mismo con `config/api.env`: las variables nuevas se añaden **a mano en el
> servidor** (el `.example` del repo es solo la plantilla).

### 5.0 Subir la versión (antes de desplegar)

La versión se cambia en **un solo sitio**, y como `master` está protegido, **en un PR**: rama, y en ella
```bash
cd Backend
npm run version:bump patch    # o minor | major | 1.0.11
```
Escribe `version` en los **dos** `package.json` a la vez (los valida antes de tocar ninguno). No hay que editar nada más: Vite la inyecta en el front al compilar y el Backend la publica en `GET /api/version`. En el mismo PR, la versión nueva en «En producción» de `docs/estado.md`. Cuando el PR está unido, se despliega.

### Antes de subir el código

1. **Archivos borrados.** La subida no borra (ver notas): lo que se eliminó o renombró en el repo sigue en el servidor, y si el build del front compila un archivo que importa algo que ya no existe, falla. Lístalos desde la última etiqueta desplegada (`<commit desplegado>` = `git describe --tags --abbrev=0 --match 'v*'`) y bórralos en `app/Backend` o `app/Frontend` antes del `up --build`:
   ```bash
   git diff --no-renames --diff-filter=D --name-only <commit desplegado> HEAD
   ```
   Sin `--no-renames` los renombrados no salen y se quedan en el servidor.
2. **Guardar las imágenes actuales** para poder volver atrás sin recompilar (ver sección 8). En el servidor, con la versión que está corriendo:
   ```bash
   docker tag prod-wasmish-main-api:local prod-wasmish-main-api:1.0.9
   docker tag prod-wasmish-main-web:local prod-wasmish-main-web:1.0.9
   ```

### 5.1 Solo cambió el Backend
```bash
# 1) LOCAL (raíz del repo) — subir código del backend
set -o pipefail
git archive HEAD:Backend | ssh megaserver 'tar xf - -C /opt/docker-projects/prod-wasmish-main/app/Backend'

# 2) SERVER — reconstruir SOLO la api
ssh megaserver
cd /opt/docker-projects/prod-wasmish-main
docker compose up -d --build wasmish-api
```

### 5.2 Solo cambió el Frontend
```bash
# 1) LOCAL (raíz del repo) — subir código del frontend
set -o pipefail
git archive HEAD:Frontend | ssh megaserver 'tar xf - -C /opt/docker-projects/prod-wasmish-main/app/Frontend'

# 2) SERVER — reconstruir SOLO la web
ssh megaserver
cd /opt/docker-projects/prod-wasmish-main
docker compose up -d --build wasmish-web
```

### 5.3 Cambiaron ambos
```bash
# 1) LOCAL (raíz del repo) — subir backend y frontend
set -o pipefail
git archive HEAD:Backend  | ssh megaserver 'tar xf - -C /opt/docker-projects/prod-wasmish-main/app/Backend'
git archive HEAD:Frontend | ssh megaserver 'tar xf - -C /opt/docker-projects/prod-wasmish-main/app/Frontend'

# 2) SERVER — reconstruir todo
ssh megaserver
cd /opt/docker-projects/prod-wasmish-main
docker compose up -d --build
```

### 5.4 Verificar tras cualquier deploy
```bash
docker compose ps                          # contenedores "Up"
curl -sI https://app.wasmish.com          # HTTP/2 200
curl https://app.wasmish.com/api/version   # debe devolver la versión recién subida
docker compose logs --tail=50 wasmish-api  # ">>> DB is connected" y "Server on port 3001"
```
En los logs de la api **no** tiene que salir «Campañas en MODO DE PRUEBA» (lo apaga `NODE_ENV=production` en `config/api.env`; `CAMPAIGN_DRY_RUN` nunca se pone ahí) ni ningún `E11000` (un índice único que no se pudo crear).
En el navegador: recarga forzada **Ctrl + Shift + R** (los assets tienen hash y caché larga).

---

## 6. Notas importantes

- **Nunca subas tu `.env` local.** `git archive` ya no puede: solo exporta lo versionado, y los `.env` reales están en el `.gitignore` (solo viajan los `.env.example`, que no llevan secretos). Hasta el 2026-10-11, con `tar` sobre la carpeta, dependía de un `--exclude='.env*'`; uno anterior, `--exclude=.env` a secas, dejó pasar `.env.local`. Un `.env` en el servidor no rompería nada (el `.dockerignore` lo deja fuera de la imagen y el contenedor lee `config/api.env`), pero deja secretos de desarrollo en el disco de producción. En local, además, puede apuntar a la app de pruebas de Meta.
  Si en algún despliegue anterior se subió, se borra así:
  ```bash
  ssh megaserver 'rm -f /opt/docker-projects/prod-wasmish-main/app/Backend/.env* \
                        /opt/docker-projects/prod-wasmish-main/app/Frontend/.env*'
  ```
- **Tampoco sube `Backend/media/`** (los adjuntos de tus pruebas locales): está en el `.gitignore`, así que `git archive` no lo exporta. Con el `tar` viejo había que excluirlo a mano; sin hacerlo, acababa en `app/Backend/media` y dentro de la imagen (tapado por el volumen, pero ocupando sitio).
- **Los adjuntos viven en un volumen, no en la imagen.** El servicio `wasmish-api` monta `prod-wasmish-main-media` en `/app/media`, y `MEDIA_DIR` en `config/api.env` tiene que apuntar ahí. Sin el volumen, cada `up --build` borraría todas las fotos y audios recibidos. **Al desplegar por primera vez esta versión hay que añadir `MEDIA_DIR=/app/media` al `config/api.env` del servidor** — si falta, la api escribe en `media/` dentro del contenedor y se pierde en el siguiente rebuild.
  Para ver cuánto ocupa: `docker run --rm -v prod-wasmish-main-media:/m alpine du -sh /m`
- **La subida sobreescribe, no borra.** Si eliminaste archivos en local, no desaparecen del server automáticamente: el `git diff` de «Antes de subir el código» (sección 5) dice cuáles borrar. Para una limpieza total de un lado, borra el contenido de `app/Backend` o `app/Frontend` en el server antes de re-subir.
- **Cambios solo en `config/api.env`** (sin cambio de código): basta reiniciar la api sin rebuild →
  `docker compose up -d wasmish-api` (Compose detecta el env_file y recrea el contenedor).
- **Cambios en los `VITE_*` del `.env`**: sí requieren **rebuild del front** (`--build wasmish-web`), porque Vite los embebe en tiempo de compilación.
- **No tocar otros proyectos del server.** Nombrar siempre el servicio (`wasmish-web` / `wasmish-api`) al hacer `up` para no reiniciar de más.

---

## 7. Diagnóstico

```bash
cd /opt/docker-projects/prod-wasmish-main

docker compose ps                     # estado de contenedores
docker compose logs -f wasmish-api    # logs del backend (DB, Meta, envíos)
docker compose logs -f wasmish-web    # logs de nginx (proxy /api, SPA)
docker compose logs --tail=100 wasmish-api

docker network ls | grep -E 'traefik|mongo|wasmish'   # redes conectadas
```

Síntomas comunes:
| Síntoma | Causa probable | Acción |
|--------|----------------|--------|
| `502 Bad Gateway` en el sitio | la api no levantó o no conecta a Mongo | `docker compose logs wasmish-api` |
| `/api/...` responde 404 desde el front | nginx no proxya bien | revisar `Frontend/nginx.conf` y rebuild web |
| Front sin cambios tras deploy | caché del navegador | `Ctrl + Shift + R` |
| Certificado inválido | Traefik/Let's Encrypt | revisar labels en `compose.yml` y logs de Traefik |

---

## 8. Rollback rápido

El deploy no versiona imágenes automáticamente: cada `up --build` reemplaza `prod-wasmish-main-api:local` y `prod-wasmish-main-web:local`. Por eso, antes de cada despliegue, se etiquetan con la versión que estaba corriendo (ver «Antes de subir el código», en la sección 5). Para volver a ella, **sin recompilar**:
```bash
cd /opt/docker-projects/prod-wasmish-main
docker tag prod-wasmish-main-api:1.0.9 prod-wasmish-main-api:local
docker tag prod-wasmish-main-web:1.0.9 prod-wasmish-main-web:local
docker compose up -d --no-build wasmish-api wasmish-web
```
Ojo: el código en `app/` sigue siendo el nuevo, así que el siguiente `up --build` lo volvería a desplegar. Para dejarlo también:
1. En local, `git switch --detach v<versión anterior>` (la etiqueta del despliegue anterior).
2. Re-sube con `git archive` (sección 5), reconstruye y vuelve a `master`.

Un despliegue revertido **no** recibe su etiqueta `vX.Y.Z`.

---

## 9. Referencia de archivos (este repo)

| Archivo | Destino en server | Contenido |
|---------|-------------------|-----------|
| `deploy/compose.yml` | `.../prod-wasmish-main/compose.yml` | definición de los 2 servicios + Traefik + redes |
| `deploy/build.env.example` | `.../prod-wasmish-main/.env` | `VITE_*` (públicos, build-time del front) |
| `deploy/config/api.env.example` | `.../prod-wasmish-main/config/api.env` | secretos del backend (Mongo, JWT, Meta) |
| `Frontend/Dockerfile` | (build) | multi-stage: build Vite → nginx |
| `Frontend/nginx.conf` | (dentro de la imagen web) | SPA + reverse-proxy `/api` con soporte SSE |
| `Backend/Dockerfile` | (build) | imagen Node de la api |
```
