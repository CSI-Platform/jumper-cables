#!/usr/bin/env python3
"""Command text shared by the page, llms.txt, and the jc CLI.

The browser still builds commands in app.js. This module prints the same
strings for the four starting points an agent can fetch or run.
"""
import html
import json
import re
from dataclasses import dataclass

EXAMPLE_MODEL = "/path/to/your-model.gguf"
_POSIX_SAFE = re.compile(r"^[A-Za-z0-9_/.:=,@%+-]+$")
_POSIX_REST = re.compile(r"^[A-Za-z0-9_/.:=,@%+-]*$")
_TILDE = re.compile(r"^~/")
_PS_SAFE = re.compile(r"^[A-Za-z0-9_\\/.:=,@%+~-]+$")
_JS_FLOAT = re.compile(r"^[ \t]*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)")
_FIRST = ["-m", "-hf", "-hff", "-mu", "-dr", "--models-dir"]
_MODEL_KEYS = {"-m", "-hf", "-mu", "-dr", "--models-dir"}

ANSWERS = [
    {
        "id": "gpu",
        "aliases": ["all-gpu"],
        "title": "All on GPU",
        "blurb": "Every layer on the GPU, with the largest context that fits. Usually the fastest.",
        "opts": {"-ngl": "all", "-fit": "on"},
    },
    {
        "id": "long",
        "aliases": ["long-memory"],
        "title": "Long memory",
        "blurb": "Asks for a 32K context. On a small GPU, some layers may move to the CPU.",
        "opts": {"-c": "32768"},
    },
    {
        "id": "cpu",
        "aliases": ["cpu-only"],
        "title": "CPU only",
        "blurb": "Runs without the GPU. Slower, but works on any machine with enough RAM.",
        "opts": {"-ngl": "0"},
    },
    {
        "id": "readonly",
        "aliases": ["read-only"],
        "title": "Read-only tools",
        "blurb": "The model can search and read files your account can read, including private ones. It can't change anything. Experimental.",
        "opts": {"--tools": "read_file,file_glob_search,grep_search,get_info"},
    },
]
_BY_NAME = {}
for _spec in ANSWERS:
    _BY_NAME[_spec["id"]] = _spec["id"]
    for _alias in _spec["aliases"]:
        _BY_NAME[_alias] = _spec["id"]


def q_posix(v):
    if _POSIX_SAFE.fullmatch(v):
        return v
    if _TILDE.match(v):
        rest = v[2:]
        if _POSIX_REST.fullmatch(rest):
            return v
        return "~/'" + rest.replace("'", "'\\''") + "'"
    return "'" + v.replace("'", "'\\''") + "'"


def q_ps(v):
    if _PS_SAFE.fullmatch(v):
        return v
    return "'" + v.replace("'", "''") + "'"


def quote(os_name, value):
    return q_ps(value) if os_name == "win" else q_posix(value)


def resolve_preset(name):
    key = _BY_NAME.get(name)
    if not key:
        known = ", ".join(spec["id"] for spec in ANSWERS)
        raise ValueError(f"Unknown preset {name!r}. Use {known}.")
    return key


def preset_spec(name):
    key = resolve_preset(name)
    for spec in ANSWERS:
        if spec["id"] == key:
            return spec
    raise ValueError(name)


@dataclass
class Request:
    os: str = "linux"
    model: str = ""
    hf: str = ""
    bin: str = ""
    port: str = ""
    preset: str = "gpu"
    vram: str = ""
    size: str = ""
    libs: bool = False
    detach: bool = False
    one_line: bool = False


_catalog = None


def catalog():
    """Flag order and spelling, matching the option rows on the built page."""
    global _catalog
    if _catalog is not None:
        return _catalog
    from build import CATS, INFO_ONLY, parse, primary
    from pathlib import Path

    src = Path(__file__).resolve().parent
    parsed = parse(src / "llama-server-help.txt")
    options = json.loads((src / "options.json").read_text())
    by_cat = {cid: [] for cid, _, _ in CATS}
    for opt in parsed:
        by_cat[options[opt["tokens"][0]]["cat"]].append(opt)
    order, flags, takes, preset_keys = [], {}, {}, set()
    for cid, _, _ in CATS:
        if cid == "removed":
            continue
        for level in "SUAN":
            for opt in by_cat[cid]:
                key = opt["tokens"][0]
                if options[key]["level"] != level or key in INFO_ONLY:
                    continue
                order.append(key)
                flags[key] = primary(opt)
                takes[key] = bool(opt["value"])
                if cid == "presets":
                    preset_keys.add(key)
    _catalog = (order, flags, takes, preset_keys)
    return _catalog


def make_opts(req):
    spec = preset_spec(req.preset)
    opts = {}
    if req.model:
        opts["-m"] = req.model
    if req.hf:
        opts["-hf"] = req.hf
    opts.update(spec["opts"])
    if req.port:
        opts["--port"] = req.port
    return opts, spec


def _head(req):
    binary = req.bin.strip()
    if req.os == "win":
        return "& " + q_ps(binary) if binary else "llama-server"
    if req.os == "linux" and req.libs and "/" in binary:
        folder = re.sub(r"/[^/]*$", "", binary) or "/"
        base = re.sub(r"^.*/", "", binary)
        prefix = "nohup " if req.detach else ""
        return "cd " + q_posix(folder) + " && LD_LIBRARY_PATH=. " + prefix + "./" + q_posix(base)
    body = q_posix(binary) if binary else "llama-server"
    return ("nohup " if req.detach else "") + body


def _arg_texts(req, opts):
    order, flags, takes, _preset_keys = catalog()

    def sort_key(key):
        first = _FIRST.index(key) if key in _FIRST else 99
        position = order.index(key) if key in order else -1
        return (first, position)

    keys = sorted((key for key in opts if key in flags), key=sort_key)
    texts = []
    for key in keys:
        value = opts[key]
        if takes[key] and value != "":
            texts.append(flags[key] + " " + quote(req.os, value))
        else:
            texts.append(flags[key])
    if "--port" not in keys:
        texts.append("--port 8080")
    return texts


def build(req):
    opts, _spec = make_opts(req)
    if req.one_line:
        sep = " "
    elif req.os == "win":
        sep = " `\n  "
    else:
        sep = " \\\n  "
    tail = " > ~/llama-server.log 2>&1 &" if req.detach and req.os != "win" else ""
    return sep.join([_head(req), *_arg_texts(req, opts)]) + tail


def _js_float(value):
    if value is None:
        return float("nan")
    found = _JS_FLOAT.match(str(value))
    if not found:
        return float("nan")
    return float(found.group(1))


def _gb(number):
    return f"{number:.1f} GB"


def _port(opts):
    return opts.get("--port") or "8080"


def _valid_port(value):
    return bool(re.fullmatch(r"\d+", value)) and 1 <= int(value) <= 65535


def _loopback_only(host):
    if not host:
        return True
    for address in host.split(","):
        address = address.strip().lower()
        if address in ("localhost", "::1"):
            continue
        octets = address.split(".")
        if len(octets) == 4 and octets[0] == "127" and all(
            re.fullmatch(r"\d{1,3}", octet) and int(octet) <= 255 for octet in octets
        ):
            continue
        return False
    return True


def checks(req):
    opts, _spec = make_opts(req)
    _order, _flags, _takes, preset_keys = catalog()
    sources = [key for key in opts if key in _MODEL_KEYS or key in preset_keys]
    tools = opts.get("--tools", "")
    runtime = opts.get("--tools-runtime", "")
    external = bool(runtime) and runtime != "none"
    host = opts.get("--host", "")
    loop = _loopback_only(host)
    messages = []
    if not sources:
        messages.append(("bad", "Add a model. The server has nothing to run without one."))
    elif len(sources) > 1:
        messages.append(("warn", "More than one model source is set: " + ", ".join(sources) + ". Keep only one."))
    else:
        messages.append(("ok", "Model source is set"))
    if not _valid_port(_port(opts)):
        messages.append(("bad", "Port must be a whole number from 1 to 65535."))
    if not loop and not (opts.get("--api-key") or opts.get("--api-key-file")):
        messages.append(("bad", "This opens the server to your network with no API key, so anyone on it could use your model. Add a key in Fine-tune."))
    elif not loop:
        messages.append(("warn", "Your network can reach this server. It uses plain HTTP unless you add SSL options."))
    else:
        messages.append(("ok", "Only this computer can connect"))
    if opts.get("--api-key"):
        messages.append(("warn", "The API key is in the command, so it can land in shell history. --api-key-file avoids that."))
    danger = bool(re.search(r"all|exec_shell_command|write_file|edit_file", tools))
    if danger and not external:
        messages.append(("bad", "Shell or write tools would run directly on your system with your permissions. Add --tools-runtime with a container first."))
    elif tools:
        where = ", inside the runtime you set." if external else "."
        messages.append(("warn", "Tools are on. They're experimental and can read what your account can read" + where))
    if opts.get("-fit") == "off":
        messages.append(("warn", "Auto-sizing is off, so settings that don't fit will stop the server at startup."))
    if req.detach and req.os != "win":
        messages.append(("ok", "Output goes to ~/llama-server.log while it runs in the background"))
    return messages


def fit_note(req):
    opts, _spec = make_opts(req)
    vram = _js_float(req.vram)
    size = _js_float(req.size)
    if not (vram > 0 and size > 0):
        return ""
    if opts.get("-ngl") == "0":
        return "CPU only: the model runs from system RAM, so GPU memory doesn't matter here."
    left = vram - size - 1
    if left < 0:
        return (
            f"A {_gb(size)} model likely won't fit fully in {_gb(vram)}. "
            "Part of it will run on the CPU, which is slower. The line marks your GPU's limit."
        )
    return (
        f"Model {_gb(size)}, safety margin 1.0 GB, about {_gb(left)} left for context, "
        f"out of {_gb(vram)}. Your desktop also uses some."
    )


def notable(req):
    """Preset sentence, then warn and bad lines, then the fit note when both sizes are set."""
    _opts, spec = make_opts(req)
    lines = [spec["blurb"]]
    lines.extend(msg for level, msg in checks(req) if level != "ok")
    note = fit_note(req)
    if note:
        lines.append(note)
    return lines


def report(req):
    lines = [build(req), "", *notable(req)]
    bad = any(level == "bad" for level, _msg in checks(req))
    return "\n".join(lines) + "\n", (2 if bad else 0)


def example_request(preset_id):
    return Request(preset=preset_id, model=EXAMPLE_MODEL)


def answers_html():
    blocks = []
    for spec in ANSWERS:
        req = example_request(spec["id"])
        notes = "".join(f'<p class="help">{html.escape(line)}</p>' for line in notable(req))
        blocks.append(
            '<div class="item">'
            f"<h3>{html.escape(spec['title'])}</h3>{notes}"
            f'<pre class="answer">{html.escape(build(req))}</pre></div>'
        )
    return "".join(blocks)


def llms_text():
    lines = [
        "# Jumper Cables",
        "",
        "How do I start a local llama.cpp server?",
        "",
        "Paste one of these on Linux. Replace /path/to/your-model.gguf.",
        "For macOS or Windows, from this repo run: python3 src/jc.py --preset gpu --os mac --model /path/to/your-model.gguf",
        "Repo: https://github.com/CSI-Platform/jumper-cables",
        "",
    ]
    for spec in ANSWERS:
        req = example_request(spec["id"])
        lines.append(f"## {spec['title']}")
        lines.append("")
        lines.extend(notable(req))
        lines.append("")
        lines.append(build(req))
        lines.append("")
    lines.append("Full option catalog: https://jc.csi.run")
    lines.append("")
    return "\n".join(lines)


def list_text():
    lines = []
    for spec in ANSWERS:
        alias = spec["aliases"][0]
        lines.append(f"{spec['id']} ({alias})")
        lines.append(f"    {spec['blurb']}")
    return "\n".join(lines) + "\n"
