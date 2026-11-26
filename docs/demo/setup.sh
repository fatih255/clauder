# Sourced (hidden) at the start of every recording, inside the container record.sh starts.
#
# The demo accounts carry fake `sk-ant-oat01-demo-*` tokens, so no real token is ever typed or
# shown. A thin wrapper in front of the real `claude` swaps a demo token for the real one in
# $CLAUDER_DEMO_TOKEN at launch, so the GIFs show the real Claude Code starting up.
# `claude auth status` for your own login is faked, because the real answer prints your email.

export CLAUDER_HOME=/tmp/clauder-demo
export TERM=xterm-256color
# the container runs as root, where claude refuses bypass mode unless told it is a sandbox
export IS_SANDBOX=1
export PS1='\[\e[38;2;217;119;87m\]$\[\e[0m\] '

REAL_CLAUDE=$(command -v claude)
export REAL_CLAUDE
rm -rf "$CLAUDER_HOME" /tmp/demo-bin
mkdir -p /tmp/demo-bin
export PATH="/tmp/demo-bin:$PATH"

cat > /tmp/demo-bin/claude <<'EOF'
#!/bin/sh
case "$CLAUDE_CODE_OAUTH_TOKEN" in
  sk-ant-oat01-demo-*) export CLAUDE_CODE_OAUTH_TOKEN="$CLAUDER_DEMO_TOKEN" ;;
esac
if [ "$1" = auth ] && [ "$2" = status ] && [ -z "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
  echo '{"loggedIn":true,"authMethod":"claude.ai","email":"you@example.com","orgName":"Acme Inc","subscriptionType":"team"}'
  exit 0
fi
exec "$REAL_CLAUDE" "$@"
EOF
chmod +x /tmp/demo-bin/claude

# A project folder Claude already trusts, with onboarding done, so it opens straight to the prompt.
mkdir -p ~/.claude ~/projects/my-app
cd ~/projects/my-app
cat > ~/.claude.json <<EOF
{"hasCompletedOnboarding":true,"theme":"dark","numStartups":5,
 "projects":{"$PWD":{"hasTrustDialogAccepted":true,"hasCompletedProjectOnboarding":true}}}
EOF
echo '{"skipDangerousModePermissionPrompt":true}' > ~/.claude/settings.json
# your own login, if record.sh mounted it
[ -f /creds.json ] && cp /creds.json ~/.claude/.credentials.json

ln -sf /src/bin/clauder.js /tmp/demo-bin/clauder
echo "sk-ant-oat01-demo-alice" | clauder add alice >/dev/null
echo "sk-ant-oat01-demo-bob" | clauder add bob >/dev/null
# notes for the demo accounts
node -e '
const f=process.env.CLAUDER_HOME+"/accounts.json",d=require(f);
d.accounts.alice.note="work";d.accounts.bob.note="side project";
require("fs").writeFileSync(f,JSON.stringify(d,null,2));'
clear
