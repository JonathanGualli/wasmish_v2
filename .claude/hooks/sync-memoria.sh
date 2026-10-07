#!/usr/bin/env bash
# Sincroniza la memoria de Claude entre las dos computadoras. La carpeta de la
# memoria es un clon de un repo privado (aparte de este, que es público).
#   start → guarda lo que quedó sin subir, trae lo de la otra máquina y sube.
#   end   → guarda y sube.
# Lo llaman los hooks SessionStart y SessionEnd de .claude/settings.json, con el
# JSON del hook por stdin. Nunca falla la sesión: si algo sale mal, lo avisa.
set -u

mode="${1:-}"
transcript=$(jq -r '.transcript_path // empty' 2>/dev/null)
[ -n "$transcript" ] || exit 0

# La carpeta sale de la ruta del proyecto y cambia en cada máquina:
# está junto al transcript de la sesión.
dir="$(dirname "$transcript")/memory"
[ -d "$dir" ] || exit 0
top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || exit 0
# Solo si la memoria es la raíz de su propio repo: si estuviera dentro de otro
# (como cuando era un enlace a .claude/memory de este), se commitearía ese.
[ "$top" = "$(cd "$dir" && pwd -P)" ] || exit 0

# Sin red o sin credenciales, que falle rápido en vez de colgar la sesión.
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10"

g() { git -C "$dir" "$@"; }

warn() {
  jq -n --arg msg "Memoria: $1" --arg event "$2" '{
    systemMessage: $msg,
    hookSpecificOutput: { hookEventName: $event, additionalContext: $msg }
  }'
  exit 0
}

# Commits locales que el remoto todavía no tiene.
unpushed() { [ "$(g rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)" -gt 0 ]; }

commit_pending() {
  g add -A
  g diff --cached --quiet || g commit -q -m "memoria: $(hostname) $(date '+%F %H:%M')"
}

case "$mode" in
  start)
    commit_pending
    if ! err=$(timeout 30 git -C "$dir" pull -q --rebase 2>&1); then
      g rebase --abort >/dev/null 2>&1
      err=$(printf '%s\n' "$err" | grep -v -E '^(ayuda|hint):' | head -3)
      warn "no se pudo traer la de la otra computadora (git pull --rebase en $dir); quedó la de esta, sin unir. Si es un conflicto, unirlo a mano. $err" SessionStart
    fi
    if unpushed; then
      timeout 30 git -C "$dir" push -q >/dev/null 2>&1 ||
        warn "hay cambios sin subir en $dir (falló el git push)." SessionStart
    fi
    ;;
  end)
    commit_pending
    # Si la otra máquina subió algo mientras tanto, el push sin esto se rechaza.
    timeout 30 git -C "$dir" pull -q --rebase >/dev/null 2>&1 || g rebase --abort >/dev/null 2>&1
    if unpushed; then
      timeout 30 git -C "$dir" push -q >/dev/null 2>&1 ||
        echo "Memoria: no se pudo subir $dir; se reintenta al abrir la próxima sesión." >&2
    fi
    ;;
esac
exit 0
