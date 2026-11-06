# Jumper Cables release candidate — 2026-11-06

Status: prepared for publishing approval. No GitHub push or Cloudflare deployment
has been performed for this candidate.

## Scope and destination

Publish the existing static command builder, without adding model hosting or
starting a local model. Source repository: `CSI-Platform/jumper-cables`, branch
`main`. Cloudflare Worker: `jc`. Existing route: `jc.csi.run/*` in zone `csi.run`.
The domain currently serves a generic placeholder. Its proxied DNS record and
Worker route were checked against the Cloudflare API; this release preserves them.

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
  application bindings. No Worker was uploaded.
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

## Publish and verify after approval

1. Push the prepared source commit to `CSI-Platform/jumper-cables` on `main`.
2. Authenticate Wrangler to the account containing the existing `jc` Worker and
   run the pinned deploy command in `README.md`.
3. Verify that `https://jc.csi.run` serves this generated app, compare the returned
   asset with `public/index.html`, and exercise the live command builder on desktop
   and mobile. Verify that no private profile is present.
4. Record the new commit and deployment/version identifiers here.

## Recovery

Before this release, Worker `jc` served version
`bb0f6155-98f3-4630-9985-e94d230228da` at 100%, deployment
`9e6fc573-fa77-4cd7-a254-358eec9d2e6c`. That version is the generic placeholder.
Use the Worker's deployment history to roll back to it if necessary; do not
delete the Worker, DNS record, or route. Keep the source commit for correction and
redeployment. All local background services previously disabled remain disabled.
