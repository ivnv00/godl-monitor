#!/usr/bin/env python3
"""Regression checks for architecture, OS and artifact integrity boundaries."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import call, patch

spec = importlib.util.spec_from_file_location('package_builder', Path(__file__).with_name('build-local-app.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PackageBoundaryTests(unittest.TestCase):
    def toolchain_responses(self):
        return {
            ('/usr/bin/xcrun', '--find', 'swift'): '/opt/synthetic-toolchain/bin/swift',
            ('/usr/bin/xcrun', '--sdk', 'macosx', '--show-sdk-path'): '/opt/synthetic-sdk',
            ('/opt/synthetic-toolchain/bin/swift', '--version'): 'swift-driver version: 1.127.14.1 Apple Swift version 6.2.3 (swiftlang-6.2.3.3.21 clang-1700.6.3.2)\nTarget: arm64-apple-macosx26.0',
            ('/usr/bin/xcodebuild', '-version'): 'Xcode 26.2\nBuild version 17C52',
            ('/usr/bin/xcrun', '--sdk', 'macosx', '--show-sdk-version'): '26.2',
            ('/usr/bin/xcrun', '--sdk', 'macosx', '--show-sdk-build-version'): '25C57',
        }

    def test_native_toolchain_records_validated_identifiers_without_paths(self):
        responses = self.toolchain_responses()
        with patch.object(builder, 'output', side_effect=lambda *args: responses[tuple(map(str, args))]):
            swift, sdk, provenance = builder.native_toolchain()
        self.assertEqual(swift, Path('/opt/synthetic-toolchain/bin/swift'))
        self.assertEqual(sdk, Path('/opt/synthetic-sdk'))
        self.assertEqual(provenance, {
            'swiftVersion': '6.2.3', 'swiftBuild': '6.2.3.3.21', 'clangBuild': '1700.6.3.2',
            'xcodeVersion': '26.2', 'xcodeBuild': '17C52',
            'macOSSDKVersion': '26.2', 'macOSSDKBuild': '25C57',
        })
        self.assertNotIn('/opt/', json.dumps(provenance))

    def test_native_toolchain_rejects_malformed_or_path_bearing_metadata(self):
        corruptions = {
            ('/opt/synthetic-toolchain/bin/swift', '--version'): 'Apple Swift version /private/synthetic/compiler',
            ('/usr/bin/xcodebuild', '-version'): 'Xcode 26.2\nBuild version 17C52\n/private/synthetic/toolchain',
            ('/usr/bin/xcrun', '--sdk', 'macosx', '--show-sdk-version'): '26.2/private/synthetic/sdk',
            ('/usr/bin/xcrun', '--sdk', 'macosx', '--show-sdk-build-version'): '25C57\n/private/synthetic/sdk',
        }
        for command, invalid in corruptions.items():
            with self.subTest(command=command):
                responses = self.toolchain_responses() | {command: invalid}
                with patch.object(builder, 'output', side_effect=lambda *args: responses[tuple(map(str, args))]):
                    with self.assertRaisesRegex(SystemExit, 'Unrecognized native toolchain metadata') as error:
                        builder.native_toolchain()
                self.assertNotIn('/private/synthetic', str(error.exception))

    def test_build_children_ignore_node_startup_hooks_without_changing_parent(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            hook = root / 'hook.cjs'
            marker = root / 'hook-ran'
            hook.write_text("require('node:fs').writeFileSync(process.env.GODL_TEST_MARKER, 'ran');")
            node = shutil.which('node')
            self.assertIsNotNone(node, 'Packaging checks require Node')
            environment = dict(os.environ, NODE_OPTIONS=f'--require={hook}', NODE_PATH=str(root / 'ambient'),
                               GODL_TEST_MARKER=str(marker), GODL_TEST_KEEP='kept')
            script = "console.log(JSON.stringify([process.env.NODE_OPTIONS ?? null, process.env.NODE_PATH ?? null, process.env.GODL_TEST_KEEP]));"
            with patch.dict(os.environ, environment, clear=True):
                result = builder.output(node, '--eval', script)
                self.assertEqual(json.loads(result), [None, None, 'kept'])
                self.assertFalse(marker.exists())
                result = builder.run(node, '--eval', script, capture_output=True, text=True, env=environment)
                self.assertEqual(json.loads(result.stdout), [None, None, 'kept'])
                self.assertFalse(marker.exists())
                self.assertEqual(os.environ['NODE_OPTIONS'], environment['NODE_OPTIONS'])
                self.assertEqual(os.environ['NODE_PATH'], environment['NODE_PATH'])
            self.assertIn('NODE_OPTIONS', environment)

    def make_git_repository(self, root):
        subprocess.run(['git', 'init', '-q', root], check=True)
        subprocess.run(['git', '-C', root, 'config', 'user.name', 'Package Test'], check=True)
        subprocess.run(['git', '-C', root, 'config', 'user.email', 'package@example.invalid'], check=True)
        (root / '.gitignore').write_text('Sources/App/Resources/private.env\nengine/node_modules/\n')
        (root / '.nvmrc').write_text('26.7.0\n')
        (root / 'Sources/App/Resources').mkdir(parents=True)
        (root / 'Sources/App/Resources/public.txt').write_text('public\n')
        (root / 'engine').mkdir()
        package = {'engines': {'node': '26.7.0'}}
        lock = {'packages': {'': {'engines': {'node': '26.7.0'}}}}
        (root / 'engine/package.json').write_text(json.dumps(package))
        (root / 'engine/package-lock.json').write_text(json.dumps(lock))
        subprocess.run(['git', '-C', root, 'add', '.'], check=True)
        subprocess.run(['git', '-C', root, 'commit', '-qm', 'fixture'], check=True)

    def test_committed_export_excludes_untracked_ignored_sources_and_developer_dependencies(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'repository'
            export = Path(temporary) / 'export'
            root.mkdir()
            export.mkdir()
            self.make_git_repository(root)
            (root / 'Sources/App/Resources/private.env').write_text('RPC_KEY=rogue\n')
            (root / 'Sources/App/Resources/untracked.txt').write_text('untracked\n')
            (root / 'engine/node_modules/rogue').mkdir(parents=True)
            (root / 'engine/node_modules/rogue/credentials.json').write_text('{"secret":true}\n')

            commit = builder.export_committed_head(root, export)

            self.assertEqual(commit, subprocess.check_output(
                ['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip())
            self.assertTrue((export / 'Sources/App/Resources/public.txt').is_file())
            self.assertFalse((export / 'Sources/App/Resources/private.env').exists())
            self.assertFalse((export / 'Sources/App/Resources/untracked.txt').exists())
            self.assertFalse((export / 'engine/node_modules').exists())

    def test_dirty_tracked_source_is_rejected_with_actionable_message(self):
        for staged in (False, True):
            with self.subTest(staged=staged), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                self.make_git_repository(root)
                (root / 'Sources/App/Resources/public.txt').write_text('dirty\n')
                if staged:
                    subprocess.run(['git', '-C', root, 'add', 'Sources/App/Resources/public.txt'], check=True)

                with self.assertRaisesRegex(SystemExit, 'Commit or stash tracked changes'):
                    builder.require_clean_tracked_state(root)

    def test_fresh_dependencies_use_exported_lock_and_pinned_runtime(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / 'source'
            runtime = Path(temporary) / 'runtime'
            (source / 'engine').mkdir(parents=True)
            runtime_node = runtime / 'bin/node'
            npm_cli = runtime / 'lib/node_modules/npm/bin/npm-cli.js'
            npm_cli.parent.mkdir(parents=True)
            runtime_node.parent.mkdir(parents=True)
            runtime_node.touch()
            npm_cli.touch()

            with patch.object(builder, 'run') as mocked_run:
                builder.install_locked_dependencies(source, runtime)

            self.assertEqual(mocked_run.call_args_list, [call(
                runtime_node, npm_cli, 'ci', '--ignore-scripts', '--omit=dev', cwd=source / 'engine')])

    def test_node_version_must_match_manifest_lock_and_every_runtime(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / 'source'
            (source / 'engine').mkdir(parents=True)
            (source / '.nvmrc').write_text('26.7.0\n')
            package = source / 'engine/package.json'
            lock = source / 'engine/package-lock.json'
            package.write_text(json.dumps({'engines': {'node': '26.7.0'}}))
            lock.write_text(json.dumps({'packages': {'': {'engines': {'node': '26.7.0'}}}}))
            runtimes = {}
            for arch in ('arm64', 'x86_64'):
                runtime = Path(temporary) / arch
                runtime.mkdir()
                (runtime / '.godl-node-runtime.json').write_text(json.dumps({'nodeVersion': '26.7.0'}))
                runtimes[arch] = runtime

            self.assertEqual(builder.verify_node_version(source, runtimes), '26.7.0')
            (runtimes['x86_64'] / '.godl-node-runtime.json').write_text(json.dumps({'nodeVersion': '26.8.0'}))
            with self.assertRaisesRegex(SystemExit, 'x86_64 packaged runtime'):
                builder.verify_node_version(source, runtimes)

    def test_universal_rejects_missing_or_unexpected_slice(self):
        for arches in ('arm64', 'x86_64', 'arm64 x86_64 arm64e'):
            with self.subTest(arches=arches), patch.object(builder, 'output', return_value=arches):
                with self.assertRaises(SystemExit):
                    builder.verify_architectures(Path('node'), ('arm64', 'x86_64'))

    def test_universal_accepts_both_slice_orders(self):
        for arches in ('arm64 x86_64', 'x86_64 arm64'):
            with patch.object(builder, 'output', return_value=arches):
                builder.verify_architectures(Path('node'), ('arm64', 'x86_64'))

    def test_runtime_cannot_raise_declared_os_requirement(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            marker = root / '.godl-node-runtime.json'
            for minimum in ('13.5', '14', '14.0.0'):
                marker.write_text(json.dumps({'minimumMacOS': minimum}))
                builder.verify_deployment_target(root)
            for minimum in ('14.0.1', '14.1', '15.0'):
                marker.write_text(json.dumps({'minimumMacOS': minimum}))
                with self.assertRaises(SystemExit):
                    builder.verify_deployment_target(root)

    def test_checksum_covers_exact_artifact_and_uses_only_basename(self):
        with tempfile.TemporaryDirectory() as temporary:
            artifact = Path(temporary) / 'candidate.zip'
            artifact.write_bytes(b'known package bytes\x00\xff')
            builder.checksum_file(artifact)
            digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
            self.assertEqual(artifact.with_name('candidate.zip.sha256').read_text(), f'{digest}  candidate.zip\n')

    def test_universal_arguments_must_be_paired_before_building(self):
        script = Path(__file__).with_name('build-local-app.py')
        for flags in (['--universal'], ['--intel-node-runtime', '/missing-intel']):
            result = subprocess.run([sys.executable, str(script), '--node-runtime', '/missing-arm', *flags],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn('must be supplied together', result.stderr)


if __name__ == '__main__':
    unittest.main()
