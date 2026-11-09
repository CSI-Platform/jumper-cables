#!/usr/bin/env python3
"""The CLI, the static commands, and llms.txt print the same strings."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import engine  # noqa: E402


def run_jc(*args):
    return subprocess.run(
        [sys.executable, str(ROOT / "src" / "jc.py"), *args],
        capture_output=True,
        text=True,
    )


class CommandTests(unittest.TestCase):
    def test_posix_quoting_matches_the_page(self):
        self.assertEqual(engine.q_posix("/path/to/your-model.gguf"), "/path/to/your-model.gguf")
        self.assertEqual(engine.q_posix("~/models/qwen.gguf"), "~/models/qwen.gguf")
        self.assertEqual(engine.q_posix("~/models/My Model.gguf"), "~/'models/My Model.gguf'")
        self.assertEqual(
            engine.q_posix("/models/O'Brien $(printf unexpected) & model.gguf"),
            "'/models/O'\\''Brien $(printf unexpected) & model.gguf'",
        )

    def test_powershell_quoting_matches_the_page(self):
        self.assertEqual(
            engine.q_ps("C:\\O'Brien Folder\\llama-server.exe"),
            "'C:\\O''Brien Folder\\llama-server.exe'",
        )

    def test_quoted_posix_command_passes_paths_literally(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / "bin with ' spaces"
            folder.mkdir()
            executable = folder / "llama-server"
            executable.write_text("#!/usr/bin/env python3\nimport json,sys\nprint(json.dumps(sys.argv[1:]))\n")
            executable.chmod(0o700)
            model = "/models/O'Brien $(printf unexpected) & model.gguf"
            command = engine.build(engine.Request(bin=str(executable), model=model, preset="gpu"))
            output = subprocess.run(["bash", "-c", command], capture_output=True, text=True, timeout=5)
            self.assertEqual(output.returncode, 0, output.stderr)
            self.assertEqual(
                json.loads(output.stdout),
                ["-m", model, "--n-gpu-layers", "all", "--fit", "on", "--port", "8080"],
            )

    def test_four_linux_commands(self):
        expected = {
            "gpu": "llama-server \\\n  -m /path/to/your-model.gguf \\\n  --n-gpu-layers all \\\n  --fit on \\\n  --port 8080",
            "long": "llama-server \\\n  -m /path/to/your-model.gguf \\\n  --ctx-size 32768 \\\n  --port 8080",
            "cpu": "llama-server \\\n  -m /path/to/your-model.gguf \\\n  --n-gpu-layers 0 \\\n  --port 8080",
            "readonly": "llama-server \\\n  -m /path/to/your-model.gguf \\\n  --tools read_file,file_glob_search,grep_search,get_info \\\n  --port 8080",
        }
        for preset, command in expected.items():
            self.assertEqual(engine.build(engine.example_request(preset)), command)

    def test_macos_matches_linux_for_a_path_on_path(self):
        linux = engine.build(engine.example_request("gpu"))
        mac = engine.build(engine.Request(os="mac", preset="gpu", model=engine.EXAMPLE_MODEL))
        self.assertEqual(mac, linux)

    def test_windows_uses_powershell_continuations(self):
        command = engine.build(engine.Request(
            os="win", preset="readonly", model="C:\\models\\x.gguf", bin="C:\\O'Brien Folder\\llama-server.exe",
        ))
        self.assertTrue(command.startswith("& 'C:\\O''Brien Folder\\llama-server.exe' `\n"))
        self.assertIn("  --tools read_file,file_glob_search,grep_search,get_info `\n", command)
        self.assertTrue(command.endswith("  --port 8080"))

    def test_readonly_warning_and_fit_notes(self):
        notes = engine.notable(engine.example_request("readonly"))
        self.assertIn("Tools are on. They're experimental and can read what your account can read.", notes)
        fit = engine.notable(engine.Request(preset="gpu", model=engine.EXAMPLE_MODEL, vram="6", size="2"))
        self.assertTrue(any("3.0 GB left" in line for line in fit))
        cpu = engine.notable(engine.Request(preset="cpu", model=engine.EXAMPLE_MODEL, vram="6", size="8"))
        self.assertIn("CPU only: the model runs from system RAM, so GPU memory doesn't matter here.", cpu)

    def test_cli_prints_the_page_command_and_refuses_a_missing_model(self):
        good = run_jc("--preset", "all-gpu", "--model", engine.EXAMPLE_MODEL)
        self.assertEqual(good.returncode, 0, good.stderr)
        self.assertTrue(good.stdout.startswith(engine.build(engine.example_request("gpu")) + "\n"))
        self.assertIn("Every layer on the GPU", good.stdout)
        missing = run_jc("--preset", "gpu")
        self.assertEqual(missing.returncode, 2)
        self.assertIn("Add a model. The server has nothing to run without one.", missing.stdout)
        self.assertIn("llama-server", missing.stdout)
        listed = run_jc("--list")
        self.assertEqual(listed.returncode, 0)
        self.assertIn("long (long-memory)", listed.stdout)
        unknown = run_jc("--preset", "share", "--model", engine.EXAMPLE_MODEL)
        self.assertEqual(unknown.returncode, 2)
        self.assertIn("Unknown preset", unknown.stderr)

    def test_published_text_matches_the_engine_and_skips_private_profiles(self):
        readme = (ROOT / "README.md").read_text()
        for spec in engine.ANSWERS:
            command = engine.build(engine.example_request(spec["id"]))
            self.assertIn(command, readme)
            self.assertIn(spec["blurb"], readme)
        subprocess.check_call([sys.executable, str(ROOT / "src" / "build.py")], cwd=ROOT)
        llms = (ROOT / "public" / "llms.txt").read_text()
        page = (ROOT / "public" / "index.html").read_text()
        head = page.split('<script type="application/json" id="profile">', 1)[0]
        for spec in engine.ANSWERS:
            command = engine.build(engine.example_request(spec["id"]))
            self.assertIn(command, llms)
            self.assertIn(command, head)
        self.assertIn("https://jc.csi.run", llms)
        before = (ROOT / "public" / "llms.txt").read_text()
        profile = {
            "name": "SECRET-MACHINE",
            "state": {"os": "linux", "opts": {"-m": {"v": "/secret/model.gguf"}}},
            "current": [],
            "measured": [],
            "machine": "secret bench",
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "profile.json"
            out = Path(directory) / "index.html"
            path.write_text(json.dumps(profile))
            subprocess.check_call(
                [sys.executable, str(ROOT / "src" / "build.py"), "--profile", str(path), "--out", str(out)],
                cwd=ROOT,
            )
            self.assertIn("SECRET-MACHINE", out.read_text())
        self.assertEqual((ROOT / "public" / "llms.txt").read_text(), before)
        self.assertNotIn("SECRET-MACHINE", before)
        self.assertNotIn("/secret/model.gguf", before)


if __name__ == "__main__":
    unittest.main()
