#!/usr/bin/env python3
"""Focused tests for the pinned dual-architecture Node runtime fetcher."""

import importlib.util
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).with_name("fetch-node-runtime.py")
SPEC = importlib.util.spec_from_file_location("fetch_node_runtime", SCRIPT)
assert SPEC and SPEC.loader
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


class NodeRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.license_patch = mock.patch.object(
            runtime,
            "LICENSE_SHA256",
            runtime.hashlib.sha256(b"official license\n").hexdigest(),
        )
        self.license_patch.start()
        self.addCleanup(self.license_patch.stop)
        self.node_sha_patch = mock.patch.object(
            runtime,
            "NODE_SHA256",
            {architecture: runtime.hashlib.sha256(b"official-node-binary").hexdigest()
             for architecture in ("arm64", "x64")},
        )
        self.node_sha_patch.start()
        self.addCleanup(self.node_sha_patch.stop)
        self.npm_hashes: dict[str, str] = {}
        self.npm_sha_patch = mock.patch.object(runtime, "NPM_TREE_SHA256", self.npm_hashes)
        self.npm_sha_patch.start()
        self.addCleanup(self.npm_sha_patch.stop)

    def make_runtime(self, architecture: str) -> tuple[tempfile.TemporaryDirectory, Path]:
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name) / f"node-v{runtime.NODE_VERSION}-darwin-{architecture}"
        node = root / "bin" / "node"
        node.parent.mkdir(parents=True)
        node.write_bytes(b"official-node-binary")
        node.chmod(0o755)
        (root / "LICENSE").write_text("official license\n")
        npm = root / "lib/node_modules/npm"
        (npm / "bin").mkdir(parents=True)
        (npm / "bin/npm-cli.js").write_text("// official npm cli\n")
        (npm / "README.md").write_text("official npm\n")
        self.npm_hashes[architecture] = runtime.tree_sha256(npm)
        marker = {
            "nodeVersion": runtime.NODE_VERSION,
            "archiveName": runtime.archive_name(architecture),
            "archiveSha256": runtime.ARCHIVE_SHA256[architecture],
            "sourceUrl": f"{runtime.RELEASE_BASE_URL}/{runtime.archive_name(architecture)}",
            "manifestUrl": f"{runtime.RELEASE_BASE_URL}/SHASUMS256.txt",
            "version": f"v{runtime.NODE_VERSION}",
            "architecture": architecture,
            "nodeSha256": runtime.sha256(node),
            "npmTreeSha256": self.npm_hashes[architecture],
            "dynamicDependencies": ["/usr/lib/libSystem.B.dylib"],
            "minimumMacOS": "13.5",
        }
        (root / runtime.MARKER_NAME).write_text(json.dumps(marker))
        return temporary, root

    @staticmethod
    def static_command_output(calls: list[list[str]]):
        def output(command: list[str]) -> str:
            calls.append(command)
            if command[:2] == ["/usr/bin/lipo", "-archs"]:
                return "x86_64"
            if command[:2] == ["/usr/bin/otool", "-L"]:
                return f"{command[-1]}:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)"
            if command[:2] == ["/usr/bin/otool", "-l"]:
                return "cmd LC_BUILD_VERSION\n  cmdsize 32\n platform MACOS\n    minos 13.5"
            raise AssertionError(f"Unexpected execution: {command}")

        return output

    def test_main_defaults_fetch_to_arm64_and_routes_explicit_x64(self) -> None:
        for arguments, expected in [([], "arm64"), (["--arch", "x64"], "x64")]:
            with self.subTest(arguments=arguments), mock.patch.object(
                sys, "argv", [str(SCRIPT), *arguments]
            ), mock.patch.object(
                runtime, "fetch_runtime", return_value=Path("/runtime")
            ) as fetch, mock.patch.object(runtime, "validate_runtime") as validate, redirect_stdout(
                StringIO()
            ):
                runtime.main()
                self.assertEqual(fetch.call_args.args[1], expected)
                validate.assert_called_once_with(Path("/runtime"), expected)

    def test_validate_uses_x64_marker_without_executing_foreign_node(self) -> None:
        temporary, root = self.make_runtime("x64")
        self.addCleanup(temporary.cleanup)
        calls: list[list[str]] = []
        with mock.patch.object(runtime, "host_architecture", return_value="arm64"), mock.patch.object(
            runtime, "command_output", side_effect=self.static_command_output(calls)
        ):
            facts = runtime.validate_runtime(root)

        self.assertEqual(facts["architecture"], "x64")
        self.assertFalse(any(call[0] == str(root / "bin" / "node") for call in calls))

    def test_validate_rejects_explicit_architecture_mismatch(self) -> None:
        temporary, root = self.make_runtime("x64")
        self.addCleanup(temporary.cleanup)
        with self.assertRaisesRegex(
            SystemExit, "requested arm64, marker is x64"
        ), mock.patch.object(runtime, "command_output") as command:
            runtime.validate_runtime(root, "arm64")
        command.assert_not_called()

    def test_validate_executes_node_for_matching_host(self) -> None:
        temporary, root = self.make_runtime("x64")
        self.addCleanup(temporary.cleanup)
        calls: list[list[str]] = []
        static_output = self.static_command_output(calls)

        def output(command: list[str]) -> str:
            resolved_node = str(root.resolve() / "bin" / "node")
            if command == [resolved_node, "--version"]:
                calls.append(command)
                return f"v{runtime.NODE_VERSION}"
            return static_output(command)

        with mock.patch.object(runtime, "host_architecture", return_value="x64"), mock.patch.object(
            runtime, "command_output", side_effect=output
        ):
            runtime.validate_runtime(root)
        self.assertIn([str(root.resolve() / "bin" / "node"), "--version"], calls)

    def test_validate_rejects_provenance_checksum_tamper(self) -> None:
        temporary, root = self.make_runtime("x64")
        self.addCleanup(temporary.cleanup)
        marker_path = root / runtime.MARKER_NAME
        marker = json.loads(marker_path.read_text())
        marker["archiveSha256"] = "0" * 64
        marker_path.write_text(json.dumps(marker))
        with self.assertRaisesRegex(
            SystemExit, "provenance mismatch for archiveSha256"
        ), mock.patch.object(runtime, "command_output") as command:
            runtime.validate_runtime(root)
        command.assert_not_called()

    def test_validate_rejects_forged_marker_and_binary_tamper_before_execution(self) -> None:
        temporary, root = self.make_runtime("x64")
        self.addCleanup(temporary.cleanup)
        (root / "bin" / "node").write_bytes(b"tampered-node-binary")
        marker_path = root / runtime.MARKER_NAME
        marker = json.loads(marker_path.read_text())
        marker["nodeSha256"] = runtime.sha256(root / "bin/node")
        marker_path.write_text(json.dumps(marker))
        with mock.patch.object(runtime, "host_architecture", return_value="x64"), mock.patch.object(
            runtime, "command_output"
        ) as command, self.assertRaisesRegex(
            SystemExit, "Node executable does not match the pinned official archive"
        ):
            runtime.validate_runtime(root)
        command.assert_not_called()

    def test_runtime_facts_authenticates_node_before_host_execution(self) -> None:
        temporary, root = self.make_runtime("x64")
        self.addCleanup(temporary.cleanup)
        (root / "bin/node").write_bytes(b"tampered-node-binary")

        with mock.patch.object(runtime, "host_architecture", return_value="x64"), mock.patch.object(
            runtime, "command_output"
        ) as command, self.assertRaisesRegex(
            SystemExit, "Node executable does not match the pinned official archive"
        ):
            runtime.runtime_facts(root, "x64")
        command.assert_not_called()

    def test_validate_rejects_npm_tamper_before_executing_cached_code(self) -> None:
        temporary, root = self.make_runtime("x64")
        self.addCleanup(temporary.cleanup)
        (root / "lib/node_modules/npm/bin/npm-cli.js").write_text("// malicious npm cli\n")
        marker_path = root / runtime.MARKER_NAME
        marker = json.loads(marker_path.read_text())
        marker["npmTreeSha256"] = runtime.tree_sha256(root / "lib/node_modules/npm")
        marker_path.write_text(json.dumps(marker))

        with mock.patch.object(runtime, "host_architecture", return_value="x64"), mock.patch.object(
            runtime, "command_output"
        ) as command, self.assertRaisesRegex(
            SystemExit, "npm tree does not match the pinned official archive"
        ):
            runtime.validate_runtime(root)
        command.assert_not_called()

    def test_trusted_payload_pins_cover_both_architectures(self) -> None:
        for architecture in ("arm64", "x64"):
            with self.subTest(architecture=architecture):
                temporary, root = self.make_runtime(architecture)
                self.addCleanup(temporary.cleanup)
                facts = runtime.validate_cached_payload(root, architecture)
                self.assertEqual(facts["nodeSha256"], runtime.NODE_SHA256[architecture])
                self.assertEqual(facts["npmTreeSha256"], self.npm_hashes[architecture])

    def test_npm_tree_rejects_symlink_outside_authenticated_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            npm = root / "npm"
            npm.mkdir()
            outside = root / "outside.js"
            outside.write_text("untrusted\n")
            (npm / "escape.js").symlink_to(outside)

            with self.assertRaisesRegex(SystemExit, "escapes authenticated root"):
                runtime.tree_sha256(npm)

    def test_validate_rejects_license_tamper(self) -> None:
        temporary, root = self.make_runtime("x64")
        self.addCleanup(temporary.cleanup)
        (root / "LICENSE").write_text("tampered license\n")
        with self.assertRaisesRegex(SystemExit, "LICENSE no longer matches"):
            runtime.validate_runtime(root)


if __name__ == "__main__":
    unittest.main()
