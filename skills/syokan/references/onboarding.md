# syokan onboarding

Steps for Claude to guide a new user from installing syokan to seeing their first snapshot in the browser.
Run this flow when the user says `syokan onboarding`, "install / set up syokan", or "first time using it".

How to proceed (interactively; never install on your own):

- **Read-only checks may run silently**: checking whether it is installed (`syokan --help`) and the OS/arch (`uname -sm`) can just run.
- **Anything that changes the system requires explicit user confirmation first**: for install / binary download / source build / `codesign` and other environment-changing commands, present the exact command and get approval ("may I run this?") before executing. Never run them unapproved.
- Execute one step at a time and confirm the result before moving on (do not silently run everything).
- If `syokan --help` already works, skip the install and start from "4. First snapshot".
- Let the user choose the install method (default: mise). All binaries come from GitHub Releases.

## 1. Check the existing environment

```bash
syokan --help        # if it works, already installed → go to "4. First snapshot"
uname -sm            # if not installed, note the OS/arch (e.g. Darwin arm64)
```

If `syokan --help` fails, tell the user it is not installed, confirm they want to proceed with the install, then go to "2. Choose an install method". Stop here if the user declines.

## 2. Choose an install method

Ask the user for their preference (default: A). Once chosen, do not just run the commands below — **present the exact command and get approval first**.

### A. mise (github backend) — recommended

Fetches the prebuilt binary from GitHub Releases. OS/arch is auto-detected.

```bash
mise use -g github:wwwyo/syokan@latest   # install the latest prebuilt binary
```

- If the asset cannot be auto-selected, narrow it with `github:wwwyo/syokan[matching=<os>-<arch>]`.

### B. Download the binary directly

Grab `syokan-<os>-<arch>` from Releases and put it on the PATH.

```bash
curl -L -o ~/.local/bin/syokan \
  https://github.com/wwwyo/syokan/releases/download/<version>/syokan-<os>-<arch>
chmod +x ~/.local/bin/syokan
```

If Gatekeeper blocks it on macOS, once:

```bash
codesign --sign - ~/.local/bin/syokan   # or: xattr -dr com.apple.quarantine ~/.local/bin/syokan
```

### C. Build from source (requires Bun / for people who also want to develop)

```bash
git clone https://github.com/wwwyo/syokan && cd syokan
mise install && bun install
bun run compile
cp dist/syokan ~/.local/bin/
```

## 3. Verify the install

```bash
syokan --help            # command list
```

`syokan` lazy-spawns the server automatically on post (port 5173 / `~/.config/syokan`). No explicit start needed.

## 4. First snapshot

As the very first one, present the welcome envelope below to the user and invite them in a guiding tone. For example:

> With syokan, an LLM summons rich UI: it posts a JSON tree and syokan renders it as a React view. Let's syokan this JSON as your first view. May I run it?

After approval, write it to `welcome.json` and post it (props conform to `syokan catalog`).

```json
{
  "title": "Welcome to syokan",
  "metadata": { "source": { "label": "onboarding" } },
  "root": {
    "type": "Stack",
    "props": { "direction": "vertical" },
    "children": [
      { "type": "Heading", "props": { "text": "🎉 syokan setup complete", "level": 1 } },
      { "type": "Text", "props": { "body": "This is your first snapshot. An LLM posts a JSON tree, and syokan renders it with catalog components." } },
      {
        "type": "Card",
        "props": {},
        "children": [
          { "type": "Heading", "props": { "text": "What you can do next", "level": 3 } },
          { "type": "Text", "props": { "body": "Post today's RSS, an in-progress PR review, meeting notes, or your TODOs, and view them as structured UI at a single URL." } },
          { "type": "Badge", "props": { "text": "ephemeral", "variant": "secondary" } }
        ]
      },
      { "type": "Link", "props": { "href": "https://github.com/wwwyo/syokan", "text": "syokan documentation" } }
    ]
  }
}
```

Once approved, post it:

```bash
syokan welcome.json      # on success the view URL is printed to stdout
syokan open              # open home (`syokan open <id>` for an individual snapshot)
```

Done when the welcome snapshot shows up in the browser.
