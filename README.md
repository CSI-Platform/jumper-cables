# Jumper Cables

Kickstart a local LLM with the llama.cpp web UI.

Jumper Cables is one static page. Tell it about your machine and your model, and it writes the exact `llama-server` command to paste into a terminal. It also explains all 257 options in the llama-server build it was generated from, in plain English, and any of them can be added to your command.

Live site: https://jc.csi.run

## What it does

- Writes the start command for Linux, macOS or Windows (PowerShell), with a plain-English note under every line
- Offers starting points such as All on GPU, Long memory, CPU only and Read-only tools
- Warns about risky combinations, such as opening the server to your network with no API key
- Gives a rough check of whether your model fits in GPU memory
- Tests the connection to a server running on your own computer
- Lists every option by topic with its default, environment variable and official help text

A web page can't start programs on your computer, so you always run the command yourself.

## Privacy

The command is built in your browser, and nothing you type gets sent anywhere. Your settings are remembered in your browser's local storage, and Reset clears them. Test connection only contacts `127.0.0.1`. Fonts load from Google Fonts.

## Build

Needs Python 3 and nothing else.

```bash
python3 src/build.py
```

For a local preview, open `public/index.html` in a browser. Opening
`src/template.html` redirects to that built page; rebuild after editing sources.
The page builds commands;
it does not install or start a model server.

This writes `public/index.html`. The build stops with an error if any flag in the help output has no explanation, so an option can't go missing without anyone noticing.

To update for a new llama.cpp build:

```bash
llama-server --help > src/llama-server-help.txt
python3 src/build.py
```

Then add an entry to `src/options.json` for each flag it reports as missing.

## Private version

`python3 src/build.py --profile <file> --out <path>` adds your own paths, saved setup and machine notes. Keep that profile and its output outside this repo so they stay private.

## Deploy

`wrangler.jsonc` publishes `public/` to the existing Cloudflare Worker **`jc`**,
using the existing **`jc.csi.run/*`** route in zone **`csi.run`**. The repository
name is `jumper-cables`; the Worker name is `jc`. Keep the current proxied DNS
record and route. Only `public/` is uploaded; the private profile is not included.

Authenticate Wrangler to the account that owns the existing Worker, build, and
check the bundle before publishing:

```bash
python3 src/build.py
npx wrangler@4.158.0 deploy --dry-run --outdir /tmp/jc-worker-dry-run
```

After publishing is approved:

```bash
npx wrangler@4.158.0 deploy
```

Check `https://jc.csi.run` for the Jumper Cables heading and functioning command
builder, not just an HTTP 200 response. The previous deployment is a generic
Cloudflare placeholder. If recovery is needed, use the `jc` Worker's deployment
history to roll back to the recorded prior version; see `RELEASE.md`.

## Acceptance checks

The production build uses only Python. Optional browser checks require Node.js
and Playwright; no model or local application server is started:

```bash
python3 src/build.py
npm --prefix tests ci
npx --prefix tests playwright install chromium
npm --prefix tests test
```

To use an existing Chrome installation instead, set `CHROME_BIN` to its executable
when running the tests. `JC_ARTIFACT_DIR` optionally selects the screenshot and
result directory; the default is a temporary directory. Tests cover command
generation, copy/persistence, presets, search, option editing, port validation,
memory estimates, simulated connection results, and desktop/mobile layouts.
They do not launch llama.cpp or execute PowerShell/macOS commands.

## Credits

Design rules follow [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky
([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), with its easing curve
and type scale adapted to this layout. Icons are from [Lucide](https://lucide.dev)
(ISC, with Feather-derived icons under MIT); see `licenses/lucide-LICENSE`.
The build includes the upstream notices in the generated page's source.

## License

The option names, defaults and official help text come from [llama.cpp](https://github.com/ggml-org/llama.cpp), MIT licensed. See `licenses/llama.cpp-LICENSE`.
