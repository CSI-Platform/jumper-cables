(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var profile = null;
  try { profile = JSON.parse($("profile").textContent); } catch (e) { profile = null; }

  // ---------- Registry of every addable option, from the option rows ----------
  var reg = {}, order = [];
  document.querySelectorAll(".ctl").forEach(function (c) {
    var d = c.dataset;
    reg[d.key] = { flag: d.flag, neg: d.neg || "", takes: d.takes === "1", optional: d.optional === "1", note: d.note || "", ctl: c, card: c.closest(".opt") };
    order.push(d.key);
  });
  var FIRST = ["-m", "-hf", "-hff", "-mu", "-dr", "--models-dir"];

  // ---------- State ----------
  var BLANK = { os: "linux", vram: "", size: "", modelMode: "file", bin: "", libs: false, detach: false, oneLine: false, opts: {} };
  var KEY = "jumper-cables-state-v1";
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function start() { return clone((profile && profile.state) || BLANK); }
  var S = null;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage may be blocked */ } }
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) { var p = JSON.parse(raw); if (p && p.opts) return p; } } catch (e) { /* use defaults */ }
    return start();
  }
  function setOpt(k, v) { if (v === "" || v === null || v === undefined) { delete S.opts[k]; } else { S.opts[k] = { v: String(v) }; } }
  function getOpt(k) { return S.opts[k] && S.opts[k].v !== undefined ? S.opts[k].v : ""; }

  // ---------- Shell quoting: output is only ever placed with textContent ----------
  function qPosix(v) {
    if (/^[A-Za-z0-9_\/.:=,@%+-]+$/.test(v)) return v;
    if (/^~\//.test(v)) {
      var rest = v.slice(2);
      return /^[A-Za-z0-9_\/.:=,@%+-]*$/.test(rest) ? v : "~/'" + rest.replace(/'/g, "'\\''") + "'";
    }
    return "'" + v.replace(/'/g, "'\\''") + "'";
  }
  function qPs(v) { return /^[A-Za-z0-9_\\\/.:=,@%+~-]+$/.test(v) ? v : "'" + v.replace(/'/g, "''") + "'"; }
  function quote(v) { return S.os === "win" ? qPs(v) : qPosix(v); }

  // ---------- The command, as rows ----------
  function args() {
    var keys = Object.keys(S.opts).filter(function (k) { return reg[k]; });
    keys.sort(function (a, b) {
      var fa = FIRST.indexOf(a), fb = FIRST.indexOf(b);
      fa = fa < 0 ? 99 : fa; fb = fb < 0 ? 99 : fb;
      return fa - fb || order.indexOf(a) - order.indexOf(b);
    });
    var out = keys.map(function (k) {
      var o = S.opts[k], r = reg[k], text;
      if (o.neg && r.neg) text = r.neg;
      else if (r.takes && o.v !== undefined && o.v !== "") text = r.flag + " " + quote(o.v);
      else text = r.flag;
      return { key: k, text: text, note: r.note };
    });
    if (keys.indexOf("--port") < 0) out.push({ key: "", id: "port", text: "--port 8080", note: reg["--port"] ? reg["--port"].note : "" });
    return out;
  }
  function port() { return getOpt("--port") || "8080"; }
  function validPort(p) { return /^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= 65535; }
  function usesLibs() { return S.os === "linux" && S.libs && S.bin.indexOf("/") >= 0; }
  function parts() {
    var bin = S.bin.trim(), head, tail = "", note = "The program that runs the model";
    if (S.os === "win") {
      head = bin ? "& " + qPs(bin) : "llama-server";
    } else {
      var bg = S.detach;
      if (usesLibs()) {
        var dir = bin.replace(/\/[^\/]*$/, "") || "/", base = bin.replace(/^.*\//, "");
        head = "cd " + qPosix(dir) + " && LD_LIBRARY_PATH=. " + (bg ? "nohup " : "") + "./" + qPosix(base);
        note = "Runs from its own folder so it finds its libraries";
      } else {
        head = (bg ? "nohup " : "") + (bin ? qPosix(bin) : "llama-server");
      }
      if (bg) { tail = " > ~/llama-server.log 2>&1 &"; note += ", in the background"; }
    }
    return { rows: [{ key: "", id: "head", text: head, note: note }].concat(args()), tail: tail };
  }
  function build() {
    var p = parts(), sep = S.oneLine ? " " : (S.os === "win" ? " `\n  " : " \\\n  ");
    return p.rows.map(function (r) { return r.text; }).join(sep) + p.tail;
  }

  // ---------- Pre-flight ----------
  function loopbackOnly(host) {
    if (!host) return true;
    return host.split(",").every(function (address) {
      address = address.trim().toLowerCase();
      if (address === "localhost" || address === "::1") return true;
      var octets = address.split(".");
      return octets.length === 4 && octets[0] === "127" && octets.every(function (octet) {
        return /^\d{1,3}$/.test(octet) && Number(octet) <= 255;
      });
    });
  }
  function modelSource() {
    return Object.keys(S.opts).filter(function (k) {
      return reg[k] && (k === "-m" || k === "-hf" || k === "-mu" || k === "-dr" || k === "--models-dir" || reg[k].card.closest(".cat").id === "cat-presets");
    });
  }
  function checks() {
    var L = [], src = modelSource(), tools = getOpt("--tools"), agent = !!S.opts["-ag"] && !S.opts["-ag"].neg, runtime = getOpt("--tools-runtime");
    var externalRuntime = runtime && runtime !== "none";
    var host = getOpt("--host"), loop = loopbackOnly(host);
    var hasKey = getOpt("--api-key") || getOpt("--api-key-file");
    if (!src.length) L.push(["bad", "Add a model. The server has nothing to run without one."]);
    else if (src.length > 1) L.push(["warn", "More than one model source is set: " + src.join(", ") + ". Keep only one."]);
    else L.push(["ok", "Model source is set"]);
    if (!validPort(port())) L.push(["bad", "Port must be a whole number from 1 to 65535."]);
    if (!loop && !hasKey) L.push(["bad", "This opens the server to your network with no API key, so anyone on it could use your model. Add a key in Fine-tune."]);
    else if (!loop) L.push(["warn", "Your network can reach this server. It uses plain HTTP unless you add SSL options."]);
    else L.push(["ok", "Only this computer can connect"]);
    if (getOpt("--api-key")) L.push(["warn", "The API key is in the command, so it can land in shell history. --api-key-file avoids that."]);
    var danger = agent || /all|exec_shell_command|write_file|edit_file/.test(tools);
    if (danger && !externalRuntime) L.push(["bad", "Shell or write tools would run directly on your system with your permissions. Add --tools-runtime with a container first."]);
    else if (tools || agent) L.push(["warn", "Tools are on. They're experimental and can read what your account can read" + (externalRuntime ? ", inside the runtime you set." : ".")]);
    if (S.opts["-fit"] && getOpt("-fit") === "off") L.push(["warn", "Auto-sizing is off, so settings that don't fit will stop the server at startup."]);
    if (S.opts["--ui"] && S.opts["--ui"].neg) L.push(["warn", "The web UI is turned off, so Open web UI won't show a chat page."]);
    if (S.detach && S.os !== "win") L.push(["ok", "Output goes to ~/llama-server.log while it runs in the background"]);
    return L;
  }

  // ---------- Will it fit? ----------
  function fit() {
    var v = parseFloat(S.vram), s = parseFloat(S.size), meter = $("meter"), t = $("fitText");
    var known = v > 0 && s > 0, cpu = S.opts["-ngl"] && getOpt("-ngl") === "0";
    meter.hidden = !known || cpu;
    t.classList.remove("over");
    if (!known) { t.textContent = "Enter both for a rough check"; return; }
    if (cpu) { t.textContent = "CPU only: the model runs from system RAM, so GPU memory doesn't matter here."; return; }
    var total = Math.max(v, s + 1), left = v - s - 1, over = left < 0, gb = function (n) { return n.toFixed(1) + " GB"; };
    $("mModel").style.width = (s / total * 100) + "%";
    $("mMargin").style.width = (1 / total * 100) + "%";
    $("mFree").style.width = (Math.max(left, 0) / total * 100) + "%";
    $("mFree").hidden = over;
    $("mLimit").hidden = !over;
    $("mLimit").style.left = (v / total * 100) + "%";
    meter.classList.toggle("over", over);
    t.classList.toggle("over", over);
    t.textContent = over
      ? "A " + gb(s) + " model likely won't fit fully in " + gb(v) + ". Part of it will run on the CPU, which is slower. The line marks your GPU's limit."
      : "Model " + gb(s) + ", safety margin 1.0 GB, about " + gb(left) + " left for context, out of " + gb(v) + ". Your desktop also uses some.";
  }

  // ---------- Command rows ----------
  var seen = null;
  function icon(name) {
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), use = document.createElementNS(ns, "use");
    svg.setAttribute("class", "i"); svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", "#i-" + name); svg.appendChild(use);
    return svg;
  }
  function row(r, text) {
    var d = document.createElement("div"), t = document.createElement("code");
    d.className = "ln" + (r.id === "head" ? " head" : "");
    t.className = "t";
    var sp = r.id === "head" ? -1 : text.indexOf(" ");
    if (r.id !== "head" && sp > 0) {
      var f = document.createElement("span"); f.className = "f"; f.textContent = text.slice(0, sp);
      t.appendChild(f); t.appendChild(document.createTextNode(text.slice(sp)));
    } else if (r.id !== "head" && /^-/.test(text)) {
      var g = document.createElement("span"); g.className = "f"; g.textContent = text; t.appendChild(g);
    } else { t.textContent = text; }
    d.appendChild(t);
    if (r.key) {
      var x = document.createElement("button"); x.type = "button"; x.className = "x"; x.dataset.rm = r.key;
      x.setAttribute("aria-label", "Remove " + r.text.split(" ")[0]); x.appendChild(icon("x")); d.appendChild(x);
    }
    if (r.note) {
      var n = document.createElement("button"); n.type = "button"; n.className = "nt"; n.textContent = r.note;
      if (r.key) { n.dataset.jump = r.key; } else if (r.id === "port" && reg["--port"]) { n.dataset.jump = "--port"; } else { n.className = "nt static"; n.tabIndex = -1; }
      d.appendChild(n);
    }
    return d;
  }
  function renderCmd() {
    var box = $("cmd"), p = parts(), cont = S.os === "win" ? " `" : " \\", now = {};
    box.textContent = "";
    if (S.oneLine) {
      var one = row({ id: "head", note: "" }, build()); box.appendChild(one);
      seen = null; return;
    }
    p.rows.forEach(function (r, i) {
      var last = i === p.rows.length - 1, text = r.text + (last ? p.tail : cont), id = r.key || r.id, el = row(r, text);
      now[id] = text;
      if (seen && seen[id] !== text && id !== "head") el.classList.add("fresh");
      box.appendChild(el);
      if (i === 0 && !modelSource().length) {
        var ghost = document.createElement("div"), code = document.createElement("code"), go = document.createElement("button");
        ghost.className = "ln ghost"; code.className = "t"; code.textContent = "-m /path/to/your-model.gguf";
        go.type = "button"; go.className = "nt"; go.dataset.addmodel = "1"; go.textContent = "Add your model to finish the command";
        ghost.appendChild(code); ghost.appendChild(go); box.appendChild(ghost);
      }
    });
    seen = now;
  }

  // ---------- Render ----------
  var RELEASES = "<a href=\"https://github.com/ggml-org/llama.cpp/releases\" target=\"_blank\" rel=\"noopener\">llama.cpp releases</a>";
  var INSTALL = {
    linux: "Need it? Run <code>brew install llama.cpp</code>, or get a build that matches your GPU from " + RELEASES + ".",
    mac: "Need it? Run <code>brew install llama.cpp</code>, or get a build from " + RELEASES + ".",
    win: "Need it? Run <code>winget install llama.cpp</code>, or get a build that matches your GPU from " + RELEASES + ". This command is for PowerShell."
  };
  function setVal(id, v) { var e = $(id); if (document.activeElement !== e) e.value = v; }
  function press(group, v) {
    $(group).querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === v)); });
  }
  function status() {
    var bad = checks().some(function (c) { return c[0] === "bad"; }), none = !modelSource().length;
    var text = none ? "Add a model to finish the command" : (bad ? "Fix the problem below before you run this" : "Ready to paste into a terminal");
    var st = $("statusText"); st.className = ""; st.textContent = text;
    $("barText").textContent = text;
    $("wires").classList.toggle("linked", !none && !bad);
  }
  function render() {
    press("os", S.os); press("modelMode", S.modelMode);
    $("fileWrap").hidden = S.modelMode !== "file"; $("hfWrap").hidden = S.modelMode !== "hf";
    setVal("bin", S.bin); setVal("vram", S.vram); setVal("size", S.size);
    setVal("model", getOpt("-m")); setVal("hf", getOpt("-hf"));
    setVal("ctx", getOpt("-c")); setVal("temp", getOpt("--temp")); setVal("port", getOpt("--port")); setVal("np", getOpt("-np")); setVal("apikey", getOpt("--api-key"));
    press("ctxQuick", getOpt("-c")); press("ngl", getOpt("-ngl")); press("fit", getOpt("-fit")); press("rea", getOpt("-rea"));
    var h = getOpt("--host"), loop = loopbackOnly(h); press("host", loop ? "" : h);
    $("keyWrap").hidden = !(h && !loop) && !getOpt("--api-key");
    $("libs").checked = !!S.libs; $("libsWrap").hidden = !(S.os === "linux" && S.bin.indexOf("/") >= 0);
    $("detach").checked = !!S.detach; $("detachWrap").hidden = S.os === "win"; $("oneLine").checked = !!S.oneLine;
    $("install").innerHTML = INSTALL[S.os];

    var cur = currentPreset();
    document.querySelectorAll('input[name="preset"]').forEach(function (r) { r.checked = r.value === cur; });

    renderCmd();
    var p = port();
    if (validPort(p)) $("open").href = "http://127.0.0.1:" + p + "/";
    else $("open").removeAttribute("href");
    $("open").setAttribute("aria-disabled", String(!validPort(p)));
    $("test").disabled = !validPort(p);
    var stopper = document.createElement("code");
    if (S.os === "win") {
      stopper.textContent = "Stop-Process -Name llama-server";
      $("stop").textContent = "To stop it, press Ctrl+C in its window or run ";
    } else {
      stopper.textContent = "pkill -f 'llama-server.*--port " + p + "'";
      $("stop").textContent = S.detach ? "To stop it, run " : "To stop it, press Ctrl+C in its terminal or run ";
    }
    $("stop").appendChild(stopper);

    var box = $("checks"); box.textContent = "";
    checks().forEach(function (c) {
      var li = document.createElement("li"), sp = document.createElement("span");
      li.className = c[0]; sp.textContent = c[1];
      li.appendChild(icon(c[0] === "ok" ? "ok" : "warn")); li.appendChild(sp); box.appendChild(li);
    });
    status();
    fit();

    order.forEach(function (k) {
      var r = reg[k], o = S.opts[k], add = r.ctl.querySelector(".add"), neg = r.ctl.querySelector(".negb"), inp = r.ctl.querySelector("input");
      r.card.classList.toggle("on", !!o);
      if (add) { add.textContent = o && !o.neg ? "Remove" : "Add"; }
      if (neg) { neg.textContent = o && o.neg ? "Remove " + r.neg : "Add " + r.neg; }
      if (inp && document.activeElement !== inp) inp.value = o && o.v !== undefined ? o.v : "";
    });
    save();
  }

  // ---------- Starting points ----------
  var PRESETS = {
    auto: {},
    gpu: { "-ngl": "all", "-fit": "on" },
    long: { "-c": "32768" },
    cpu: { "-ngl": "0" },
    locked: { "--host": "127.0.0.1", "--cors-origins": "localhost" },
    readonly: { "--tools": "read_file,file_glob_search,grep_search,get_info" },
    share: { "--host": "0.0.0.0" }
  };
  var RESET_KEYS = ["-c", "-ngl", "-fit", "-rea", "--host", "--api-key", "--tools", "--cors-origins", "-np"];
  function matches(want) {
    return RESET_KEYS.every(function (k) { return k === "--api-key" || getOpt(k) === (want[k] || ""); });
  }
  function currentPreset() {
    if (profile) {
      var mine = {};
      RESET_KEYS.forEach(function (k) { var o = profile.state.opts[k]; if (o && o.v !== undefined) mine[k] = o.v; });
      if (matches(mine)) return "mine";
    }
    var names = Object.keys(PRESETS);
    for (var i = 0; i < names.length; i++) { if (matches(PRESETS[names[i]])) return names[i]; }
    return "";
  }
  function applyPreset(p) {
    if (p === "mine" && profile) { S = start(); }
    else {
      RESET_KEYS.forEach(function (k) { delete S.opts[k]; });
      var want = PRESETS[p] || {};
      Object.keys(want).forEach(function (k) { setOpt(k, want[k]); });
    }
    render();
    if (p === "share") { $("tune").open = true; $("apikey").focus(); }
  }

  // ---------- Wiring: Setup ----------
  function seg(id, fn) {
    $(id).addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) fn(b.dataset.v, b); });
  }
  seg("os", function (v) { S.os = v; if (v === "win") S.detach = false; render(); });
  seg("modelMode", function (v) { S.modelMode = v; render(); });
  seg("ctxQuick", function (v) { setOpt("-c", v); render(); });
  seg("ngl", function (v) { setOpt("-ngl", v); render(); });
  seg("fit", function (v) { setOpt("-fit", v); render(); });
  seg("rea", function (v) { setOpt("-rea", v); render(); });
  seg("host", function (v) { setOpt("--host", v); render(); });
  $("presets").addEventListener("change", function (e) { if (e.target.name === "preset") applyPreset(e.target.value); });

  function text(id, fn) { $(id).addEventListener("input", function (e) { fn(e.target.value.trim()); render(); }); }
  text("bin", function (v) { var had = S.bin.indexOf("/") >= 0; S.bin = v; if (!had && v.indexOf("/") >= 0 && S.os === "linux") S.libs = true; });
  text("vram", function (v) { S.vram = v; }); text("size", function (v) { S.size = v; });
  text("model", function (v) { setOpt("-m", v); if (v) delete S.opts["-hf"]; });
  text("hf", function (v) { setOpt("-hf", v); if (v) delete S.opts["-m"]; });
  text("ctx", function (v) { setOpt("-c", v); }); text("temp", function (v) { setOpt("--temp", v); });
  text("port", function (v) { setOpt("--port", v); }); text("np", function (v) { setOpt("-np", v); }); text("apikey", function (v) { setOpt("--api-key", v); });
  $("libs").addEventListener("change", function (e) { S.libs = e.target.checked; render(); });
  $("detach").addEventListener("change", function (e) { S.detach = e.target.checked; render(); });
  $("oneLine").addEventListener("change", function (e) { S.oneLine = e.target.checked; render(); });

  // ---------- Wiring: option rows ----------
  var bin = $("partsbin");
  bin.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var c = b.closest(".ctl"); if (!c) return;
    var k = c.dataset.key, r = reg[k], o = S.opts[k];
    if (b.classList.contains("negb")) { if (o && o.neg) delete S.opts[k]; else S.opts[k] = { neg: true }; render(); return; }
    if (o && !o.neg) { delete S.opts[k]; render(); return; }
    var inp = c.querySelector("input");
    if (r.takes) {
      var v = inp ? inp.value.trim() : "";
      if (!v && !r.optional) { if (inp) { inp.classList.add("need"); inp.focus(); } return; }
      if (inp) inp.classList.remove("need");
      S.opts[k] = v ? { v: v } : {};
    } else { S.opts[k] = {}; }
    render();
  });
  bin.addEventListener("input", function (e) {
    var inp = e.target; if (inp.tagName !== "INPUT") return;
    var c = inp.closest(".ctl"); if (!c) return;
    var k = c.dataset.key, v = inp.value.trim();
    inp.classList.remove("need");
    if (S.opts[k] && !S.opts[k].neg) { if (v) S.opts[k] = { v: v }; else if (reg[k].optional) S.opts[k] = {}; else delete S.opts[k]; render(); }
  });

  // ---------- Wiring: command column ----------
  $("cmd").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.rm) { delete S.opts[b.dataset.rm]; render(); $("cmd").focus(); return; }
    if (b.dataset.jump) { closeSheet(); jump(b.dataset.jump); return; }
    if (b.dataset.addmodel) { closeSheet(); show("setup"); $(S.modelMode === "hf" ? "hf" : "model").focus(); }
  });
  function copyTo(label, idle) {
    var done = function (m) { label.textContent = m; setTimeout(function () { label.textContent = idle; }, 1600); };
    try {
      navigator.clipboard.writeText(build()).then(function () { done("Copied"); }, function () { done("Select the text to copy"); });
    } catch (e) { done("Select the text to copy"); }
  }
  $("copy").addEventListener("click", function () { copyTo($("copyLabel"), "Copy command"); });
  $("copyBar").addEventListener("click", function () { copyTo($("copyBarLabel"), "Copy"); });
  $("reset").addEventListener("click", function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    S = start(); seen = null; render();
  });
  $("test").addEventListener("click", function () {
    var st = $("statusText"), base = "http://127.0.0.1:" + port();
    st.className = ""; st.textContent = "Checking " + base;
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 3500) : null;
    fetch(base + "/health", ctl ? { signal: ctl.signal } : {}).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) { throw new Error("status " + r.status); }
      st.className = "good"; st.textContent = "Live on port " + port();
      return fetch(base + "/props").then(function (x) { return x.json(); }).then(function (d) {
        var g = d.default_generation_settings || {}, name = d.model_alias || "";
        st.textContent = "Live on port " + port() + (name ? ": " + name : "") + (g.n_ctx ? ", context " + Number(g.n_ctx).toLocaleString() + " tokens" : "");
      }).catch(function () { /* health already passed */ });
    }).catch(function () {
      if (timer) clearTimeout(timer);
      st.className = "fail";
      st.textContent = "No answer on port " + port() + ". Check that the server is running, then try again. Browsers and --cors-origins can also block this check, so Open web UI is the surest test.";
    });
  });

  // ---------- Command sheet on smaller screens ----------
  var compactScreen = window.matchMedia("(max-width: 1179px)");
  function sheetBackground(inert) {
    document.querySelectorAll(".side, main, .bar").forEach(function (el) { el.inert = inert; });
    document.body.classList.toggle("command-open", inert);
  }
  function closeSheet() {
    if (!$("panel").classList.contains("open")) return;
    $("panel").classList.remove("open"); $("showCmd").setAttribute("aria-expanded", "false");
    $("panel").removeAttribute("role"); $("panel").removeAttribute("aria-modal");
    $("panel").removeAttribute("aria-labelledby");
    sheetBackground(false);
  }
  $("showCmd").addEventListener("click", function () {
    sheetBackground(true);
    $("panel").setAttribute("role", "dialog"); $("panel").setAttribute("aria-modal", "true");
    $("panel").setAttribute("aria-labelledby", "commandTitle");
    $("panel").classList.add("open"); $("showCmd").setAttribute("aria-expanded", "true"); $("closePanel").focus();
  });
  compactScreen.addEventListener("change", function (e) {
    if (!e.matches && $("panel").classList.contains("open")) { closeSheet(); $("cmd").focus(); }
  });
  $("closePanel").addEventListener("click", function () { closeSheet(); $("showCmd").focus(); });
  document.addEventListener("keydown", function (e) {
    if (!$("panel").classList.contains("open")) return;
    if (e.key === "Escape") { closeSheet(); $("showCmd").focus(); }
    if (e.key === "Tab") {
      var items = Array.prototype.filter.call($("panel").querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), [tabindex='0']"), function (el) { return el.getClientRects().length > 0; });
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ---------- Views, search and topics ----------
  var view = "setup", q = $("q");
  var cards = Array.prototype.slice.call(document.querySelectorAll(".opt"));
  var cats = Array.prototype.slice.call(document.querySelectorAll(".cat"));
  var groups = Array.prototype.slice.call(document.querySelectorAll(".lvgroup"));
  var hay = cards.map(function (c) { return c.textContent.toLowerCase(); });
  var catOf = cards.map(function (c) { return c.closest(".cat").id; });
  var NAMED = {
    start: ["Start here", "The options that change the most for the least effort."],
    good: ["Good to know", "Worth knowing once the basics work."],
    all: ["Every option", "All " + cards.length + " options this llama-server build accepts, by topic."]
  };
  function isOptions(v) { return v !== "setup" && v !== "guide"; }
  function filter() {
    var terms = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean), shown = 0, searching = terms.length > 0;
    cards.forEach(function (c, i) {
      var ok;
      if (searching) ok = terms.every(function (t) { return hay[i].indexOf(t) !== -1; });
      else if (view === "start") ok = c.dataset.level === "S";
      else if (view === "good") ok = c.dataset.level === "U";
      else if (view === "all") ok = true;
      else ok = catOf[i] === view;
      c.hidden = !ok; if (ok) shown++;
    });
    groups.forEach(function (g) { g.hidden = g.querySelector(".opt:not([hidden])") === null; });
    var single = !searching && !NAMED[view];
    cats.forEach(function (c) {
      c.hidden = c.querySelector(".opt:not([hidden])") === null;
      c.querySelector("h2").hidden = single;
      c.querySelector(".blurb").hidden = single;
    });
    bin.classList.toggle("flat", !searching && (view === "start" || view === "good"));
    var el = document.getElementById(view), named = NAMED[view];
    $("optTitle").textContent = searching ? "Search results" : (named ? named[0] : (el ? el.dataset.title : ""));
    $("optBlurb").textContent = searching ? "Searching names, explanations and official help across every topic." : (named ? named[1] : (el ? el.dataset.blurb : ""));
    $("tally").textContent = shown + " of " + cards.length;
    $("none").hidden = shown > 0;
  }
  function show(v) {
    view = v;
    $("v-setup").hidden = v !== "setup"; $("v-guide").hidden = v !== "guide"; $("v-options").hidden = !isOptions(v);
    document.querySelectorAll(".nav button").forEach(function (b) {
      var on = b.dataset.view === v || (b.classList.contains("only-narrow") && isOptions(v));
      if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
    if (isOptions(v)) { q.value = ""; $("topicSelect").value = v; filter(); }
    window.scrollTo(0, 0);
  }
  function jump(k) {
    var r = reg[k]; if (!r) return;
    show(r.card.closest(".cat").id);
    r.card.scrollIntoView({ block: "center" });
    var inp = r.ctl.querySelector("input, button"); if (inp) inp.focus({ preventScroll: true });
  }
  q.addEventListener("input", filter);
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-view]"); if (b) show(b.dataset.view);
  });
  (function () {
    var sel = $("topicSelect"), seenView = {};
    document.querySelectorAll(".navgroup button").forEach(function (b) {
      if (seenView[b.dataset.view]) return; seenView[b.dataset.view] = 1;
      var o = document.createElement("option"); o.value = b.dataset.view; o.textContent = b.childNodes[0].textContent; sel.appendChild(o);
    });
    sel.addEventListener("change", function () { show(sel.value); });
  })();

  // ---------- Boot ----------
  if (profile) { $("mineName").textContent = profile.name; }
  else { $("p-mine").closest("label").hidden = true; }
  function boot(snap) {
    S = (snap && snap.opts) ? snap : load();
    if (S.vram || S.size || ["-c", "-ngl", "-fit", "-rea", "--temp", "--port", "-np"].some(function (k) { return S.opts[k]; })) $("tune").open = true;
    render();
    show("setup");
  }
  window.JC = { state: function () { return S; }, build: build, set: function (s) { S = s; render(); }, preset: applyPreset, checks: checks, show: show };
  if (window.claude && window.claude.hot) {
    window.claude.hot.snapshot(function () { return S; });
    if (window.claude.hot.ready) window.claude.hot.ready(boot); else boot(window.claude.hot.data || {});
  } else { boot({}); }
})();
