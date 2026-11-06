# Jumper Cables release — 2026-11-06

Status: released to GitHub and https://jc.csi.run on 2026-11-06 at 14:38 Arizona
time, following user approval.

## Scope and destination

Publish the existing static command builder, without adding model hosting or
starting a local model. Source repository: `CSI-Platform/jumper-cables`, branch
`main`. Cloudflare Worker: `jc`. Existing route: `jc.csi.run/*` in zone `csi.run`.
The domain previously served a generic placeholder. Its proxied DNS record and
Worker route were checked against the Cloudflare API and preserved during release.

The initial implementation was recovered from uncommitted local files. The remote
default branch contained only the initial README when inspected.

## Release fixes

- Match the existing Worker and route instead of creating `jumper-cables` with a
  new custom-domain binding.
- Reject out-of-range, negative, and fractional ports in readiness feedback; keep
  Open web UI and Test connection unavailable until the port is valid.
- Include upstream llama.cpp and Lucide/Feather license notices in the generated
  page, and preserve attribution for the adapted design guidance.
- Add reproducible browser acceptance checks and setup/deployment instructions.
- Redirect source-template previews to the built app, keep tablet sidebar topics
  clear of the command bar, and contain keyboard focus within the mobile command
  panel. Restore navigation on close/resize and fully disable transitions when
  reduced motion is requested.

## Validation

- Python build succeeds with 257 option entries and 414 flag spellings. It checks
  for missing, extra, and duplicate option data and missing rendered flags.
- Browser checks cover blank/private-profile separation; command copy and reload
  persistence; literal POSIX shell arguments using a harmless stub executable;
  presets and network warnings; Hugging Face source switching; memory estimates;
  macOS/PowerShell command formatting; option search/add/remove; simulated healthy
  and unreachable servers; invalid and boundary ports; and mobile command-sheet
  behavior. The suite also checks for uncaught JavaScript errors.
- All 18 acceptance checks pass, including every sidebar topic/count, tablet
  sidebar clearance, modal focus wrapping, command-help navigation, responsive
  resize recovery, and source-template preview routing.
- Desktop (1440×1000), tablet (1000×700), and mobile (390×844) screenshots were
  inspected.
- Wrangler 4.158.0 dry run succeeds with the single generated HTML asset and no
  application bindings. That preflight did not upload a Worker; the production
deployment is recorded below.
- Public source and output were checked for the known private machine/profile
  identifiers. The public page contains a null profile; private profiles remain
  outside the repository and public asset directory.

## Limitations

- No actual model was started. Connection feedback was checked with simulated
  HTTP responses. Production browser access to localhost remains subject to
  browser permissions and the model server's CORS configuration.
- PowerShell and macOS command text was checked in the browser but not executed
  on those operating systems. POSIX quoting was executed against a test stub.
- The option catalog describes the captured `llama-server-help.txt`, not every
  possible llama.cpp version. Regenerate and update the catalog for another build.
- GPU estimates are deliberately rough. Browser tests block external font
  requests and verify the fallback layout.

## Published result

- Source commit: `58598260cc2174eb71208bacd78848bfbf98b25c`.
- Cloudflare version: `57d9ac2b-5047-48e3-af35-435c78377922`.
- Deployment: `54065b9b-cfd0-497a-9de0-6b8844be22ac`, at 100% traffic.
- Live HTML SHA-256: `3f0ec92202e64a7151981ba5a4d21c33a27c8146ea152f207d50debf90bb3b0b`,
  identical to the approved local asset.
- Live Chrome verification passed: HTTP 200; 257 options; no private profile or
  template placeholders; command generation; desktop topic navigation; tablet
  sidebar clearance; mobile focus containment and closing; no JavaScript errors.
- No actual model or local application server was started.

The terminal's GitHub account did not have push access, so the connected GitHub
app published the source. Its Git tree matches the verified local candidate
exactly. Local `main` was aligned to the published commit; the original local
commits remain on `release/local-candidate-2026-11-06`. Future publishing should
use the connected app or a terminal account with repository write access.

## Recovery

Before this release, Worker `jc` served version
`bb0f6155-98f3-4630-9985-e94d230228da` at 100%, deployment
`9e6fc573-fa77-4cd7-a254-358eec9d2e6c`. That version is the generic placeholder.
Use the Worker's deployment history to roll back to it if necessary; do not
delete the Worker, DNS record, or route. Keep the source commit for correction and
redeployment. All local background services previously disabled remain disabled.
