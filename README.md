# clauder

Launch Claude Code with different accounts' OAuth tokens. Your normal `claude` login is
untouched: the token is passed only to the `claude` process `clauder` starts.

Single file, no dependencies: it uses Node.js built-in modules only.
Works on Windows, macOS and Linux.

## Install

Requires Node.js 18+.

```sh
cd clauder
npm link        # puts the `clauder` command on your PATH (downloads nothing)
```

Uninstall: `npm unlink -g clauder`

## Usage

```sh
clauder                    # menu: pick an account, claude starts
clauder alice              # start claude as alice
clauder alice -c           # any claude arguments are passed through
clauder me                 # start claude with your own login
clauder add alice          # add a token (hidden input)
clauder list               # accounts + estimated token lifetime left
clauder status alice       # check that the login works
clauder rename alice bob
clauder remove bob
clauder path               # where accounts.json lives
```

Getting a token: the account owner runs `claude setup-token` on their machine and sends you
the `sk-ant-oat01-...` value. Tokens last about one year; `clauder list` counts down from the day
you added it.

## Accounts file

`~/.clauder/accounts.json` (override with `CLAUDER_HOME`). You can edit it by hand:

```json
{
  "accounts": {
    "alice": { "token": "sk-ant-oat01-...", "addedAt": "2026-11-26T10:00:00.000Z", "note": "work" }
  }
}
```

Tokens are stored in **plain text**. On macOS/Linux the file is created with mode `600`.
Don't share the file and don't copy it into this repo.

## Note

A token gives full access to its owner's Claude subscription, and usage counts against their
limits. Only use tokens you are authorized to use.
