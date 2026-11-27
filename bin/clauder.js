#!/usr/bin/env node
// clauder - start Claude Code as different accounts
// Launch Claude Code with different accounts' OAuth tokens. Windows / macOS / Linux.
// No dependencies: uses Node.js built-in modules only.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');

const HOME_DIR = process.env.CLAUDER_HOME || path.join(os.homedir(), '.clauder');
const DB_FILE = path.join(HOME_DIR, 'accounts.json');
const OWN = 'me'; // no token: your normal `claude` login

// ---------- storage ----------

function load() {
  if (!fs.existsSync(DB_FILE)) return { accounts: {} };
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.accounts = db.accounts || {};
    return db;
  } catch (e) {
    die(`could not read ${DB_FILE} (invalid JSON): ${e.message}`);
  }
}

function save(db) {
  fs.mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
  if (process.platform !== 'win32') fs.chmodSync(DB_FILE, 0o600);
}

// ---------- helpers ----------

function die(msg) {
  console.error('error: ' + msg);
  process.exit(1);
}

function validName(name) {
  return /^[a-zA-Z0-9._-]{1,40}$/.test(name || '') && name !== OWN;
}

// ---------- look ----------

// Colors on a real terminal (or with FORCE_COLOR), never when NO_COLOR is set.
const COLOR = (process.stdout.isTTY || !!process.env.FORCE_COLOR) && !process.env.NO_COLOR;
const paint = code => s => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const brand = paint('38;2;217;119;87'); // Claude orange #D97757
const green = paint('32');
const red = paint('31');
const yellow = paint('33');
const bold = paint('1');
const dim = paint('2');

const shade = paint('38;2;140;74;51'); // darker orange for the letter shadows

// "CLAUDER" in block letters with box-drawing shadows. Every row of a letter has the same width.
const LOGO = [
  [' ██████╗', '██╔════╝', '██║     ', '██║     ', '╚██████╗', ' ╚═════╝'], // C
  ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'], // L
  [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'], // A
  ['██╗   ██╗', '██║   ██║', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '], // U
  ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '], // D
  ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'], // E
  ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'], // R
];

function banner() {
  const { version } = require('../package.json');
  const sub = `v${version}  •  start Claude Code as different accounts`;
  const rows = LOGO[0].map((_, r) => LOGO.map(letter => letter[r]).join(''));
  console.log();
  if ((process.stdout.columns || 80) < rows[0].length + 2) {
    // narrow terminal: one-line fallback
    console.log('  ' + brand('✻ ') + bold(brand('clauder')));
  } else {
    for (const row of rows) {
      console.log('  ' + row.replace(/█+/g, m => brand(m)).replace(/[╗║╚═╔╝]+/g, m => shade(m)));
    }
  }
  console.log('\n  ' + dim(sub) + '\n');
}

// A cell is a plain string, or { t: plain text, s: styled text } when colored.
function table(head, rows) {
  const txt = x => (typeof x === 'string' ? x : x.t);
  const fmt = x => (typeof x === 'string' ? x : x.s);
  const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => txt(r[i]).length)));
  const rule = (l, m, r) => brand(l + w.map(n => '─'.repeat(n + 2)).join(m) + r);
  const bar = brand('│');
  const row = cells => bar + cells.map((x, i) => ' ' + fmt(x) + ' '.repeat(w[i] - txt(x).length + 1)).join(bar) + bar;
  console.log(rule('╭', '┬', '╮'));
  console.log(row(head.map(h => ({ t: h, s: bold(h) }))));
  console.log(rule('├', '┼', '┤'));
  rows.forEach(r => console.log(row(r)));
  console.log(rule('╰', '┴', '╯'));
}


function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(question, a => { rl.close(); res(a.trim()); }));
}

// Read input without echoing it.
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    if (!stdin.isTTY) {
      // piped input: read it all
      let buf = '';
      stdin.setEncoding('utf8');
      stdin.on('data', d => (buf += d));
      stdin.on('end', () => { process.stdout.write('\n'); resolve(buf.trim()); });
      return;
    }
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(value.trim());
        } else if (ch === '\u0003') { // Ctrl+C
          stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130);
        } else if (ch === '\u007f' || ch === '\b') {
          if (value.length) { value = value.slice(0, -1); process.stdout.write('\b \b'); }
        } else if (ch >= ' ') {
          value += ch; process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

// ---------- launch claude ----------

function hasExe() {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  return dirs.some(d => d && fs.existsSync(path.join(d, 'claude.exe')));
}

// ---------- bypass permissions ----------

const BYPASS_FLAG = '--dangerously-skip-permissions';

// Per-account switch. Token accounts keep it on their entry, your own login under "me".
function getBypass(db, name) {
  const entry = name === OWN ? db.me : db.accounts[name];
  return !!(entry && entry.bypass);
}

function setBypass(db, name, on) {
  const entry = name === OWN ? (db.me = db.me || {}) : db.accounts[name];
  if (on) entry.bypass = true;
  else delete entry.bypass;
}

// ---------- sessions running in the background ----------

// A session that runs in the background keeps the account it was started with, and claude
// refuses to resume it from another process. Before resuming we look for that and offer to stop it.

function claudeSync(args) {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  return spawnSync('claude', args, {
    env, encoding: 'utf8', shell: process.platform === 'win32' && !hasExe(),
  });
}

const DONE_STATES = ['stopped', 'completed', 'done', 'failed', 'killed', 'exited'];

// Background sessions that are still alive, from `claude agents --json`. [] if that fails.
const backgroundSessions = () => activeSessions().filter(s => s.kind === 'background');

const samePath = (a, b) => {
  const norm = p => path.resolve(p || '').replace(/[\\/]+$/, '');
  return process.platform === 'win32' || process.platform === 'darwin'
    ? norm(a).toLowerCase() === norm(b).toLowerCase()
    : norm(a) === norm(b);
};

// Where claude keeps this folder's conversations: ~/.claude/projects/<cwd with non-alphanumerics as ->
const projectDir = cwd => path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));

// This folder's conversation files, newest first: [{ id, file, mtime }]
function sessionFiles(cwd) {
  const dir = projectDir(cwd);
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))
      .map(f => ({ id: f.slice(0, -'.jsonl'.length), file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch { return []; }
}

// Newest conversation in this folder, which is what `claude -c` continues.
function lastSessionId(cwd) {
  const files = sessionFiles(cwd);
  return files.length ? files[0].id : null;
}

// Read up to `size` bytes from the start (or the end) of a file.
function readPart(file, size, fromEnd) {
  const fd = fs.openSync(file, 'r');
  try {
    const len = fs.fstatSync(fd).size;
    const n = Math.min(size, len);
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, fromEnd ? len - n : 0);
    return buf.toString('utf8');
  } finally { fs.closeSync(fd); }
}

const parseLines = text => text.split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// What the picker shows for a conversation: its title, the folder and git branch it ran in.
// Title is the name it was given, else claude's own title, else its first message.
// Returns null for files with no message typed by a person (nothing to resume).
function sessionMeta(file) {
  try {
    const tail = parseLines(readPart(file, 64 * 1024, true));
    let custom = null, ai = null;
    for (const o of tail) {
      if (o.type === 'custom-title' && o.customTitle) custom = o.customTitle;
      if (o.type === 'ai-title' && o.aiTitle) ai = o.aiTitle;
    }
    const head = parseLines(readPart(file, 64 * 1024, false));
    const first = head.find(o => o.type === 'user' && !o.isSidechain && !o.isMeta && textOf(o));
    if (!first && !custom && !ai) return null;
    const withCwd = [...tail].reverse().find(o => o.cwd) || head.find(o => o.cwd) || {};
    return {
      title: (custom || ai || textOf(first)).replace(/\s+/g, ' ').trim(),
      cwd: withCwd.cwd || null,
      branch: withCwd.gitBranch || null,
    };
  } catch { return null; }
}

function textOf(entry) {
  const c = entry && entry.message && entry.message.content;
  const text = typeof c === 'string' ? c
    : Array.isArray(c) ? c.filter(p => p.type === 'text').map(p => p.text).join(' ') : '';
  return text && !text.startsWith('<') ? text : ''; // skip <command-name> and other tool-made entries
}

function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  const n = (v, unit) => `${v} ${unit}${v === 1 ? '' : 's'} ago`;
  if (s < 60) return 'just now';
  if (s < 3600) return n(Math.floor(s / 60), 'minute');
  if (s < 86400) return n(Math.floor(s / 3600), 'hour');
  return n(Math.floor(s / 86400), 'day');
}

function fileSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace(/\.0$/, '') + 'KB';
  return (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '') + 'MB';
}

// Active sessions of every kind from `claude agents --json`, so the list can mark them.
function activeSessions() {
  const r = claudeSync(['agents', '--json']);
  if (r.error || r.status !== 0) return [];
  try {
    return JSON.parse(r.stdout.slice(r.stdout.indexOf('['))).filter(s => s.sessionId && !DONE_STATES.includes(s.state));
  } catch { return []; }
}

// Conversation files of this folder, or of every folder, newest first.
function conversationFiles(all) {
  if (!all) return sessionFiles(process.cwd());
  const root = path.join(os.homedir(), '.claude', 'projects');
  let dirs = [];
  try { dirs = fs.readdirSync(root); } catch { return []; }
  const files = [];
  for (const d of dirs) {
    let names = [];
    try { names = fs.readdirSync(path.join(root, d)); } catch { continue; }
    for (const f of names) {
      if (!f.endsWith('.jsonl')) continue;
      const file = path.join(root, d, f);
      try { files.push({ id: f.slice(0, -'.jsonl'.length), file, mtime: fs.statSync(file).mtimeMs }); } catch {}
    }
  }
  return files.sort((a, b) => b.mtime - a.mtime);
}

const MAX_LISTED = 200;

// Conversations for the picker: [{ id, file, mtime, size, title, cwd, branch, bg, open }]
function listConversations(all, active) {
  const out = [];
  for (const f of conversationFiles(all)) {
    if (out.length >= MAX_LISTED) break;
    const meta = sessionMeta(f.file);
    if (!meta) continue;
    let size = 0;
    try { size = fs.statSync(f.file).size; } catch {}
    const a = active.find(s => s.sessionId === f.id);
    out.push({
      ...f, ...meta, size,
      cwd: meta.cwd || process.cwd(),
      bg: a && a.kind === 'background' ? a : null,
      open: a && a.kind !== 'background' ? a : null,
    });
  }
  return out;
}

const NEW = Symbol('new');
const BACK = Symbol('back');

// Two-line list in the style of claude's own resume screen, with a search box.
// Shows the conversations of every project, newest first.
// Resolves to NEW, BACK (esc) or a conversation from listConversations().
function pickSession(name, { canGoBack }) {
  return new Promise(resolve => {
    const out = process.stdout;
    const list = listConversations(true, activeSessions());
    const st = { query: '', sel: 0, top: 0 };
    let drawn = 0;

    const matches = () => {
      const q = st.query.toLowerCase();
      const hit = c => [c.title, c.branch, path.basename(c.cwd)].some(x => x && x.toLowerCase().includes(q));
      return q ? list.filter(hit) : [NEW, ...list];
    };

    const render = () => {
      const cols = out.columns || 80;
      const rows = out.rows || 24;
      const items = matches();
      st.sel = Math.min(st.sel, Math.max(0, items.length - 1));
      const boxW = Math.max(20, Math.min(cols - 2, 100));
      const search = fitWidth('⌕ ' + (st.query ? st.query + brand('▏') : dim('Search…')), boxW - 4);
      const head = [
        bold(brand(`Start claude as ${name}`)),
        dim('╭' + '─'.repeat(boxW - 2) + '╮'),
        dim('│ ') + search + ' '.repeat(Math.max(0, boxW - 4 - visWidth(search))) + dim(' │'),
        dim('╰' + '─'.repeat(boxW - 2) + '╯'),
        '  ' + dim('all projects · new conversations start in ' + path.basename(process.cwd())),
        '',
      ];
      const keys = ['Type to search', 'Enter to start', `Esc to ${st.query ? 'clear' : canGoBack ? 'go back' : 'close'}`];
      const help = [''];
      for (const k of keys) { // wrap the key help instead of cutting it
        const last = help.length - 1;
        if (help[last] && visWidth(help[last] + ' · ' + k) > cols - 1) help.push(k);
        else help[last] = help[last] ? help[last] + ' · ' + k : k;
      }
      const foot = ['', ...help.map(l => dim(l))];
      // each conversation takes 3 rows (title, details, gap); keep the selection on screen
      const fit = Math.max(1, Math.floor((rows - head.length - foot.length - 1) / 3));
      if (st.sel < st.top) st.top = st.sel;
      if (st.sel >= st.top + fit) st.top = st.sel - fit + 1;
      st.top = Math.max(0, Math.min(st.top, Math.max(0, items.length - fit)));

      const body = [];
      if (!items.length) body.push('  ' + dim(st.query ? 'No conversations match.' : 'No conversations here yet.'));
      items.slice(st.top, st.top + fit).forEach((c, k) => {
        const on = st.top + k === st.sel;
        const mark = on ? brand('❯ ') : '  ';
        if (c === NEW) {
          body.push(mark + (on ? bold(brand('New conversation')) : 'New conversation'));
          body.push('  ' + dim('start fresh'));
        } else {
          body.push(mark + (on ? bold(brand(c.title)) : c.title));
          const bits = [ago(c.mtime)];
          if (c.bg) bits.push(yellow('bg · running, will be stopped'));
          else if (c.open) bits.push(red('open in another terminal'));
          bits.push(samePath(c.cwd, process.cwd()) ? path.basename(c.cwd) : brand(path.basename(c.cwd)));
          if (c.branch) bits.push(c.branch);
          bits.push(fileSize(c.size));
          body.push('  ' + bits.map(b => dim(b)).join(dim(' · ')));
        }
        body.push('');
      });
      const more = items.length - (st.top + fit);
      if (more > 0) body.push('  ' + dim(`↓ ${more} more`));
      return [...head, ...body, ...foot];
    };

    const draw = () => {
      if (drawn) out.write(`\x1b[${drawn}A\x1b[J`);
      const lines = render().map(l => fitWidth(l, (out.columns || 80) - 1));
      out.write(lines.join('\n') + '\n');
      drawn = lines.length;
    };

    const done = value => {
      if (drawn) out.write(`\x1b[${drawn}A\x1b[J`);
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      out.write('\x1b[?25h');
      resolve(value);
    };

    const onKey = (str, key = {}) => {
      const items = matches();
      if (key.ctrl && key.name === 'c') return done(BACK);
      switch (key.name) {
        case 'up': st.sel = (st.sel - 1 + items.length) % Math.max(1, items.length); return draw();
        case 'down': st.sel = (st.sel + 1) % Math.max(1, items.length); return draw();
        case 'pageup': st.sel = Math.max(0, st.sel - 5); return draw();
        case 'pagedown': st.sel = Math.min(items.length - 1, st.sel + 5); return draw();
        case 'home': st.sel = 0; return draw();
        case 'end': st.sel = Math.max(0, items.length - 1); return draw();
        case 'return': case 'enter': return items.length ? done(items[st.sel]) : undefined;
        case 'escape':
          if (st.query) { st.query = ''; st.sel = 0; return draw(); }
          return done(BACK);
        case 'backspace':
          st.query = st.query.slice(0, -1); st.sel = 0; return draw();
      }
      if (str && !key.ctrl && !key.meta && str >= ' ') { st.query += str; st.sel = 0; return draw(); }
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.on('exit', () => out.write('\x1b[?25h'));
    out.write('\x1b[?25l');
    process.stdin.on('keypress', onKey);
    draw();
  });
}

// Ask which conversation to start. Returns { args, cwd } for launch(), or BACK if esc was pressed.
async function chooseConversation(name, args, { canGoBack }) {
  const pick = await pickSession(name, { canGoBack });
  if (pick === BACK) return BACK;
  if (pick === NEW) return { args };
  if (pick.open) die(`"${pick.title}" is open in another terminal. Close it there first, then try again.`);
  if (!fs.existsSync(pick.cwd)) die(`the folder of "${pick.title}" no longer exists: ${pick.cwd}`);
  if (pick.bg) stopSession(pick.bg);
  return { args: ['--resume', pick.id, ...args], cwd: pick.cwd };
}

// What the claude args ask to resume: { kind: 'id', value } | { kind: 'pick' } | { kind: 'last' } | null
function resumeTarget(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--resume=')) return { kind: 'id', value: a.slice(9), index: i };
    if (a === '-r' || a === '--resume') {
      const next = args[i + 1];
      return next && !next.startsWith('-') ? { kind: 'id', value: next, index: i } : { kind: 'pick', index: i };
    }
    if (a === '-c' || a === '--continue') return { kind: 'last', index: i };
  }
  return null;
}

function matchSession(sessions, value) {
  const v = value.toLowerCase();
  return sessions.find(s => s.sessionId === value || s.id === value
    || (v.length >= 8 && s.sessionId.startsWith(v)) || (s.name && s.name.toLowerCase() === v));
}

function stopSession(s) {
  process.stderr.write(dim(`stopping ${s.id} …`));
  const r = claudeSync(['stop', s.id]);
  // wait until it is gone from the list, at most ~10 s
  for (let i = 0; i < 20 && backgroundSessions().some(x => x.sessionId === s.sessionId); i++) {
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},500)']);
  }
  process.stderr.write('\r\x1b[K');
  if (r.status !== 0) die(`could not stop ${s.id}: ${(r.stderr || r.stdout || '').trim()}`);
  console.error(green('✔ ') + `stopped "${s.name || s.id}"`);
}

const label = s => `"${s.name || s.id}"` + dim(` (${s.id})`);

// Yes/no on one key: Enter or y = yes, Esc, n or Ctrl+C = no.
function confirmKey(question) {
  return new Promise(resolve => {
    process.stderr.write(question + dim('  enter yes · esc cancel '));
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onKey = (str, key = {}) => {
      const yes = key.name === 'return' || key.name === 'enter' || key.name === 'y';
      const no = key.name === 'escape' || key.name === 'n' || (key.ctrl && key.name === 'c');
      if (!yes && !no) return;
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write('\n');
      resolve(yes);
    };
    process.stdin.on('keypress', onKey);
  });
}

// Returns { args, cwd } for launch(), after stopping a background session if the user agrees.
async function freeSession(name, args) {
  const target = resumeTarget(args);
  if (!target) return { args };
  const tty = process.stdin.isTTY && process.stdout.isTTY;
  const cwd = process.cwd();

  if (target.kind === 'pick') {
    // `-r` with no id: our own list of this folder's conversations instead of claude's picker
    if (!tty) return { args };
    const rest = args.filter((_, i) => i !== target.index);
    const out = await chooseConversation(name, rest, { canGoBack: false });
    if (out === BACK) process.exit(0);
    return out;
  }

  const sessions = backgroundSessions();
  const s = target.kind === 'id'
    ? matchSession(sessions, target.value)
    : sessions.find(x => x.sessionId === lastSessionId(cwd));
  if (!s) return { args };
  console.error(yellow('⚠ ') + `${label(s)} is running in the background, under the account it was started with.`);
  if (!tty) die(`stop it first with: claude stop ${s.id}`);
  if (!(await confirmKey(`  Stop it and open it here as ${bold(name)}?`))) process.exit(0);
  stopSession(s);
  return { args };
}

// `cwd`: start claude in that folder (a conversation from another project resumes only there).
async function launch(name, claudeArgs, { skipCheck, cwd } = {}) {
  if (name !== OWN && !load().accounts[name]) die(`no account named "${name}". See: clauder list`);
  if (!skipCheck) ({ args: claudeArgs, cwd } = await freeSession(name, claudeArgs));
  const env = { ...process.env };
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  const db = load();
  if (name !== OWN) {
    const acc = db.accounts[name];
    if (!acc) die(`no account named "${name}". See: clauder list`);
    env.CLAUDE_CODE_OAUTH_TOKEN = acc.token;
    acc.lastUsedAt = new Date().toISOString();
    save(db);
  }
  // add the flag unless the caller already chose a permission mode
  const chosen = claudeArgs.some(a => a === BYPASS_FLAG || a.startsWith('--permission-mode'));
  if (getBypass(db, name) && !chosen) claudeArgs = [BYPASS_FLAG, ...claudeArgs];
  const where = cwd && !samePath(cwd, process.cwd()) ? dim(`  in ${cwd}`) : '';
  console.error(`> claude (${name})` + (claudeArgs.includes(BYPASS_FLAG) ? yellow('  ⚠ bypass permissions on') : '') + where);
  const child = spawn('claude', claudeArgs, {
    stdio: 'inherit',
    env,
    cwd: cwd || process.cwd(),
    shell: process.platform === 'win32' && !hasExe(), // npm installs use claude.cmd
  });
  child.on('error', e => die(`could not start claude: ${e.message}`));
  child.on('exit', code => process.exit(code ?? 0));
}

// Ask `claude auth status --json` how an account looks. Returns null if claude is missing.
function authStatus(token) {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  if (token) env.CLAUDE_CODE_OAUTH_TOKEN = token;
  const r = spawnSync('claude', ['auth', 'status', '--json'], {
    env, encoding: 'utf8', shell: process.platform === 'win32' && !hasExe(),
  });
  if (r.error) return null;
  try { return JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { return {}; }
}

// ---------- commands ----------

async function cmdAdd(name) {
  if (!name) name = await ask('Account name (e.g. alice): ');
  if (!validName(name)) die(`invalid name. Use letters, digits, . _ - ("${OWN}" is reserved).`);
  const db = load();
  if (db.accounts[name]) {
    const ok = await ask(`"${name}" already exists. Replace its token? (y/n): `);
    if (!/^y/i.test(ok)) return console.log('cancelled.');
  }
  const token = await askHidden('Token (output of `claude setup-token`): ');
  if (!token) die('empty token.');
  if (!token.startsWith('sk-ant-')) die('this does not look like a Claude token (should start with sk-ant-).');
  const note = process.stdin.isTTY ? await ask('Note (optional, Enter to skip): ') : '';
  db.accounts[name] = { token, addedAt: new Date().toISOString(), ...(note ? { note } : {}) };
  save(db);
  console.log(`added: ${name}  ->  clauder ${name}`);
}

async function cmdBypass(name, value) {
  if (!name) {
    if (!(process.stdin.isTTY && process.stdout.isTTY)) die('usage: clauder bypass <name> [on|off]');
    const db = load();
    const names = [OWN, ...Object.keys(db.accounts)];
    const checked = await checkBypass(names, db);
    if (checked === null) return console.log(dim('cancelled, nothing changed.'));
    names.forEach(n => setBypass(db, n, checked.has(n)));
    save(db);
    const on = names.filter(n => checked.has(n));
    return console.log('bypass permissions on: ' + (on.length ? yellow(on.join(', ')) : dim('none')));
  }
  const db = load();
  if (name !== OWN && !db.accounts[name]) die(`no account named "${name}". See: clauder list`);
  if (value && value !== 'on' && value !== 'off') die('use on or off.');
  const on = value ? value === 'on' : !getBypass(db, name);
  setBypass(db, name, on);
  save(db);
  console.log(`${name}: bypass permissions ` + (on ? yellow('on') + dim(`  (claude starts with ${BYPASS_FLAG})`) : 'off'));
}

function cmdList() {
  const db = load();
  const accs = db.accounts;
  const names = [OWN, ...Object.keys(accs)];
  const rows = names.map(name => {
    const own = name === OWN;
    const s = authStatus(own ? null : accs[name].token);
    const state = s === null ? { t: '? claude not found', s: yellow('? claude not found') }
      : s.loggedIn ? { t: '✔', s: green('✔') }
      : { t: '✘ not logged in', s: red('✘ not logged in') };
    const details = own
      ? [s && s.email, s && s.orgName, s && s.subscriptionType]
      : [accs[name].note];
    return [
      { t: name, s: bold(name) },
      own ? 'your own login (no token)' : 'token',
      state,
      getBypass(db, name) ? { t: '⚠ on', s: yellow('⚠ on') } : { t: 'off', s: dim('off') },
      details.filter(Boolean).join('  '),
    ];
  });
  banner();
  table(['Account', 'Type', 'Status', 'Bypass', 'Details'], rows);
  if (names.length === 1) console.log(dim('\n  no token accounts yet. Add one with: clauder add <name>'));
}

async function cmdRemove(name) {
  const db = load();
  if (!name || !db.accounts[name]) die(`no account named "${name || ''}".`);
  const ok = await ask(`Remove "${name}"? (y/n): `);
  if (!/^y/i.test(ok)) return console.log('cancelled.');
  delete db.accounts[name];
  save(db);
  console.log('removed: ' + name);
}

function cmdRename(from, to) {
  const db = load();
  if (!db.accounts[from]) die(`no account named "${from || ''}".`);
  if (!validName(to)) die('invalid new name.');
  if (db.accounts[to]) die(`"${to}" already exists.`);
  db.accounts[to] = db.accounts[from];
  delete db.accounts[from];
  save(db);
  console.log(`${from} -> ${to}`);
}

// ---------- interactive screens ----------

// Columns a character takes: 2 for East Asian wide characters and emoji, and for ⚠, which
// Windows Terminal draws two columns wide; 1 for everything else.
function charWidth(ch) {
  const c = ch.codePointAt(0);
  if (c === 0x26a0) return 2;
  return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3)
    || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60)
    || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) ? 2 : 1;
}

// Visible columns of a line with color codes.
const visWidth = line => [...line.replace(/\x1b\[[0-9;]*m/g, '')].reduce((n, ch) => n + charWidth(ch), 0);

// Cut a line with color codes to at most `max` visible columns.
function fitWidth(line, max) {
  let width = 0, out = '', cut = false;
  for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
    if (part.startsWith('\x1b[')) { out += part; continue; }
    for (const ch of part) {
      const w = charWidth(ch);
      if (width + w > max) { cut = true; break; }
      width += w; out += ch;
    }
    if (cut) break;
  }
  return cut && COLOR ? out + '\x1b[0m' : out;
}

// Redraws render() in place and feeds keys to onKey(str, key, state) until it calls state.done(value).
// state.sel is the highlighted row; arrows, j/k, home/end and 1-9 move it.
function interactive(count, render, onKey) {
  return new Promise(resolve => {
    const out = process.stdout;
    const state = { sel: 0 };
    let drawn = 0;

    const draw = () => {
      if (drawn) out.write(`\x1b[${drawn}A\x1b[J`); // back to the top of the screen, clear below
      // A line wider than the terminal wraps onto two rows, and the next redraw would not go
      // up far enough (the old screen stays and the title repeats). So no line may wrap.
      const lines = render(state).map(l => fitWidth(l, (out.columns || 80) - 1));
      out.write(lines.join('\n') + '\n');
      drawn = lines.length;
    };
    state.redraw = draw;
    state.done = value => {
      if (drawn) out.write(`\x1b[${drawn}A\x1b[J`); // erase the screen so the next one starts clean
      process.stdin.removeListener('keypress', handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      out.write('\x1b[?25h'); // show cursor
      resolve(value);
    };
    const handler = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') return state.done(null);
      switch (key.name) {
        case 'up': case 'k': state.sel = (state.sel - 1 + count) % count; return draw();
        case 'down': case 'j': state.sel = (state.sel + 1) % count; return draw();
        case 'home': state.sel = 0; return draw();
        case 'end': state.sel = count - 1; return draw();
        case 'escape': case 'q': return state.done(null);
      }
      if (/^[1-9]$/.test(str || '') && +str <= count) { state.sel = +str - 1; return draw(); }
      onKey(str, key, state);
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.on('exit', () => out.write('\x1b[?25h'));
    out.write('\x1b[?25l'); // hide cursor while the screen is up
    process.stdin.on('keypress', handler);
    draw();
  });
}

function accountHint(db, n, max) {
  let hint = n === OWN ? 'your own login (no token)' : 'token' + (db.accounts[n].note ? ' · ' + db.accounts[n].note : '');
  return hint.length > max ? hint.slice(0, max - 1) + '…' : hint;
}

// Arrow-key picker in the style of Claude Code. Resolves to a name, ADD, or null (quit).
const ADD = Symbol('add');
function pickAccount(names, db) {
  const nameW = Math.max(...names.map(n => n.length));
  const maxHint = Math.max(20, (process.stdout.columns || 80) - nameW - 12);
  const render = ({ sel }) => [
    bold('Which account?'), '',
    ...names.map((n, k) => {
      const label = `${k + 1}. ${n.padEnd(nameW)}`;
      const hint = dim(accountHint(db, n, maxHint));
      const tag = getBypass(db, n) ? '  ' + yellow('⚠ bypass') : '';
      return (k === sel ? brand('❯ ') + bold(brand(label)) : '  ' + label) + '  ' + hint + tag;
    }),
    '', dim('↑/↓ move · enter start · b bypass permissions on/off · a add account · esc quit'),
  ];
  return interactive(names.length, render, (str, key, s) => {
    if (key.name === 'return' || key.name === 'enter') return s.done(names[s.sel]);
    if (key.name === 'a') return s.done(ADD);
    if (key.name === 'b') {
      setBypass(db, names[s.sel], !getBypass(db, names[s.sel]));
      save(db);
      s.redraw();
    }
  });
}

// Checkbox list of every account. Resolves to the set of checked names, or null if cancelled.
function checkBypass(names, db) {
  const checked = new Set(names.filter(n => getBypass(db, n)));
  const nameW = Math.max(...names.map(n => n.length));
  const maxHint = Math.max(20, (process.stdout.columns || 80) - nameW - 14);
  const render = ({ sel }) => [
    bold('Bypass permissions'),
    dim(`Checked accounts start claude with ${BYPASS_FLAG}.`), '',
    ...names.map((n, k) => {
      const box = checked.has(n) ? yellow('[✔]') : dim('[ ]');
      const label = n.padEnd(nameW);
      const hint = dim(accountHint(db, n, maxHint));
      return (k === sel ? brand('❯ ') + box + ' ' + bold(brand(label)) : '  ' + box + ' ' + label) + '  ' + hint;
    }),
    '', dim('↑/↓ move · space check/uncheck · enter save · esc cancel'),
  ];
  return interactive(names.length, render, (str, key, s) => {
    if (key.name === 'space') {
      const n = names[s.sel];
      if (checked.has(n)) checked.delete(n); else checked.add(n);
      return s.redraw();
    }
    if (key.name === 'return' || key.name === 'enter') return s.done(checked);
  });
}

async function cmdMenu() {
  const db = load();
  const accs = db.accounts;
  const names = [OWN, ...Object.keys(accs)];

  if (process.stdin.isTTY && process.stdout.isTTY) {
    banner();
    console.log();
    for (;;) {
      const choice = await pickAccount(names, db);
      if (choice === null) return;
      if (choice === ADD) return cmdAdd();
      const picked = await chooseConversation(choice, [], { canGoBack: true });
      if (picked === BACK) continue; // esc: back to the account list
      return launch(choice, picked.args, { skipCheck: true, cwd: picked.cwd });
    }
  }

  // Not a terminal (piped input): numbered prompt.
  const hasNotes = names.some(n => n !== OWN && accs[n].note);
  banner();
  table(['#', 'Account', 'Type', ...(hasNotes ? ['Note'] : [])], names.map((n, i) => [
    { t: String(i + 1), s: brand(String(i + 1)) },
    { t: n, s: bold(n) },
    n === OWN ? 'your own login (no token)' : 'token',
    ...(hasNotes ? [n === OWN ? '' : accs[n].note || ''] : []),
  ]));
  console.log(`  ${brand('a')}) add an account   ${brand('q')}) quit\n`);
  const pick = (await ask('Choice: ')).toLowerCase();
  if (pick === 'q' || pick === '') return;
  if (pick === 'a') return cmdAdd();
  const chosen = names[parseInt(pick, 10) - 1] || (names.includes(pick) ? pick : null);
  if (!chosen) die('invalid choice.');
  launch(chosen, []);
}

function help() {
  console.log(`clauder - start Claude Code as different accounts

  clauder                        pick an account, then a new or earlier conversation
  clauder <name> [claude args]   start claude with that account   (e.g. clauder alice -c)
  clauder <name> -r              pick a conversation to continue as that account
  clauder ${OWN} [claude args]       start claude with your own login
  clauder add [name]             add a token (hidden input)
  clauder list                   list accounts and their login status
  clauder bypass                 check which accounts start with ${BYPASS_FLAG}
  clauder bypass <name> [on|off] same for one account (flips it without on/off)
  clauder remove <name>          remove an account
  clauder rename <old> <new>     rename an account
  clauder path                   print the accounts.json path

To get a token, the account owner runs on their machine: claude setup-token
Accounts file: ${DB_FILE}`);
}

// ---------- entry point ----------

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case undefined: return cmdMenu();
    case 'add': return cmdAdd(rest[0]);
    case 'list': case 'ls': return cmdList();
    case 'bypass': return cmdBypass(rest[0], rest[1]);
    case 'remove': case 'rm': return cmdRemove(rest[0]);
    case 'rename': case 'mv': return cmdRename(rest[0], rest[1]);
    case 'path': return console.log(DB_FILE);
    case 'help': case '-h': case '--help': return help();
    default:
      if (cmd === OWN || load().accounts[cmd]) return launch(cmd, rest);
      die(`unknown command or account: "${cmd}". See: clauder help`);
  }
})();
