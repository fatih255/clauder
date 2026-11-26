# Sourced (hidden) at the start of every recording.
# Fake accounts and a stand-in `claude`, so no real email or token ends up in the GIFs.

export CLAUDER_HOME=/tmp/clauder-demo
export PATH="/tmp/demo-bin:$PATH"
export TERM=xterm-256color
export PS1='\[\e[38;2;217;119;87m\]$\[\e[0m\] '
rm -rf "$CLAUDER_HOME" /tmp/demo-bin
mkdir -p /tmp/demo-bin

# stand-in for `claude`: answers `auth status`, otherwise says which login it got
cat > /tmp/demo-bin/claude <<'EOF'
#!/bin/sh
if [ "$1" = auth ] && [ "$2" = status ]; then
  if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
    echo '{"loggedIn":true,"authMethod":"oauth_token"}'
  else
    echo '{"loggedIn":true,"authMethod":"claude.ai","email":"you@example.com","orgName":"Acme Inc","subscriptionType":"team"}'
  fi
  exit 0
fi
echo
if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
  echo "  (demo) claude started with token ...${CLAUDE_CODE_OAUTH_TOKEN##*-} $*"
else
  echo "  (demo) claude started with your own login $*"
fi
echo
EOF
chmod +x /tmp/demo-bin/claude

ln -sf /src/bin/clauder.js /tmp/demo-bin/clauder
echo "sk-ant-oat01-demo-alice" | clauder add alice >/dev/null
echo "sk-ant-oat01-demo-bob" | clauder add bob >/dev/null
# notes for the demo accounts
node -e '
const f=process.env.CLAUDER_HOME+"/accounts.json",d=require(f);
d.accounts.alice.note="work";d.accounts.bob.note="side project";
require("fs").writeFileSync(f,JSON.stringify(d,null,2));'
clear
