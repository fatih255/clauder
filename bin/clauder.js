#!/usr/bin/env node
// clauder - start Claude Code as different accounts
// Launch Claude Code with different accounts' OAuth tokens. Windows / macOS / Linux.
// No dependencies: uses Node.js built-in modules only.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const HOME_DIR = process.env.CLAUDER_HOME || path.join(os.homedir(), '.clauder');
const DB_FILE = path.join(HOME_DIR, 'accounts.json');
const OWN = 'me'; // no token: your normal `claude` login
const TOKEN_LIFETIME_DAYS = 365; // `claude setup-token` tokens last about a year

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

function daysSince(iso) {
  return Math.floor((Date.now() - Date.parse(iso)) / 86400000);
}

function ageText(acc) {
  if (!acc || !acc.addedAt) return '';
  const left = TOKEN_LIFETIME_DAYS - daysSince(acc.addedAt);
  if (left <= 0) return '(may have expired)';
  if (left <= 30) return `(~${left} days left, consider renewing)`;
  return `(~${left} days left)`;
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
  const names = Object.keys(accs);
  console.log(`  ${OWN.padEnd(14)} your own login (no token)`);
  for (const n of names) {
    const a = accs[n];
    console.log(`  ${n.padEnd(14)} ${ageText(a)}${a.note ? '  - ' + a.note : ''}`);
  }
  if (!names.length) console.log('\n  no accounts yet. Add one with: clauder add <name>');
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

async function cmdMenu() {
  const accs = load().accounts;
  const names = [OWN, ...Object.keys(accs)];
  console.log('Which account?\n');
  names.forEach((n, i) => {
    console.log(`  ${i + 1}) ${n} ${n === OWN ? '(your own login)' : ageText(accs[n])}`);
  });
  console.log('  a) add an account');
  console.log('  q) quit\n');
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
  clauder list                   list accounts
  clauder remove <name>          remove an account
  clauder rename <old> <new>     rename an account
  clauder status [name]          show that account's auth status
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
    case 'status': return launch(rest[0] || OWN, ['auth', 'status']);
    case 'path': return console.log(DB_FILE);
    case 'help': case '-h': case '--help': return help();
    default:
      if (cmd === OWN || load().accounts[cmd]) return launch(cmd, rest);
      die(`unknown command or account: "${cmd}". See: clauder help`);
  }
})();
