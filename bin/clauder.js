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

function launch(name, claudeArgs) {
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
  console.error(`> claude (${name})` + (claudeArgs.includes(BYPASS_FLAG) ? yellow('  ⚠ bypass permissions on') : ''));
  const child = spawn('claude', claudeArgs, {
    stdio: 'inherit',
    env,
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

// Redraws render() in place and feeds keys to onKey(str, key, state) until it calls state.done(value).
// state.sel is the highlighted row; arrows, j/k, home/end and 1-9 move it.
function interactive(count, render, onKey) {
  return new Promise(resolve => {
    const out = process.stdout;
    const state = { sel: 0 };
    let drawn = 0;

    const draw = () => {
      if (drawn) out.write(`\x1b[${drawn}A\x1b[J`); // back to the top of the screen, clear below
      const lines = render(state);
      out.write(lines.join('\n') + '\n');
      drawn = lines.length;
    };
    state.redraw = draw;
    state.done = value => {
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
    const choice = await pickAccount(names, db);
    if (choice === null) return;
    if (choice === ADD) return cmdAdd();
    return launch(choice, []);
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

  clauder                        pick an account from a menu and start claude
  clauder <name> [claude args]   start claude with that account   (e.g. clauder alice -c)
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
