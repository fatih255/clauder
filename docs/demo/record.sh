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
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm ca-certificates \
 && rm -rf /var/lib/apt/lists/* && npm i -g @anthropic-ai/claude-code
EOF

# Docker Desktop on Windows wants C:\... paths; Git Bash gives /c/...
hostpath() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }

creds=
if [ -f "$HOME/.claude/.credentials.json" ]; then
  creds="-v $(hostpath "$HOME/.claude/.credentials.json"):/creds.json:ro"
fi

for tape in docs/demo/*.tape; do
  # MSYS_NO_PATHCONV keeps Git Bash on Windows from rewriting the container paths
  MSYS_NO_PATHCONV=1 docker run --rm -e CLAUDER_DEMO_TOKEN $creds -v "$(hostpath "$PWD"):/src" -w /src clauder-vhs "$tape"
done
