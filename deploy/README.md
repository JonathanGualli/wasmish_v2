# Deploy — Wasmish (producción)

Guía para desplegar **Wasmish** en el servidor de producción (`wasmish.solventyc.com`).

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

- DNS `wasmish.solventyc.com` → IP del server.
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

Desde **tu máquina local** (raíz del repo), sube el compose y las plantillas de env:
```bash
cd /home/jonathan/Proyects/wasmish_v2
scp deploy/compose.yml            megaserver:/opt/docker-projects/prod-wasmish-main/
scp deploy/build.env.example      megaserver:/opt/docker-projects/prod-wasmish-main/.env
scp deploy/config/api.env.example megaserver:/opt/docker-projects/prod-wasmish-main/config/api.env
```

### 4.2 Rellenar los secretos en el server
```bash
ssh megaserver
nano /opt/docker-projects/prod-wasmish-main/config/api.env   # MONGO_URI, TOKEN_SECRET, META_APP_SECRET, WHATSAPP_VERIFY_TOKEN...
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
curl -sI https://wasmish.solventyc.com   # HTTP/2 200
```

---

## 5. Despliegue de una actualización (flujo normal)

El código de la app se sincroniza con **`tar` sobre SSH** (la máquina local no tiene `rsync`).
La compilación (tanto del front como del back) ocurre **dentro de Docker**, no en local.

**Regla práctica: reconstruye solo lo que cambió.**

### 5.1 Solo cambió el Backend
```bash
# 1) LOCAL — subir código del backend
cd /home/jonathan/Proyects/wasmish_v2
tar czf - -C Backend --exclude=node_modules --exclude=.git . \
  | ssh megaserver 'tar xzf - -C /opt/docker-projects/prod-wasmish-main/app/Backend'

# 2) SERVER — reconstruir SOLO la api
ssh megaserver
cd /opt/docker-projects/prod-wasmish-main
docker compose up -d --build wasmish-api
```

### 5.2 Solo cambió el Frontend
```bash
# 1) LOCAL — subir código del frontend
cd /home/jonathan/Proyects/wasmish_v2
tar czf - -C Frontend --exclude=node_modules --exclude=dist --exclude=.git . \
  | ssh megaserver 'tar xzf - -C /opt/docker-projects/prod-wasmish-main/app/Frontend'

# 2) SERVER — reconstruir SOLO la web
ssh megaserver
cd /opt/docker-projects/prod-wasmish-main
docker compose up -d --build wasmish-web
```

### 5.3 Cambiaron ambos
```bash
# 1) LOCAL — subir backend y frontend
cd /home/jonathan/Proyects/wasmish_v2
tar czf - -C Backend  --exclude=node_modules --exclude=.git . \
  | ssh megaserver 'tar xzf - -C /opt/docker-projects/prod-wasmish-main/app/Backend'
tar czf - -C Frontend --exclude=node_modules --exclude=dist --exclude=.git . \
  | ssh megaserver 'tar xzf - -C /opt/docker-projects/prod-wasmish-main/app/Frontend'

# 2) SERVER — reconstruir todo
ssh megaserver
cd /opt/docker-projects/prod-wasmish-main
docker compose up -d --build
```

### 5.4 Verificar tras cualquier deploy
```bash
docker compose ps                          # contenedores "Up"
curl -sI https://wasmish.solventyc.com     # HTTP/2 200
```
En el navegador: recarga forzada **Ctrl + Shift + R** (los assets tienen hash y caché larga).

---

## 6. Notas importantes

- **`tar` sobreescribe, no borra.** Si eliminaste archivos en local, no desaparecen del server automáticamente. Para una limpieza total de un lado, borra el contenido de `app/Backend` o `app/Frontend` en el server antes de re-subir.
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

El deploy no versiona imágenes automáticamente. Para volver atrás:
1. Restaura la versión anterior del código en local (git checkout del commit previo).
2. Re-sube con `tar` (sección 5) y reconstruye.

> Recomendado: **commitear en git** antes de cada deploy, para poder volver a un estado conocido.

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
