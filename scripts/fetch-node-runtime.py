#!/usr/bin/env python3
"""Fetch and validate the pinned official Apple Silicon Node.js runtime."""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path


NODE_VERSION = "26.7.0"
ARCHIVE_NAME = f"node-v{NODE_VERSION}-darwin-arm64.tar.gz"
ARCHIVE_SHA256 = "7ee659a7768e641bbfd5360940660b8e8fd0052f77488f365562bac522fc15d4"
RELEASE_BASE_URL = f"https://nodejs.org/dist/v{NODE_VERSION}"
MARKER_NAME = ".godl-node-runtime.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def command_output(command: list[str]) -> str:
    return subprocess.check_output(command, text=True, stderr=subprocess.STDOUT).strip()


def runtime_facts(root: Path) -> dict[str, object]:
    node = root / "bin" / "node"
    license_file = root / "LICENSE"
    if not node.is_file() or not os.access(node, os.X_OK):
        raise SystemExit(f"Missing executable Node runtime: {node}")
    if not license_file.is_file():
        raise SystemExit(f"Missing official Node LICENSE: {license_file}")

    version = command_output([str(node), "--version"])
    if version != f"v{NODE_VERSION}":
        raise SystemExit(f"Expected Node v{NODE_VERSION}, found {version}")

    architectures = command_output(["/usr/bin/lipo", "-archs", str(node)]).split()
    if architectures != ["arm64"]:
        raise SystemExit(f"Expected a thin arm64 Node executable, found: {' '.join(architectures)}")

    linkage = command_output(["/usr/bin/otool", "-L", str(node)]).splitlines()[1:]
    dependencies = [line.strip().split(" (", 1)[0] for line in linkage if line.strip()]
    non_system = [
        dependency
        for dependency in dependencies
        if not dependency.startswith(("/usr/lib/", "/System/Library/"))
    ]
    if non_system:
        raise SystemExit(f"Node runtime has non-system dynamic dependencies: {', '.join(non_system)}")

    load_commands = command_output(["/usr/bin/otool", "-l", str(node)])
    minimum_macos = None
    match = re.search(
        r"cmd LC_BUILD_VERSION.*?\n\s*cmdsize .*?\n\s*platform (?:MACOS|1).*?\n\s*minos ([^\s]+)",
        load_commands,
        re.DOTALL,
    )
    if match:
        minimum_macos = match.group(1)

    return {
        "version": version,
        "architecture": architectures[0],
        "nodeSha256": sha256(node),
        "dynamicDependencies": dependencies,
        "minimumMacOS": minimum_macos,
    }


def validate_runtime(root: Path) -> dict[str, object]:
    root = root.expanduser().resolve()
    marker_path = root / MARKER_NAME
    if not marker_path.is_file():
        raise SystemExit(
            f"Runtime provenance marker is missing: {marker_path}\n"
            "Use this script to fetch the official runtime."
        )
    marker = json.loads(marker_path.read_text())
    expected = {
        "nodeVersion": NODE_VERSION,
        "archiveName": ARCHIVE_NAME,
        "archiveSha256": ARCHIVE_SHA256,
        "sourceUrl": f"{RELEASE_BASE_URL}/{ARCHIVE_NAME}",
        "manifestUrl": f"{RELEASE_BASE_URL}/SHASUMS256.txt",
    }
    for key, value in expected.items():
        if marker.get(key) != value:
            raise SystemExit(f"Runtime provenance mismatch for {key}: expected {value!r}")

    facts = runtime_facts(root)
    if marker.get("nodeSha256") != facts["nodeSha256"]:
        raise SystemExit("Node executable no longer matches the verified extracted runtime")
    if marker.get("architecture") != facts["architecture"]:
        raise SystemExit("Node executable architecture no longer matches its provenance marker")
    if marker.get("minimumMacOS") != facts["minimumMacOS"]:
        raise SystemExit("Node executable deployment target no longer matches its provenance marker")
    return facts


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "GODL-Monitor-runtime-fetcher/1"})
    with urllib.request.urlopen(request) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def fetch_runtime(cache_dir: Path) -> Path:
    cache_dir = cache_dir.expanduser().resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)
    root = cache_dir / f"node-v{NODE_VERSION}-darwin-arm64"
    if root.exists():
        validate_runtime(root)
        return root

    with tempfile.TemporaryDirectory(prefix="godl-node-download-", dir=cache_dir) as temporary:
        temporary_path = Path(temporary)
        manifest = temporary_path / "SHASUMS256.txt"
        archive = temporary_path / ARCHIVE_NAME
        download(f"{RELEASE_BASE_URL}/SHASUMS256.txt", manifest)
        manifest_entries = {
            name: checksum
            for checksum, name in (
                line.split(maxsplit=1) for line in manifest.read_text().splitlines() if line.strip()
            )
        }
        manifest_checksum = manifest_entries.get(ARCHIVE_NAME)
        if manifest_checksum != ARCHIVE_SHA256:
            raise SystemExit(
                f"Official manifest checksum mismatch for {ARCHIVE_NAME}: {manifest_checksum!r}"
            )

        download(f"{RELEASE_BASE_URL}/{ARCHIVE_NAME}", archive)
        actual_checksum = sha256(archive)
        if actual_checksum != ARCHIVE_SHA256:
            raise SystemExit(
                f"Downloaded archive checksum mismatch: expected {ARCHIVE_SHA256}, got {actual_checksum}"
            )

        extraction = temporary_path / "extracted"
        extraction.mkdir()
        with tarfile.open(archive, "r:gz") as bundle:
            bundle.extractall(extraction, filter="data")
        extracted_root = extraction / root.name
        if not extracted_root.is_dir():
            raise SystemExit(f"Official archive did not contain expected root: {root.name}")

        facts = runtime_facts(extracted_root)
        marker = {
            "nodeVersion": NODE_VERSION,
            "archiveName": ARCHIVE_NAME,
            "archiveSha256": ARCHIVE_SHA256,
            "sourceUrl": f"{RELEASE_BASE_URL}/{ARCHIVE_NAME}",
            "manifestUrl": f"{RELEASE_BASE_URL}/SHASUMS256.txt",
            **facts,
        }
        (extracted_root / MARKER_NAME).write_text(json.dumps(marker, indent=2) + "\n")
        extracted_root.rename(root)

    validate_runtime(root)
    return root


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path.home() / "Library" / "Caches" / "GODL Monitor" / "node-runtime",
        help="External cache for the verified official runtime",
    )
    parser.add_argument("--validate", type=Path, help="Validate an existing fetched runtime root")
    args = parser.parse_args()

    root = args.validate.expanduser().resolve() if args.validate else fetch_runtime(args.cache_dir)
    validate_runtime(root)
    print(root)


if __name__ == "__main__":
    main()
