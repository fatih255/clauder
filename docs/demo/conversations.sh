# Sourced (hidden) after setup.sh by the tapes that show the conversation list.
#
# Makes real conversations with the real Claude Code, so the list shows what it would on your
# machine: two finished ones in different projects, and one alice left running in the background.
# The prompts are short and use Haiku, so this costs very little of the demo token's usage.

for p in my-app docs-site api-server; do
  mkdir -p ~/projects/$p
  # git repos on main, so the list shows a branch like it would for real projects
  git -C ~/projects/$p init -q -b main 2>/dev/null
  git -C ~/projects/$p -c user.name=demo -c user.email=demo@example.com commit -q --allow-empty -m init 2>/dev/null
done
# trust the extra project folders too, so claude opens them without asking
node -e '
const f=require("os").homedir()+"/.claude.json",c=require(f),h=require("os").homedir();
for (const p of ["docs-site","api-server"]) c.projects[h+"/projects/"+p]={hasTrustDialogAccepted:true,hasCompletedProjectOnboarding:true};
require("fs").writeFileSync(f,JSON.stringify(c));'

ask() { # ask <folder> <prompt>: one finished conversation in that project, as alice
  (cd ~/projects/"$1" && CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-demo-alice \
    claude -p --model haiku "$2" >/dev/null 2>&1)
}
ask docs-site "Write a two-line release note for version 2.0 of a docs site"
ask api-server "In one sentence, when should a REST API return 409 instead of 400?"

# pretend those were earlier in the week
touch -d '2 days ago' ~/.claude/projects/*docs-site*/*.jsonl
touch -d '5 hours ago' ~/.claude/projects/*api-server*/*.jsonl

# alice's conversation keeps running in the background, under alice's account. Started with
# claude itself: `clauder alice --bg` refuses, because the faked `auth status` above says a login
# is saved here, and background sessions would use that login instead of alice's token.
(cd ~/projects/my-app && CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-demo-alice \
  claude --bg --model haiku "In two sentences, what is a race condition?" >/dev/null 2>&1)
# wait until it has answered, so the conversation has some history to show
for _ in $(seq 60); do
  claude agents --json 2>/dev/null | grep -q '"state": "done"' && break
  sleep 1
done
clear
