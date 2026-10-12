@AGENTS.md

# Solo para Claude Code

Lo de arriba (importado de `AGENTS.md`) vale para cualquier agente. Esto es lo propio de Claude Code.

## Skills del proyecto

Viven en `.agents/skills/` (el formato que comparten Claude Code y Codex) y `.claude/skills/` las enlaza. La de marca, `brand-guidelines`, se consulta **antes de crear o modificar cualquier componente, página o estilo**; para diseñar pantallas está también `interface-design`.

## Grafo de conocimiento (graphify)

### Consultar graphify para preguntas de arquitectura

Cuando el usuario pregunte algo sobre el proyecto que requiera entender la arquitectura completa — flujo de datos, relaciones entre componentes, dónde vive algo, cómo se conectan dos partes — **consultar el grafo de graphify antes de responder**:

```bash
graphify query "<pregunta>"
```

Para preguntas sobre un solo archivo, leer el archivo directamente.
Si hay archivos nuevos, actualizar el grafo con `/graphify --update` antes de consultar.

- `graphify-out/graph.json` (datos), `graph.html` (visualización) y `GRAPH_REPORT.md` (reporte). La carpeta está en el `.gitignore`: **cada computadora tiene su propio grafo** y hay que actualizarlo en las dos.
- Actualizar siempre con `/graphify --update`, que conserva la capa semántica. `graphify update .` (CLI, solo AST) la pierde.
- Si `graphify` no está en el PATH: `$(cat graphify-out/.graphify_python) -m graphify query "…"`.
- `.graphifyignore` excluye `.agents/` (skills empaquetadas), los `.dc.html`/`support.js` del manual de marca y `Design/`: sin él, el grafo se llenaba de ruido ajeno al proyecto.

## Memoria

La memoria de Claude es privada: se sincroniza entre las dos computadoras en un repo aparte, y Codex la lee desde su configuración personal (`~/.codex/AGENTS.md`), nunca desde este repo, que es público. En ella va **solo lo privado** (servidor, cuentas y datos de Meta, deuda de seguridad) y lo de cómo trabaja Claude. Lo que sea **del proyecto** va en `AGENTS.md` y `docs/`, aunque se aprenda en una sesión de Claude: si no, Codex no lo ve.
