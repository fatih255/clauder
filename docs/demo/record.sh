#!/bin/sh
# Re-record the README GIFs. Needs Docker. Run from the repo root:
#
#   CLAUDER_DEMO_TOKEN=sk-ant-oat01-... sh docs/demo/record.sh
#
# CLAUDER_DEMO_TOKEN is a real `claude setup-token` token. The demo accounts launch the real
# Claude Code with it, but it is never typed or shown on screen.
# Your own login (~/.claude/.credentials.json) is copied in for the `clauder me` demo, if it exists.
set -e
: "${CLAUDER_DEMO_TOKEN:?set CLAUDER_DEMO_TOKEN to a token from claude setup-token}"

docker build -q -t clauder-vhs - <<'EOF'
FROM ghcr.io/charmbracelet/vhs
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm ca-certificates git \
 && rm -rf /var/lib/apt/lists/* && npm i -g @anthropic-ai/claude-code
EOF

# Docker Desktop on Windows wants C:\... paths; Git Bash gives /c/...
hostpath() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }

creds=
if [ -f "$HOME/.claude/.credentials.json" ]; then
  creds="-v $(hostpath "$HOME/.claude/.credentials.json"):/creds.json:ro"
fi

# all tapes, or only the ones named: sh docs/demo/record.sh docs/demo/resume.tape
[ $# -gt 0 ] || set -- docs/demo/*.tape
for tape in "$@"; do
  # Your login goes only to list.tape, the one that shows `clauder me`. Elsewhere it would take
  # over the background sessions, which use the saved login rather than the demo token.
  c=; case "$tape" in *list.tape) c=$creds ;; esac
  # MSYS_NO_PATHCONV keeps Git Bash on Windows from rewriting the container paths
  MSYS_NO_PATHCONV=1 docker run --rm -e CLAUDER_DEMO_TOKEN $c -v "$(hostpath "$PWD"):/src" -w /src clauder-vhs "$tape"
done
