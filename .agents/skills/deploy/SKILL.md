---
name: deploy
description: Desplegar Wasmish a producción paso a paso, con confirmación en cada paso del servidor. SOLO cuando Jonathan lo pide explícitamente (/deploy); nunca por iniciativa del agente.
disable-model-invocation: true
---

# Desplegar Wasmish a producción

El servidor (`ssh megaserver`) es **crítico**: comparte máquina con servicios en producción de otros clientes. Esta skill solo se usa cuando Jonathan la lanza, y **ningún comando que toque el servidor se ejecuta sin que Jonathan lo confirme**, uno por uno: se le enseña el comando exacto, se espera su «sí» y después se corre. Si algo no cuadra, se para y se pregunta.

Referencia completa (arquitectura, primer despliegue, diagnóstico): `deploy/README.md`. Todos los comandos locales se corren desde la raíz del repo.

```bash
SERVER=megaserver
REMOTE=/opt/docker-projects/prod-wasmish-main
```

## 1. Comprobaciones previas (local, solo lectura)

Si alguna falla, **se para** y se explica qué falta. No se «arregla» sobre la marcha.

1. **`master`, limpio y al día:**
   ```bash
   git switch master && git pull && git status --short
   ```
   `git status` tiene que salir vacío: `git archive` sube el commit en el que estás (`HEAD`), y un cambio sin commit no viaja aunque se vea en local.
2. **CI en verde en el commit a desplegar:**
   ```bash
   gh api repos/JonathanGualli/wasmish_v2/commits/$(git rev-parse HEAD)/check-runs \
     -q '.check_runs[] | "\(.name): \(.conclusion)"'
   ```
   Los tres (`Backend · tests y aislamiento`, `Frontend · lint y build`, `Docs · enlaces y mapa`) en `success`.
3. **Versión nueva:**
   ```bash
   NEW=$(node -p "require('./Backend/package.json').version")
   PROD=$(curl -s https://wasmish.solventyc.com/api/version | node -p "JSON.parse(require('fs').readFileSync(0)).version")
   LAST=$(git describe --tags --abbrev=0 --match 'v*')
   echo "local $NEW · producción $PROD · último desplegado $LAST"
   ```
   - `NEW` tiene que ser mayor que `PROD`. Si es igual, falta subir la versión, y eso **va en un PR** (`master` está protegido): rama, `cd Backend && npm run version:bump patch`, la versión nueva en «En producción» de `docs/estado.md`, PR, CI y Jonathan lo une. Después se vuelve a empezar.
   - `LAST` tiene que ser `v$PROD`. Si no, el registro de etiquetas no cuadra con lo que corre: se para y se pregunta.

## 2. Qué cambió desde el último despliegue

```bash
git log --oneline $LAST..HEAD
git diff --stat $LAST..HEAD -- Backend Frontend deploy
```

Se le presenta a Jonathan un resumen con:

- **Servicios a reconstruir:** `wasmish-api` si cambió `Backend/`, `wasmish-web` si cambió `Frontend/`. Solo esos. La documentación (`*.md`) y los tests del backend no cuentan: no cambian lo que corre.
  ```bash
  git diff --quiet $LAST HEAD -- Backend ':(exclude,glob)Backend/**/*.md' ':(exclude)Backend/tests' || echo "api"
  git diff --quiet $LAST HEAD -- Frontend ':(exclude,glob)Frontend/**/*.md' || echo "web"
  ```
- **Archivos que hay que borrar en el servidor:** subir con `git archive` no borra nada.
  ```bash
  git diff --no-renames --diff-filter=D --name-only $LAST HEAD -- Backend Frontend
  ```
  Sin `--no-renames`, los archivos renombrados no aparecen y se quedan en el servidor.
- **`deploy/compose.yml` cambiado:** no viaja con el código (solo suben `Backend/` y `Frontend/`); se sube aparte.
  ```bash
  git diff --quiet $LAST HEAD -- deploy/compose.yml || echo "compose cambió"
  ```
- **Variables nuevas:** si cambió `deploy/config/api.env.example` o `deploy/build.env.example`, Jonathan las añade **a mano en el servidor** antes del despliegue. Los secretos nunca pasan por el chat.
- **Scripts que correr**, según los commits y `docs/estado.md`, separados en **previos** (antes de arrancar la versión nueva: `check:duplicates` antes de un índice único nuevo, que la API crea al arrancar) y **posteriores** (backfills que necesitan el código nuevo corriendo). Se preguntan; no se deducen.

Jonathan confirma el resumen antes de seguir.

## 3. En el servidor (cada comando, con confirmación)

Los comandos con tuberías llevan `set -o pipefail`: sin eso, una subida a medias devuelve éxito. Si uno falla, **se para**: nada de reintentar a ciegas.

1. **Guardar lo que corre ahora**, para volver atrás sin recompilar. Se etiqueta la imagen **de cada contenedor en marcha** (no `:local`, que tras un intento fallido puede ser otra), y nunca se pisa un respaldo distinto. También se guarda el `compose.yml` vigente:
   ```bash
   ssh $SERVER "set -e; for s in api web; do \
     run=\$(docker inspect --format '{{.Image}}' prod-wasmish-main-\$s-ct); \
     if old=\$(docker image inspect --format '{{.Id}}' prod-wasmish-main-\$s:$PROD 2>/dev/null); then \
       [ \"\$old\" = \"\$run\" ] || { echo \"\$s:$PROD ya existe y NO es lo que corre: parar\"; exit 1; }; \
     else docker tag \$run prod-wasmish-main-\$s:$PROD; fi; \
     echo \"\$s:$PROD = \$run\"; done; \
     [ -f $REMOTE/compose.yml.$PROD ] || cp $REMOTE/compose.yml $REMOTE/compose.yml.$PROD"
   ```
2. **Borrar los archivos eliminados** (si hay). Las rutas del repo `Backend/…` y `Frontend/…` son las mismas bajo `$REMOTE/app/`:
   ```bash
   ssh $SERVER "cd $REMOTE/app && rm -f -- <archivo1> <archivo2> …"
   ```
3. **Subir el código** de lo que cambió con `git archive`: exporta **solo lo versionado del commit**, así que nada sin seguimiento (claves `*.pem`, `.env`, `media/`, `node_modules`) puede colarse:
   ```bash
   set -o pipefail
   git archive HEAD:Backend  | ssh $SERVER "tar xf - -C $REMOTE/app/Backend"  && echo "Backend subido"
   git archive HEAD:Frontend | ssh $SERVER "tar xf - -C $REMOTE/app/Frontend" && echo "Frontend subido"
   ```
4. **Subir `compose.yml`** (solo si cambió; el anterior quedó guardado en el paso 1):
   ```bash
   scp deploy/compose.yml $SERVER:$REMOTE/
   ```
5. **Compilar sin arrancar**: si el build falla, no se ha reemplazado nada y producción sigue igual.
   ```bash
   ssh $SERVER "cd $REMOTE && docker compose build wasmish-api wasmish-web"   # o solo uno de los dos
   ```
6. **Scripts previos** (si los hay), con la imagen nueva y sin tocar lo que corre:
   ```bash
   ssh $SERVER "cd $REMOTE && docker compose run --rm --no-deps wasmish-api npm run <script>"
   ```
7. **Arrancar lo nuevo**, nombrando siempre el servicio, para no reiniciar nada más:
   ```bash
   ssh $SERVER "cd $REMOTE && docker compose up -d --no-build wasmish-api wasmish-web"   # o solo uno de los dos
   ```
8. **Scripts posteriores** (si los hay): `ssh $SERVER "cd $REMOTE && docker compose exec wasmish-api npm run <script>"`.

## 4. Verificar

```bash
ssh $SERVER "cd $REMOTE && docker compose ps"
curl -s https://wasmish.solventyc.com/api/version          # tiene que ser $NEW
ssh $SERVER "cd $REMOTE && docker compose logs --tail=80 wasmish-api"
```

En los logs de la api tiene que estar «>>> DB is connected» y «Server on port 3001», y **no** puede aparecer ni «Campañas en MODO DE PRUEBA» ni ningún `E11000`. Si algo falla, se para y se propone volver atrás (sección 6). Jonathan prueba en el navegador con **Ctrl + Shift + R**.

## 5. Dejar constancia

```bash
git tag -a v$NEW HEAD -m "v$NEW en producción ($(date +%F))"
git push origin v$NEW
```

La etiqueta es el registro de qué está desplegado: el próximo despliegue parte de ella. Si `docs/estado.md` no quedó al día en el PR de la versión, se corrige en un PR pequeño.

## 6. Volver atrás

Sin recompilar, con lo guardado en el paso 3.1: primero el `compose.yml` anterior (si se cambió) y después las imágenes.

```bash
ssh $SERVER "set -e; cd $REMOTE; \
  [ -f compose.yml.$PROD ] && cp compose.yml.$PROD compose.yml; \
  docker tag prod-wasmish-main-api:$PROD prod-wasmish-main-api:local; \
  docker tag prod-wasmish-main-web:$PROD prod-wasmish-main-web:local; \
  docker compose up -d --no-build wasmish-api wasmish-web"
```

Los cambios hechos a mano en `config/api.env` o en `.env` no los revierte esto: se deshacen a mano. El código de `$REMOTE/app/` sigue siendo el nuevo, y el próximo `build` lo volvería a desplegar. Para dejarlo también, se sube el de la etiqueta anterior (`git archive v$PROD:Backend …` y `v$PROD:Frontend`, como en el paso 3.3). **No se crea la etiqueta `v$NEW`** de un despliegue revertido.
