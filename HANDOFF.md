# Live site handoff

The four `llama-server` commands are on GitHub `main` and on https://jc.csi.run.

Published on 2026-11-09 from merge commit `69775c6a127d77a30c28549b636f0c806326e913` (pull request 1). Worker `jc`, route `jc.csi.run/*`. Version, deployment, live HTML hash, and the rollback target are at the top of [RELEASE.md](RELEASE.md).

The live page contains the heading "How do I start a local llama.cpp server?" and a `llama-server` command before the script tag. https://jc.csi.run/llms.txt returns the same four commands as `public/llms.txt`. The raw page response also includes Cloudflare's analytics beacon.

Do not create a new worker, route, or DNS record. Do not pass a private profile. `cf deploy` from this folder selects a worker named `jumper-cables`; the published site is Worker `jc`.

## Checked before publishing

`python3 tests/test_engine.py` passed: 9 tests. The browser suite passed with `CHROME_BIN=/usr/bin/google-chrome npm --prefix tests test`, including the check that the four static commands match the command the page builds. No model was started. Windows and macOS command text was not executed on those systems.

## Leave alone

The `csi` menu is a different repo, https://github.com/CSI-Platform/csi. Publishing this site does not install `csi` and does not change that repo. One local line in `/home/cody/HULK/work/csi/AGENTS.md` records that GitHub address and is not in the published `csi` commit `3e37d26`.
