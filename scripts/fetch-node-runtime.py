#!/usr/bin/env python3
"""Fetch and validate a pinned official macOS Node.js runtime."""

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import Optional


NODE_VERSION = (Path(__file__).resolve().parents[1] / ".nvmrc").read_text().strip()
ARCHIVE_SHA256 = {
    "arm64": "7ee659a7768e641bbfd5360940660b8e8fd0052f77488f365562bac522fc15d4",
    "x64": "f279d1ed28ce57f7788bf23435d2ad7fdd7438904ad5c4d8a1081a7cde3d4b96",
}
RELEASE_BASE_URL = f"https://nodejs.org/dist/v{NODE_VERSION}"
MARKER_NAME = ".godl-node-runtime.json"
LICENSE_SHA256 = "5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace"


def archive_name(architecture: str) -> str:
    return f"node-v{NODE_VERSION}-darwin-{architecture}.tar.gz"


def normalized_architecture(value: object) -> Optional[str]:
    return {"arm64": "arm64", "aarch64": "arm64", "x64": "x64", "x86_64": "x64"}.get(
        str(value)
    )


def host_architecture() -> Optional[str]:
    return normalized_architecture(platform.machine())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def command_output(command: list[str]) -> str:
    return subprocess.check_output(command, text=True, stderr=subprocess.STDOUT).strip()


def runtime_facts(root: Path, architecture: str) -> dict[str, object]:
    node = root / "bin" / "node"
    license_file = root / "LICENSE"
    if not node.is_file() or not os.access(node, os.X_OK):
        raise SystemExit(f"Missing executable Node runtime: {node}")
    if not license_file.is_file():
        raise SystemExit(f"Missing official Node LICENSE: {license_file}")
    license_checksum = sha256(license_file)
    if license_checksum != LICENSE_SHA256:
        raise SystemExit("Node LICENSE no longer matches the pinned official release")

    architectures = command_output(["/usr/bin/lipo", "-archs", str(node)]).split()
    expected_macho_architecture = {"arm64": "arm64", "x64": "x86_64"}[architecture]
    if architectures != [expected_macho_architecture]:
        raise SystemExit(
            f"Expected a thin {architecture} Node executable, found: {' '.join(architectures)}"
        )

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
    if minimum_macos is None:
        raise SystemExit("Node runtime has no readable macOS deployment target")

    # A foreign Mach-O can be inspected without Rosetta. Only execute Node when
    # its architecture matches the host; the pinned official archive checksum
    # supplies version provenance for foreign runtimes.
    version = f"v{NODE_VERSION}"
    if host_architecture() == architecture:
        version = command_output([str(node), "--version"])
        if version != f"v{NODE_VERSION}":
            raise SystemExit(f"Expected Node v{NODE_VERSION}, found {version}")

    return {
        "version": version,
        "architecture": architecture,
        "nodeSha256": sha256(node),
        "licenseSha256": license_checksum,
        "dynamicDependencies": dependencies,
        "minimumMacOS": minimum_macos,
    }


def validate_runtime(root: Path, architecture: Optional[str] = None) -> dict[str, object]:
    root = root.expanduser().resolve()
    marker_path = root / MARKER_NAME
    if not marker_path.is_file():
        raise SystemExit(
            f"Runtime provenance marker is missing: {marker_path}\n"
            "Use this script to fetch the official runtime."
        )
    marker = json.loads(marker_path.read_text())
    marker_architecture = normalized_architecture(marker.get("architecture"))
    if marker_architecture is None:
        raise SystemExit(
            f"Runtime provenance has an unrecognized architecture: {marker.get('architecture')!r}"
        )
    if architecture is not None and architecture != marker_architecture:
        raise SystemExit(
            f"Runtime architecture mismatch: requested {architecture}, marker is {marker_architecture}"
        )
    architecture = marker_architecture
    expected_archive = archive_name(architecture)
    expected = {
        "nodeVersion": NODE_VERSION,
        "archiveName": expected_archive,
        "archiveSha256": ARCHIVE_SHA256[architecture],
        "sourceUrl": f"{RELEASE_BASE_URL}/{expected_archive}",
        "manifestUrl": f"{RELEASE_BASE_URL}/SHASUMS256.txt",
    }
    for key, value in expected.items():
        if marker.get(key) != value:
            raise SystemExit(f"Runtime provenance mismatch for {key}: expected {value!r}")

    facts = runtime_facts(root, architecture)
    if marker.get("nodeSha256") != facts["nodeSha256"]:
        raise SystemExit("Node executable no longer matches the verified extracted runtime")
    if marker.get("licenseSha256", facts["licenseSha256"]) != facts["licenseSha256"]:
        raise SystemExit("Node LICENSE no longer matches its provenance marker")
    if normalized_architecture(marker.get("architecture")) != facts["architecture"]:
        raise SystemExit("Node executable architecture no longer matches its provenance marker")
    if marker.get("version") != facts["version"]:
        raise SystemExit("Node executable version no longer matches its provenance marker")
    if marker.get("dynamicDependencies") != facts["dynamicDependencies"]:
        raise SystemExit("Node executable dependencies no longer match its provenance marker")
    if marker.get("minimumMacOS") != facts["minimumMacOS"]:
        raise SystemExit("Node executable deployment target no longer matches its provenance marker")
    return facts


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "GODL-Monitor-runtime-fetcher/1"})
    with urllib.request.urlopen(request) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def fetch_runtime(cache_dir: Path, architecture: str = "arm64") -> Path:
    cache_dir = cache_dir.expanduser().resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)
    expected_archive = archive_name(architecture)
    expected_checksum = ARCHIVE_SHA256[architecture]
    root = cache_dir / f"node-v{NODE_VERSION}-darwin-{architecture}"
    if root.exists():
        validate_runtime(root, architecture)
        return root

    with tempfile.TemporaryDirectory(prefix="godl-node-download-", dir=cache_dir) as temporary:
        temporary_path = Path(temporary)
        manifest = temporary_path / "SHASUMS256.txt"
        archive = temporary_path / expected_archive
        download(f"{RELEASE_BASE_URL}/SHASUMS256.txt", manifest)
        manifest_entries = {
            name: checksum
            for checksum, name in (
                line.split(maxsplit=1) for line in manifest.read_text().splitlines() if line.strip()
            )
        }
        manifest_checksum = manifest_entries.get(expected_archive)
        if manifest_checksum != expected_checksum:
            raise SystemExit(
                f"Official manifest checksum mismatch for {expected_archive}: {manifest_checksum!r}"
            )

        download(f"{RELEASE_BASE_URL}/{expected_archive}", archive)
        actual_checksum = sha256(archive)
        if actual_checksum != expected_checksum:
            raise SystemExit(
                f"Downloaded archive checksum mismatch: expected {expected_checksum}, got {actual_checksum}"
            )

        extraction = temporary_path / "extracted"
        extraction.mkdir()
        with tarfile.open(archive, "r:gz") as bundle:
            bundle.extractall(extraction, filter="data")
        extracted_root = extraction / root.name
        if not extracted_root.is_dir():
            raise SystemExit(f"Official archive did not contain expected root: {root.name}")

        facts = runtime_facts(extracted_root, architecture)
        marker = {
            "nodeVersion": NODE_VERSION,
            "archiveName": expected_archive,
            "archiveSha256": expected_checksum,
            "sourceUrl": f"{RELEASE_BASE_URL}/{expected_archive}",
            "manifestUrl": f"{RELEASE_BASE_URL}/SHASUMS256.txt",
            **facts,
        }
        (extracted_root / MARKER_NAME).write_text(json.dumps(marker, indent=2) + "\n")
        extracted_root.rename(root)

    validate_runtime(root, architecture)
    return root


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch or validate a pinned official Node.js runtime. Foreign architectures are "
            "validated through official provenance and static Mach-O inspection without Rosetta."
        )
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path.home() / "Library" / "Caches" / "GODL Monitor" / "node-runtime",
        help="External cache for the verified official runtime",
    )
    parser.add_argument(
        "--arch",
        choices=sorted(ARCHIVE_SHA256),
        help="Runtime architecture (fetch default: arm64; validation default: marker architecture)",
    )
    parser.add_argument("--validate", type=Path, help="Validate an existing fetched runtime root")
    args = parser.parse_args()

    if args.validate:
        root = args.validate.expanduser().resolve()
        validate_runtime(root, args.arch)
    else:
        architecture = args.arch or "arm64"
        root = fetch_runtime(args.cache_dir, architecture)
        validate_runtime(root, architecture)
    print(root)


if __name__ == "__main__":
    main()
