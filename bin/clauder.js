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

function launch(name, claudeArgs) {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  if (name !== OWN) {
    const db = load();
    const acc = db.accounts[name];
    if (!acc) die(`no account named "${name}". See: clauder list`);
    env.CLAUDE_CODE_OAUTH_TOKEN = acc.token;
    acc.lastUsedAt = new Date().toISOString();
    save(db);
  }
  console.error(`> claude (${name})`);
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

function cmdList() {
  const accs = load().accounts;
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
      details.filter(Boolean).join('  '),
    ];
  });
  banner();
  table(['Account', 'Type', 'Status', 'Details'], rows);
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

// Arrow-key picker in the style of Claude Code. Resolves to a name, ADD, or null (quit).
const ADD = Symbol('add');
function pickAccount(names, accs) {
  return new Promise(resolve => {
    const out = process.stdout;
    const nameW = Math.max(...names.map(n => n.length));
    const maxHint = Math.max(20, (out.columns || 80) - nameW - 12);
    let sel = 0;
    let drawn = 0;

    const render = () => {
      const rows = names.map((n, k) => {
        let hint = n === OWN ? 'your own login (no token)' : 'token' + (accs[n].note ? ' · ' + accs[n].note : '');
        if (hint.length > maxHint) hint = hint.slice(0, maxHint - 1) + '…';
        const label = `${k + 1}. ${n.padEnd(nameW)}`;
        return k === sel
          ? brand('❯ ') + bold(brand(label)) + '  ' + dim(hint)
          : '  ' + label + '  ' + dim(hint);
      });
      return [bold('Which account?'), '', ...rows, '', dim('↑/↓ move · enter start · a add account · esc quit')];
    };
    const draw = () => {
      if (drawn) out.write(`\x1b[${drawn}A\x1b[J`); // back to the top of the menu, clear below
      const lines = render();
      out.write(lines.join('\n') + '\n');
      drawn = lines.length;
    };
    const finish = value => {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      out.write('\x1b[?25h'); // show cursor
      resolve(value);
    };
    const onKey = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(null);
      switch (key.name) {
        case 'up': case 'k': sel = (sel - 1 + names.length) % names.length; return draw();
        case 'down': case 'j': sel = (sel + 1) % names.length; return draw();
        case 'home': sel = 0; return draw();
        case 'end': sel = names.length - 1; return draw();
        case 'return': case 'enter': return finish(names[sel]);
        case 'escape': case 'q': return finish(null);
        case 'a': return finish(ADD);
      }
      if (/^[1-9]$/.test(str || '') && +str <= names.length) { sel = +str - 1; return draw(); }
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.on('exit', () => out.write('\x1b[?25h'));
    out.write('\x1b[?25l'); // hide cursor while picking
    process.stdin.on('keypress', onKey);
    draw();
  });
}

async function cmdMenu() {
  const accs = load().accounts;
  const names = [OWN, ...Object.keys(accs)];

  if (process.stdin.isTTY && process.stdout.isTTY) {
    banner();
    console.log();
    const choice = await pickAccount(names, accs);
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
    case 'remove': case 'rm': return cmdRemove(rest[0]);
    case 'rename': case 'mv': return cmdRename(rest[0], rest[1]);
    case 'path': return console.log(DB_FILE);
    case 'help': case '-h': case '--help': return help();
    default:
      if (cmd === OWN || load().accounts[cmd]) return launch(cmd, rest);
      die(`unknown command or account: "${cmd}". See: clauder help`);
  }
})();
