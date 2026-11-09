#!/usr/bin/env python3
"""Build the Jumper Cables page from llama-server --help plus plain-English option data.

Public site:      python3 src/build.py
Private version:  python3 src/build.py --profile profile.json --out private/index.html

Stops with an error if any flag in the help output has no explanation, so the page can't silently miss an option.
To update for a new llama.cpp build: llama-server --help > src/llama-server-help.txt, run this, and add what it reports.
"""
import argparse
import html
import json
import re
import sys
from collections import Counter
from pathlib import Path

import engine

SRC = Path(__file__).resolve().parent
TOKEN = re.compile(r"(?:^|(?<=[\s,]))(-{1,2}[A-Za-z][\w.-]*),?")
esc = html.escape

CATS = [
    ("model", "Choosing the model", "Which model the server runs, and where it comes from."),
    ("context", "Context and memory", "How much the model can hold in mind, and how the server handles a chat as it grows."),
    ("gpu", "GPU and memory", "Where the model and its context live. On a small graphics card, this section decides what fits."),
    ("cpu", "CPU and threads", "How the processor gets used. With every layer on the GPU, these matter much less."),
    ("sampling", "Creativity and randomness", "How the model picks each next word. These change the feel of replies, not what the model knows."),
    ("limits", "Reply length and format", "Limits and hard rules on what the model is allowed to write."),
    ("thinking", "Thinking and chat format", "Whether the model reasons before answering, and how the conversation gets formatted for it."),
    ("tools", "Tools and agents", "What the model can do beyond writing text. llama.cpp marks these experimental, so read the warnings."),
    ("adapters", "LoRA and steering", "Add-ons that change how the base model behaves."),
    ("network", "Network and security", "Who can reach the server and how."),
    ("ui", "Web UI and status pages", "The chat page, and the extra pages the server can show."),
    ("vision", "Images, audio and video", "Only for models built to take these inputs."),
    ("embed", "Embeddings and reranking", "Embeddings, reranking and code completion: jobs other than chat, usually needing a dedicated model."),
    ("router", "Serving several models", "Run one server that switches between models."),
    ("spec", "Speculative decoding", "Guess several tokens ahead, then check them all at once. Most of this section tunes that same idea."),
    ("logs", "Logs and diagnostics", "See what the server is doing, or print information and exit."),
    ("lowlevel", "Low-level model math", "Internal model settings. Leave these alone unless a model's documentation says otherwise."),
    ("presets", "One-flag model presets", "Each one downloads a specific model and configures everything for it."),
    ("removed", "Removed or deprecated", "Listed so you recognize them in old guides. Don't use these."),
]
GLOSSARY = [
    ("Token", "The unit a model reads and writes, usually part of a word. In English, 1,000 tokens is roughly 750 words."),
    ("Context window", "Everything the model can hold in mind at once, counting your messages, its thinking and its replies."),
    ("Layer", "Models are stacks of processing layers. The more that fit on your GPU, the faster it runs."),
    ("VRAM", "Memory on the graphics card. Your desktop uses some of it too."),
    ("Offload", "Moving work from the CPU to the GPU."),
    ("KV cache", "The memory that holds the context window. This is what grows as you raise --ctx-size."),
    ("Slot", "One chat the server can work on at a time."),
    ("Batch", "A group of tokens processed in one step."),
    ("Sampler", "A step that decides which word comes next from the model's ranked options."),
    ("Prompt cache", "Saved work from earlier in the chat, so it doesn't get reprocessed."),
    ("GGUF", "The model file format llama.cpp runs."),
    ("Quantization", "Storing a model at lower precision to shrink it. Q4_K_M is a common balance."),
    ("LoRA", "A small add-on file with extra training that changes how a base model behaves."),
    ("mmproj", "A separate file that lets a compatible model take images or other media."),
    ("Chat template", "The formatting rules that turn your conversation into the text a model expects."),
    ("MCP", "A standard way of connecting tools to an AI model."),
    ("Endpoint", "An address the server responds at, such as /health or /v1/chat/completions."),
    ("CORS", "A browser rule for which websites may call a server."),
    ("Speculative decoding", "Guessing several tokens ahead and checking them together to save time."),
    ("MoE", "Mixture of Experts, a model design where only part of the model runs for each token."),
]
LEVELS = {"S": "Start here", "U": "Good to know", "A": "Specialist", "N": "Situational"}
INFO_ONLY = {"-h", "--version", "-cl", "--completion-bash", "--list-devices"}
PREFER = {"-ngl": "--n-gpu-layers", "-np": "--parallel", "-m": "-m", "-a": "--alias", "-hf": "-hf", "-c": "--ctx-size"}


def parse(path):
    out, cur = [], None
    for raw in path.read_text().splitlines():
        if raw.startswith("-----"):
            continue
        if raw.startswith("-"):
            if len(raw) > 40 and raw[39] == " " and raw[40] != " ":
                head, desc = raw[:40].rstrip(), raw[40:].strip()
            else:
                head, desc = raw.rstrip(), ""
            cur = {"head": head, "lines": [desc] if desc else []}
            out.append(cur)
        elif raw.strip() and cur is not None:
            cur["lines"].append(raw.strip())
    for o in out:
        o["tokens"] = TOKEN.findall(o["head"])
        o["value"] = re.sub(r"\s+", " ", TOKEN.sub("", o["head"])).strip(" ,")
        text = " ".join(o["lines"])
        env = re.search(r"\(env: (\w+)\)", text)
        o["env"] = env.group(1) if env else ""
        o["official"] = "\n".join(l for l in o["lines"] if not l.startswith("(env:"))
        clean = re.sub(r"\(env: \w+\)", "", text)
        clean = re.sub(r"\[\(.*?\)\]\(.*?\)", "", clean)
        found = re.search(r"default:\s*(.*?)\s*(?:\)|$)", clean)
        val = found.group(1).strip() if found else ""
        if val.count("(") > val.count(")"):
            val += ")"
        o["default"] = val
    return out


def primary(o):
    k = o["tokens"][0]
    if k in PREFER:
        return PREFER[k]
    longs = [t for t in o["tokens"] if t.startswith("--") and not t.startswith("--no-")]
    return longs[0] if longs else k


def negative(o):
    for t in o["tokens"]:
        if t.startswith("--no-"):
            return t
    for t in o["tokens"]:
        if t.startswith("-no-"):
            return t
    return ""


def short_note(meta):
    if meta.get("short"):
        return meta["short"]
    return meta["plain"].split(". ")[0].rstrip(".")


def control(o, meta):
    k, cat = o["tokens"][0], meta["cat"]
    if cat == "removed":
        return '<p class="noadd">Removed or on its way out, so it can\'t be added here</p>'
    if k in INFO_ONLY:
        return '<p class="noadd">Prints information and exits, so run it on its own</p>'
    value, neg = o["value"], negative(o)
    takes = bool(value)
    optional = value.startswith("[")
    attrs = (f'data-key="{esc(k)}" data-flag="{esc(primary(o))}" data-neg="{esc(neg)}" '
             f'data-takes="{int(takes)}" data-optional="{int(optional)}" data-note="{esc(short_note(meta))}"')
    inp = ""
    if takes:
        slug = re.sub(r"[^a-z0-9]+", "-", k.lower()).strip("-")
        label = esc(f"Value for {primary(o)}")
        inp = f'<input type="text" id="v-{slug}" aria-label="{label}" placeholder="{esc(value)}" spellcheck="false" autocomplete="off">'
    negbtn = f'<button type="button" class="btn negb">Add {esc(neg)}</button>' if neg else ""
    return f'<div class="ctl" {attrs}>{inp}<button type="button" class="btn add">Add</button>{negbtn}</div>'


def card(o, meta, tip, note, used):
    k = o["tokens"][0]
    flags = ", ".join(f"<code>{esc(t)}</code>" for t in o["tokens"])
    val = f' <span class="val">{esc(o["value"])}</span>' if o["value"] else ""
    ran = '<span class="used">Run on this machine</span>' if k in used else ""
    rows = [f'<div><dt>Default</dt><dd>{esc(o["default"]) if o["default"] else "none listed"}</dd></div>']
    if o["env"]:
        rows.append(f'<div><dt>Environment variable</dt><dd><code>{esc(o["env"])}</code></dd></div>')
    extra = ""
    if note:
        extra = f'<p class="tip"><b>On your machine:</b> {esc(note)}</p>'
    elif tip:
        extra = f'<p class="tip"><b>Tip:</b> {esc(tip)}</p>'
    off = f'<details><summary>Official help text</summary><pre class="off">{esc(o["official"])}</pre></details>' if o["official"] else ""
    return (f'<article class="opt" data-level="{meta["level"]}"><div class="body"><h4 class="flags">{flags}{val}{ran}</h4>'
            f'<p class="plain">{esc(meta["plain"])}</p>{extra}<dl class="meta">{"".join(rows)}</dl>{off}</div>{control(o, meta)}</article>')


def private_blocks(p):
    cur = "".join(f"<tr><td><code>{esc(a)}</code></td><td>{esc(b)}</td><td>{esc(c)}</td></tr>" for a, b, c in p["current"])
    mea = "".join(f"<tr><td>{esc(a)}</td><td>{esc(b)}</td><td>{esc(c)}</td><td>{esc(d)}</td></tr>" for a, b, c, d in p["measured"])
    return (f'<div class="group"><h2>Your server right now</h2><div class="tablewrap"><table><thead><tr><th>Option</th><th>What it does</th><th>Compared with default</th></tr></thead><tbody>{cur}</tbody></table></div></div>'
            f'<div class="group"><h2>Context sizes tried on your machine</h2><p class="help">{esc(p["machine"])}. GPU memory is total use, including your desktop.</p><div class="tablewrap"><table><thead><tr><th>Context</th><th>How it was set</th><th>Result</th><th>GPU memory</th></tr></thead><tbody>{mea}</tbody></table></div></div>')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", type=Path, help="private JSON profile, kept outside this repo")
    ap.add_argument("--out", type=Path, default=SRC.parent / "public" / "index.html")
    a = ap.parse_args()

    opts = parse(SRC / "llama-server-help.txt")
    options = json.loads((SRC / "options.json").read_text())
    tips = json.loads((SRC / "tips.json").read_text())
    profile = json.loads(a.profile.read_text()) if a.profile else None

    keys = [o["tokens"][0] for o in opts]
    missing = [k for k in keys if k not in options]
    extra = [k for k in options if k not in keys]
    dupes = [k for k, n in Counter(keys).items() if n > 1]
    if missing or extra or dupes:
        sys.exit(f"Option data is out of step with the help output.\nMISSING: {missing}\nEXTRA: {extra}\nDUPES: {dupes}")

    level_label = dict(LEVELS)
    notes, used = {}, set()
    if profile:
        level_label["N"] = profile.get("levelNLabel", LEVELS["N"])
        notes, used = profile.get("notes", {}), set(profile.get("used", []))

    by_cat = {c[0]: [] for c in CATS}
    for o in opts:
        by_cat[options[o["tokens"][0]]["cat"]].append(o)
    sections, nav = [], []
    for cid, title, blurb in CATS:
        items = by_cat[cid]
        groups = []
        for lvl in "SUAN":
            members = [o for o in items if options[o["tokens"][0]]["level"] == lvl]
            if not members:
                continue
            body = "".join(card(o, options[o["tokens"][0]], tips.get(o["tokens"][0]), notes.get(o["tokens"][0]), used) for o in members)
            groups.append(f'<div class="lvgroup"><h3>{esc(level_label[lvl])} <span>{len(members)}</span></h3>{body}</div>')
        sections.append(f'<section class="cat" id="cat-{cid}" data-title="{esc(title)}" data-blurb="{esc(blurb)}"><h2>{esc(title)}</h2><p class="blurb">{esc(blurb)}</p>{"".join(groups)}</section>')
        nav.append(f'<button type="button" data-view="cat-{cid}">{esc(title)}<span>{len(items)}</span></button>')

    counts = Counter(v["level"] for v in options.values())
    flagcount = sum(len(o["tokens"]) for o in opts)
    gloss = "".join(f"<div><dt>{esc(x)}</dt><dd>{esc(y)}</dd></div>" for x, y in GLOSSARY)
    hero = (f"Your private copy, loaded with {esc(profile['name'])}. Change anything here and the command updates. Nothing leaves your browser." if profile
            else "Tell this page about your computer and your model, and it writes the command. A web page can't start programs, so you paste it into a terminal yourself. Nothing leaves your browser.")
    client_profile = {"name": profile["name"], "state": profile["state"]} if profile else None
    profile_json = json.dumps(client_profile, ensure_ascii=False).replace("</", "<\\/")

    page = (SRC / "template.html").read_text()
    page = re.sub(r"<!-- template-preview:start -->.*?<!-- template-preview:end -->\n?", "", page, flags=re.S)
    fill = {
        "%%HERO_NOTE%%": hero,
        "%%PRIVATE_BLOCKS%%": private_blocks(profile) if profile else "",
        "%%GLOSSARY%%": gloss, "%%TOTAL%%": str(len(opts)), "%%FLAGCOUNT%%": str(flagcount), "%%START_COUNT%%": str(counts["S"]),
        "%%N_S%%": str(counts["S"]), "%%N_U%%": str(counts["U"]), "%%NAV%%": "".join(nav), "%%SECTIONS%%": "".join(sections),
        "%%PROFILE_JSON%%": profile_json, "%%SCRIPT%%": (SRC / "app.js").read_text(),
        "%%ANSWERS%%": engine.answers_html(),
    }
    for k, v in fill.items():
        page = page.replace(k, v)
    assert "%%" not in re.sub(r"<script>.*?</script>", "", page, flags=re.S), "unfilled placeholder"

    # Keep upstream notices with the self-contained page when it is deployed or copied.
    notices = "\n\n".join((SRC.parent / "licenses" / name).read_text()
                          for name in ("llama.cpp-LICENSE", "lucide-LICENSE"))
    page = page.replace("</head>", "<!-- Third-party notices\n" + notices.replace("--", "- -") + "\n-->\n</head>", 1)

    page = "\n".join(line.rstrip() for line in page.splitlines()) + "\n"

    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(page)
    public_page = (SRC.parent / "public" / "index.html").resolve()
    if a.profile is None and a.out.resolve() == public_page:
        llms = public_page.parent / "llms.txt"
        llms.write_text(engine.llms_text())
        print(f"{llms}: {llms.stat().st_size} bytes")

    absent = [t for o in opts for t in o["tokens"] if f"<code>{esc(t)}</code>" not in page]
    absent += [o["env"] for o in opts if o["env"] and f"<code>{o['env']}</code>" not in page]
    if absent:
        sys.exit(f"Missing from rendered page: {absent}")
    print(f"{a.out}: {len(opts)} options, {flagcount} flag spellings, {dict(counts)}, {len(page)} bytes")


if __name__ == "__main__":
    main()
