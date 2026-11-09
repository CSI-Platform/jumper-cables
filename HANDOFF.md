# Live site handoff

The commands are on GitHub. They are not on https://jc.csi.run.

Do not deploy until Cody approves publishing. This file is the checklist for that approval.

## What is waiting

Pull request: https://github.com/CSI-Platform/jumper-cables/pull/1

Branch: `SEO`

The commands are in commit `776a3310318bf10fc4c8de267bcd34641be40ef0`. Merge the pull request. A later commit on `SEO` adds this file only, and that file is not part of the website.

That commit puts four finished `llama-server` commands in the page HTML, in `public/llms.txt`, and in the README. An agent can read a command without using the form. `python3 src/jc.py` prints the same command.

## What is live now

https://jc.csi.run does not contain the heading "How do I start a local llama.cpp server?".

https://jc.csi.run/llms.txt returns 404.

[RELEASE.md](RELEASE.md) still describes that live site. The current rollback target recorded there is Cloudflare version `18e10a13-accc-4679-8a06-e8ee3fb1b5a9`, deployment `9d93673a-fddb-43d3-baaa-2f97eb5865f6`. The credential-persistence note in that file is the later published behavior. Read the top of RELEASE.md before rolling back, and keep Worker `jc`, the DNS record, and the `jc.csi.run/*` route.

## What publishing changes

The Worker uploads `public/`. On 2026-11-09 a dry run of `npx wrangler@4.158.0 deploy --dry-run --outdir /tmp/jc-worker-dry-run` read 2 files from `public/`: the page and `llms.txt`. It did not upload.

After a real deploy, the live page should show the four commands, and https://jc.csi.run/llms.txt should return them. GitHub `main` should be the same commit that was deployed.

## Steps

1. Merge pull request 1 into `main`. Deploy that merge. Do not deploy an older commit that leaves this checklist behind unless you have checked the `public/` files are the ones you mean.
2. From a clean checkout of that commit:

```bash
python3 src/build.py
npx wrangler@4.158.0 deploy --dry-run --outdir /tmp/jc-worker-dry-run
```

3. After Cody approves publishing:

```bash
npx wrangler@4.158.0 deploy
```

Use the account that already owns Worker `jc`. Do not create a new worker, a new route, or a new DNS record. Do not pass a private profile.

4. On the live site, confirm the heading and a `llama-server` command are in the HTML before the script tag. Confirm https://jc.csi.run/llms.txt returns the same four commands. A 200 status is not enough.
5. Write the new Cloudflare version, deployment id, and live HTML hash into RELEASE.md.

## Already checked, not on the live site

`python3 tests/test_engine.py` passed: 9 tests. The browser suite passed with `CHROME_BIN=/usr/bin/google-chrome npm --prefix tests test`, including the check that the four static commands match the command the page builds. No model was started. Windows and macOS command text was not executed on those systems.

## Leave alone

The `csi` menu is a different repo, https://github.com/CSI-Platform/csi. Publishing this site does not install `csi` and does not change that repo. One local line in `/home/cody/HULK/work/csi/AGENTS.md` records that GitHub address and is not in the published `csi` commit `3e37d26`.
