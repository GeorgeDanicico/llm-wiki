#!/usr/bin/env python3
"""Create a device token for the study site's progress server.

The device keeps the token; the server stores only its SHA-256 hash, in
PROGRESS_TOKEN_HASHES=name:sha256hex,name:sha256hex (in /etc/llm-wiki/study.env
on the VPS). Never put the token itself in that variable: the server refuses to
start.

Usage:
  python3 scripts/new_device_token.py phone
      Prints a new token for the device and the entry to store.
  python3 scripts/new_device_token.py --hash-only phone
      Reads an existing token from stdin (not echoed) and prints only the entry,
      for converting a raw token that was stored by mistake.
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

from progress_server import NAME_RE  # noqa: E402


def entry(name: str, token: str) -> str:
    return f"{name}:{hashlib.sha256(token.encode()).hexdigest()}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a progress-server device token and its hash entry.")
    parser.add_argument("name", help="device name: letters, digits, '.', '_' or '-', at most 40 characters")
    parser.add_argument("--hash-only", action="store_true", help="hash an existing token read from stdin")
    args = parser.parse_args()
    if not NAME_RE.match(args.name):
        parser.error("device name must be 1 to 40 letters, digits, '.', '_' or '-'")

    if args.hash_only:
        token = getpass.getpass("Token: ") if sys.stdin.isatty() else sys.stdin.read()
        token = token.strip()
        if not token:
            parser.error("no token on stdin")
        print(entry(args.name, token))
        return 0

    token = secrets.token_urlsafe(32)
    print(f"Token for {args.name} (paste into Settings → Sync across devices; keep it secret):")
    print(f"  {token}")
    print("Add this entry to PROGRESS_TOKEN_HASHES (comma-separated), then redeploy or restart the container:")
    print(f"  {entry(args.name, token)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
