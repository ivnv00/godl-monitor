#!/usr/bin/env python3
"""Fetch and validate a pinned official macOS Node.js runtime."""

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import stat
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
NODE_SHA256 = {
    "arm64": "a9bd0630891c2dcdee70de88270fee2cc0c4a9e76495039dd3b4f91c5e6b71df",
    "x64": "d9a9f09626f3105702784a83f08db6e5bd4b7fa3ce1a80800274ee29ff27175a",
}
NPM_TREE_SHA256 = {
    "arm64": "ebdcbe75109b001c42ff3eb89084a997cd0bf1e04b9536211617bd3a4d5e3bb0",
    "x64": "ebdcbe75109b001c42ff3eb89084a997cd0bf1e04b9536211617bd3a4d5e3bb0",
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


def tree_sha256(root: Path) -> str:
    if not root.is_dir() or root.is_symlink():
        raise SystemExit(f"Authenticated tree is missing or invalid: {root}")
    boundary = root.resolve()
    digest = hashlib.sha256()

    def add_field(value: bytes) -> None:
        digest.update(len(value).to_bytes(8, "big"))
        digest.update(value)

    def visit(path: Path, relative: str) -> None:
        metadata = path.lstat()
        mode = f"{stat.S_IMODE(metadata.st_mode):04o}".encode()
        if stat.S_ISLNK(metadata.st_mode):
            target = os.readlink(path)
            try:
                resolved = (path.parent / target).resolve(strict=True)
            except (OSError, RuntimeError) as error:
                raise SystemExit(f"Authenticated tree has an invalid symlink: {relative}") from error
            if os.path.isabs(target) or not resolved.is_relative_to(boundary):
                raise SystemExit(f"Authenticated tree symlink escapes authenticated root: {relative}")
            kind = b"symlink"
            payload = os.fsencode(target)
        elif stat.S_ISDIR(metadata.st_mode):
            kind = b"directory"
            payload = b""
        elif stat.S_ISREG(metadata.st_mode):
            kind = b"file"
            payload = bytes.fromhex(sha256(path))
        else:
            raise SystemExit(f"Authenticated tree contains an unsupported entry: {relative}")
        for field in (kind, os.fsencode(relative), mode, payload):
            add_field(field)
        if kind == b"directory":
            for child in sorted(path.iterdir(), key=lambda item: os.fsencode(item.name)):
                child_relative = child.name if relative == "." else f"{relative}/{child.name}"
                visit(child, child_relative)

    visit(root, ".")
    return digest.hexdigest()


def validate_cached_payload(root: Path, architecture: str) -> dict[str, str]:
    node = root / "bin/node"
    if node.is_symlink() or not node.is_file() or not os.access(node, os.X_OK):
        raise SystemExit(f"Missing executable Node runtime: {node}")
    node_checksum = sha256(node)
    if node_checksum != NODE_SHA256[architecture]:
        raise SystemExit("Node executable does not match the pinned official archive")
    npm_checksum = tree_sha256(root / "lib/node_modules/npm")
    if npm_checksum != NPM_TREE_SHA256[architecture]:
        raise SystemExit("npm tree does not match the pinned official archive")
    return {"nodeSha256": node_checksum, "npmTreeSha256": npm_checksum}


def command_output(command: list[str]) -> str:
    return subprocess.check_output(command, text=True, stderr=subprocess.STDOUT).strip()


def runtime_facts(root: Path, architecture: str, payload: Optional[dict[str, str]] = None) -> dict[str, object]:
    if payload is None:
        payload = validate_cached_payload(root, architecture)
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
        **payload,
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

    payload = validate_cached_payload(root, architecture)
    facts = runtime_facts(root, architecture, payload)
    if marker.get("nodeSha256") != facts["nodeSha256"]:
        raise SystemExit("Node executable no longer matches the verified extracted runtime")
    if marker.get("npmTreeSha256", facts["npmTreeSha256"]) != facts["npmTreeSha256"]:
        raise SystemExit("npm tree no longer matches its provenance marker")
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

        payload = validate_cached_payload(extracted_root, architecture)
        facts = runtime_facts(extracted_root, architecture, payload)
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
