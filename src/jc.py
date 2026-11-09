#!/usr/bin/env python3
"""Print a llama-server command for one Jumper Cables starting point.

    python3 src/jc.py --preset gpu --model /path/to/your-model.gguf
    python3 src/jc.py --preset readonly --os win --model C:\\models\\x.gguf
"""
import argparse
import sys

import engine


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="jc",
        description="Print the llama-server command for a Jumper Cables starting point.",
    )
    parser.add_argument("--list", action="store_true", help="show the four starting points")
    parser.add_argument("--preset", help="gpu, long, cpu, or readonly (aliases: all-gpu, long-memory, cpu-only, read-only)")
    parser.add_argument("--os", choices=("linux", "mac", "win"), default="linux")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--model", default="", help="path to a .gguf file")
    source.add_argument("--hf", default="", help="Hugging Face repo, such as org/model-GGUF:Q4_K_M")
    parser.add_argument("--bin", default="", help="llama-server path, if it is not on PATH")
    parser.add_argument("--port", default="", help="port to listen on (default 8080)")
    parser.add_argument("--vram", default="", help="GPU memory in GB, for the fit note only")
    parser.add_argument("--size", default="", help="model file size in GB, for the fit note only")
    args = parser.parse_args(argv)
    if args.list:
        sys.stdout.write(engine.list_text())
        return 0
    if not args.preset:
        parser.error("pass --preset, or --list to see the starting points")
    text, code = engine.report(engine.Request(
        os=args.os,
        model=args.model,
        hf=args.hf,
        bin=args.bin,
        port=args.port,
        preset=args.preset,
        vram=args.vram,
        size=args.size,
    ))
    sys.stdout.write(text)
    return code


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ValueError as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(2)
