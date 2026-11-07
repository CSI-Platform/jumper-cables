# Jumper Cables

**A setup guide and command builder for running local AI models with llama.cpp.**

Tell it about your computer and model, choose your settings, and copy the generated
`llama-server` command into your terminal. The page explains **257 options** from
its captured llama.cpp help output in plain English, with searchable topics and
controls for adding supported options to your command.

**[Open Jumper Cables](https://jc.csi.run)** · [Release status and validation](RELEASE.md)

## Quick start

1. Have `llama-server` installed and a compatible GGUF model available, or choose a
   Hugging Face model to download when the server starts.
2. Open [jc.csi.run](https://jc.csi.run), choose Linux, macOS, or Windows, and enter
   your server and model details. Prefer absolute file paths.
3. Choose a starting point, review the generated command and warnings, and click
   **Copy command**. Paste it into your terminal; Windows commands use PowerShell.
4. Once the server reports that it is listening, click **Open web UI** to chat.

Jumper Cables runs in your browser. It does not install software, host a model,
or start a server on your computer.

## What it does

- Writes the start command for Linux, macOS or Windows (PowerShell), with a plain-English note under every line
- Offers starting points such as All on GPU, Long memory, CPU only and Read-only tools
- Warns about risky combinations, such as opening the server to your network with no API key
- Gives a rough check of whether your model fits in GPU memory
- Tests the connection to a server running on your own computer
- Lists every option by topic with its default, environment variable and official help text

## Compatibility and limits

- The 257-option catalog describes the bundled `llama-server-help.txt` snapshot.
  Your installed llama.cpp build may support different flags or defaults; check
  its `llama-server --help` output if a generated option is rejected.
- GPU memory estimates are rough guidance, not a guarantee that a model fits.
- **Test connection** checks a local server. Browser permissions and server CORS
  settings can block it even when the server works; try **Open web UI** directly.
- Generated PowerShell/macOS command formatting is covered by browser checks,
  but execution on those operating systems has not been verified. See the
  [release notes](RELEASE.md) for the validation scope and deployed version.

## Privacy

Command generation happens in your browser; the app does not upload the model
paths or settings you enter. Settings, including any API key you enter, are saved
in browser local storage. **Start over** restores the default settings.

**Test connection** contacts `127.0.0.1` on your selected port. Fonts load from
Google Fonts. The page does not upload model files or start inference itself.

## Build

Needs Python 3 and nothing else.

```bash
python3 src/build.py
```

For a local preview, open `public/index.html` in a browser. Opening
`src/template.html` redirects to that built page; rebuild after editing sources.
The page builds commands; it does not install or start a model server.

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
builder, not just an HTTP 200 response. If recovery is needed, use the `jc`
Worker's deployment history and the version IDs recorded in [RELEASE.md](RELEASE.md).
Check that the selected rollback version contains the intended app before routing
traffic to it.

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
memory estimates, network/tool warnings, model readiness, simulated connection
results, and desktop/tablet/mobile layouts.
They do not launch llama.cpp or execute PowerShell/macOS commands.

## Credits

Design rules follow [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky
([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), with its easing curve
and type scale adapted to this layout. Icons are from [Lucide](https://lucide.dev)
(ISC, with Feather-derived icons under MIT); see `licenses/lucide-LICENSE`.
The build includes the upstream notices in the generated page's source.

## License

The option names, defaults and official help text come from [llama.cpp](https://github.com/ggml-org/llama.cpp), MIT licensed. See `licenses/llama.cpp-LICENSE`.
