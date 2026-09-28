#!/usr/bin/env python3
"""Regression checks for safe Developer ID distribution preparation."""
import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import stat
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch
import uuid
import zipfile


spec = importlib.util.spec_from_file_location(
    'distribution', Path(__file__).with_name('notarize-candidate.py'))
distribution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(distribution)


COMMIT = '1' * 40
IDENTITY = 'A1' * 20
TEAM = 'A1B2C3D4E5'


class DistributionBoundaryTests(unittest.TestCase):
    def make_candidate(self, folder, *, provenance=None, extras=()):
        archive = folder / 'candidate.zip'
        node = b'portable node fixture'
        lock = b'{"lockfileVersion":3}\n'
        default_provenance = {
            'sourceCommit': COMMIT,
            'bundledSigning': 'ad-hoc',
            'bundledArchitectures': ['arm64', 'x86_64'],
            'bundledNodeSha256': hashlib.sha256(node).hexdigest(),
            'packageLockSha256': hashlib.sha256(lock).hexdigest(),
            'nodeVersion': '26.7.0',
        }
        if provenance:
            default_provenance.update(provenance)
        info = {
            'CFBundleIdentifier': 'dev.godl.personal.monitor',
            'CFBundleExecutable': 'GODLMonitor',
            'CFBundlePackageType': 'APPL',
            'CFBundleShortVersionString': '1.2.3',
        }
        members = [
            (f'{distribution.APP}/Contents/Info.plist', plistlib.dumps(info)),
            (f'{distribution.APP}/{distribution.PROVENANCE}',
             json.dumps(default_provenance).encode()),
            (f'{distribution.APP}/{distribution.NODE}', node),
            (f'{distribution.APP}/{distribution.LOCK}', lock),
            (f'{distribution.APP}/{distribution.EXECUTABLE}', b'portable app fixture'),
            *extras,
        ]
        with zipfile.ZipFile(archive, 'w') as bundle:
            for name, contents in members:
                if isinstance(name, zipfile.ZipInfo):
                    bundle.writestr(name, contents)
                else:
                    bundle.writestr(name, contents)
        return archive, hashlib.sha256(archive.read_bytes()).hexdigest()

    def execute_args(self, archive, digest, output):
        return argparse.Namespace(
            archive=archive, sha256=digest, source_commit=COMMIT,
            identity=IDENTITY, team_id=TEAM, keychain_profile='fixture-profile',
            output=output)

    def command_fixture(self, calls, *, fail_runtime=False):
        def invoke(*args, **kwargs):
            calls.append((args, kwargs))
            executable = str(args[0])
            if executable == '/usr/bin/lipo':
                return 'arm64 x86_64'
            if (Path(executable).name == 'node' and '--input-type=module' in args):
                if fail_runtime:
                    raise ValueError('local runtime verification failed')
                return ''
            if executable == '/usr/bin/ditto':
                Path(args[-1]).write_bytes(b'synthetic zip')
            elif executable == '/usr/bin/hdiutil' and len(args) > 1 and args[1] == 'create':
                Path(args[-1]).write_bytes(b'synthetic dmg')
            return ''
        return invoke

    def test_default_preview_runs_no_commands_and_mutates_nothing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, digest = self.make_candidate(root)
            before = {path.relative_to(root) for path in root.rglob('*')}
            output = io.StringIO()
            with patch.object(distribution, 'command') as mocked_command, \
                    patch.object(distribution, 'execute') as mocked_execute, redirect_stdout(output):
                distribution.main(['--archive', str(archive), '--sha256', digest,
                                   '--source-commit', COMMIT])
            self.assertFalse(mocked_command.called)
            self.assertFalse(mocked_execute.called)
            self.assertEqual(before, {path.relative_to(root) for path in root.rglob('*')})
            preview = json.loads(output.getvalue())
            self.assertEqual(preview['mode'], 'preview')
            self.assertFalse(preview['uploads'])

    def test_upload_approval_is_rejected_without_execute(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive, digest = self.make_candidate(Path(temporary))
            with self.assertRaisesRegex(ValueError, 'Signing options require --execute'):
                distribution.main(['--archive', str(archive), '--sha256', digest,
                                   '--source-commit', COMMIT, '--approve-apple-upload'])

    def test_execute_requires_separate_upload_approval_and_credentials(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive, digest = self.make_candidate(Path(temporary))
            with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
                distribution.main(['--archive', str(archive), '--sha256', digest,
                                   '--source-commit', COMMIT, '--execute'])
            self.assertEqual(raised.exception.code, 2)

    def test_complete_execute_flags_normalize_identity_and_dispatch(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, digest = self.make_candidate(root)
            metadata = {'version': '1.2.3'}
            argv = [
                '--archive', str(archive), '--sha256', digest, '--source-commit', COMMIT,
                '--execute', '--approve-apple-upload', '--identity', IDENTITY.lower(),
                '--team-id', TEAM, '--keychain-profile', 'fixture-profile',
                '--output', str(root / 'attempt'),
            ]
            with patch.object(distribution.sys, 'platform', 'darwin'), \
                    patch.object(distribution, 'inspect_candidate', return_value=metadata), \
                    patch.object(distribution, 'execute') as mocked_execute, redirect_stdout(io.StringIO()):
                distribution.main(argv)
            args = mocked_execute.call_args.args[0]
            self.assertEqual(args.identity, IDENTITY)
            self.assertTrue(args.approve_apple_upload)
            self.assertEqual(mocked_execute.call_args.args[1], metadata)

    def test_execute_is_refused_off_macos_before_candidate_inspection(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, digest = self.make_candidate(root)
            argv = [
                '--archive', str(archive), '--sha256', digest, '--source-commit', COMMIT,
                '--execute', '--approve-apple-upload', '--identity', IDENTITY,
                '--team-id', TEAM, '--keychain-profile', 'fixture-profile',
                '--output', str(root / 'attempt'),
            ]
            with patch.object(distribution.sys, 'platform', 'linux'), \
                    patch.object(distribution, 'inspect_candidate') as mocked_inspect, \
                    self.assertRaisesRegex(ValueError, 'requires macOS'):
                distribution.main(argv)
            self.assertFalse(mocked_inspect.called)

    def test_valid_candidate_returns_pinned_input_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive, digest = self.make_candidate(Path(temporary))
            metadata = distribution.inspect_candidate(archive, digest, COMMIT)
            self.assertEqual(metadata, {
                'version': '1.2.3', 'sourceCommit': COMMIT, 'inputSha256': digest,
                'nodeVersion': '26.7.0',
                'packageLockSha256': hashlib.sha256(b'{"lockfileVersion":3}\n').hexdigest(),
            })

    def test_candidate_requires_exact_lowercase_hash_and_matching_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive, digest = self.make_candidate(Path(temporary))
            for supplied, message in ((digest.upper(), 'complete lowercase'), ('0' * 64, 'checksum mismatch')):
                with self.subTest(supplied=supplied), self.assertRaisesRegex(ValueError, message):
                    distribution.inspect_candidate(archive, supplied, COMMIT)

    def test_candidate_requires_matching_source_provenance(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive, digest = self.make_candidate(
                Path(temporary), provenance={'sourceCommit': '2' * 40})
            with self.assertRaisesRegex(ValueError, 'source commit mismatch'):
                distribution.inspect_candidate(archive, digest, COMMIT)

    def test_candidate_requires_matching_runtime_and_lock_provenance(self):
        for key, message in (('bundledNodeSha256', 'bundledNodeSha256'),
                             ('packageLockSha256', 'packageLockSha256')):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as temporary:
                archive, digest = self.make_candidate(Path(temporary), provenance={key: '0' * 64})
                with self.assertRaisesRegex(ValueError, message):
                    distribution.inspect_candidate(archive, digest, COMMIT)

    def test_candidate_rejects_parent_traversal(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive, digest = self.make_candidate(
                Path(temporary), extras=((f'{distribution.APP}/../escape', b'escape'),))
            with self.assertRaisesRegex(ValueError, 'Unsafe candidate ZIP path'):
                distribution.inspect_candidate(archive, digest, COMMIT)

    def test_candidate_rejects_symbolic_links(self):
        with tempfile.TemporaryDirectory() as temporary:
            link = zipfile.ZipInfo(f'{distribution.APP}/Contents/Resources/link')
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive, digest = self.make_candidate(Path(temporary), extras=((link, b'/private'),))
            with self.assertRaisesRegex(ValueError, 'Links and special files'):
                distribution.inspect_candidate(archive, digest, COMMIT)

    def test_candidate_rejects_case_collisions(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive, digest = self.make_candidate(Path(temporary), extras=(
                (f'{distribution.APP}/Contents/Resources/Readme.txt', b'a'),
                (f'{distribution.APP}/Contents/Resources/README.TXT', b'b'),
            ))
            with self.assertRaisesRegex(ValueError, 'case-colliding'):
                distribution.inspect_candidate(archive, digest, COMMIT)

    def test_candidate_rejects_unreviewed_mach_o_content(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive, digest = self.make_candidate(Path(temporary), extras=((
                f'{distribution.APP}/Contents/Resources/rogue', bytes.fromhex('feedfacf') + b'payload'),))
            with self.assertRaisesRegex(ValueError, 'Unexpected native code'):
                distribution.inspect_candidate(archive, digest, COMMIT)

    def test_candidate_rejects_native_addon_extensions(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive, digest = self.make_candidate(Path(temporary), extras=((
                f'{distribution.APP}/Contents/Resources/rogue.node', b'not even Mach-O'),))
            with self.assertRaisesRegex(ValueError, 'Native add-ons'):
                distribution.inspect_candidate(archive, digest, COMMIT)

    def test_identity_requires_exact_developer_id_application_team(self):
        valid = f'  1) {IDENTITY} "Developer ID Application: Fixture ({TEAM})"\n     1 valid identities found'
        with patch.object(distribution, 'command', return_value=valid):
            distribution.verify_identity(IDENTITY, TEAM)
        for output in (
                f'{IDENTITY} "Apple Development: Fixture ({TEAM})"',
                f'{IDENTITY} "Developer ID Application: Fixture (WRONGTEAM0)"',
                f'{valid}\n{valid}'):
            with self.subTest(output=output), patch.object(distribution, 'command', return_value=output), \
                    self.assertRaisesRegex(ValueError, 'identity/team was not found'):
                distribution.verify_identity(IDENTITY, TEAM)

    def test_code_verification_requires_exact_xml_entitlements_without_debug_exceptions(self):
        details = (f'flags=0x10000(runtime)\nTeamIdentifier={TEAM}\n'
                   'Timestamp=Sep 28, 2026 at 20:00:00')

        def command_with_entitlements(actual, calls):
            encoded = plistlib.dumps(actual).decode()

            def invoke(*args, **kwargs):
                calls.append(args)
                if '--verbose=4' in args:
                    return details
                if '--entitlements' in args:
                    return encoded
                return ''
            return invoke

        calls = []
        with patch.object(distribution, 'command',
                          side_effect=command_with_entitlements(distribution.NODE_ENTITLEMENTS, calls)):
            distribution.verify_code(Path('/synthetic/node'), TEAM, distribution.NODE_ENTITLEMENTS)
        entitlement_calls = [args for args in calls if '--entitlements' in args]
        self.assertEqual(len(entitlement_calls), len(distribution.ARCHES))
        self.assertTrue(all('--xml' in args for args in entitlement_calls))

        debug_entitlements = {**distribution.NODE_ENTITLEMENTS,
                              'com.apple.security.get-task-allow': True}
        with patch.object(distribution, 'command', side_effect=command_with_entitlements(
                debug_entitlements, [])), self.assertRaisesRegex(
                    ValueError, 'Unexpected code signing entitlements'):
            distribution.verify_code(Path('/synthetic/node'), TEAM, distribution.NODE_ENTITLEMENTS)

    def test_notarization_saves_submission_id_before_wait(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            artifact = folder / 'submission.zip'
            artifact.write_bytes(b'candidate')
            submission = str(uuid.uuid4())
            state = {'submissions': []}
            observed_at_wait = []

            def mocked_command(*args, **kwargs):
                if 'submit' in args:
                    return json.dumps({'id': submission})
                if 'wait' in args:
                    observed_at_wait.append(json.loads((folder / 'attempt.json').read_text()))
                    return json.dumps({'id': submission, 'status': 'Accepted'})
                return ''

            with patch.object(distribution, 'command', side_effect=mocked_command):
                distribution.notarize(artifact, 'fixture-profile', folder, state)
            self.assertEqual(observed_at_wait[0]['submissions'][0], {
                'artifact': artifact.name,
                'sha256': hashlib.sha256(b'candidate').hexdigest(),
                'status': 'submitted', 'id': submission,
            })

    def test_interrupted_notary_wait_preserves_submission_without_stapling(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            artifact = folder / 'submission.zip'
            artifact.write_bytes(b'candidate')
            submission = str(uuid.uuid4())
            calls = []

            def mocked_command(*args, **kwargs):
                calls.append(args)
                if 'submit' in args:
                    return json.dumps({'id': submission})
                if 'wait' in args:
                    raise KeyboardInterrupt()
                return ''

            with patch.object(distribution, 'command', side_effect=mocked_command), \
                    self.assertRaises(KeyboardInterrupt):
                distribution.notarize(
                    artifact, 'fixture-profile', folder, {'submissions': []})

            saved = json.loads((folder / 'attempt.json').read_text())
            self.assertEqual(saved['submissions'][0]['id'], submission)
            self.assertEqual(saved['submissions'][0]['status'], 'submitted')
            self.assertFalse(any('stapler' in map(str, args) for args in calls))

    def test_nonaccepted_notarization_never_staples_or_promotes(self):
        for status in ('Invalid', 'Rejected', 'In Progress', 'Processing', None):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as temporary:
                folder = Path(temporary)
                artifact = folder / 'submission.zip'
                artifact.write_bytes(b'candidate')
                submission = str(uuid.uuid4())
                calls = []

                def mocked_command(*args, **kwargs):
                    calls.append(args)
                    if 'submit' in args:
                        return json.dumps({'id': submission})
                    return json.dumps({'id': submission, 'status': status})

                state = {'submissions': []}
                with patch.object(distribution, 'command', side_effect=mocked_command), \
                        self.assertRaisesRegex(ValueError, 'has not accepted'):
                    distribution.notarize(artifact, 'fixture-profile', folder, state)
                self.assertFalse(any('stapler' in map(str, args) for args in calls))
                self.assertNotEqual(state['submissions'][0]['status'], 'Accepted')

    def test_relative_output_becomes_absolute_before_engine_changes_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, digest = self.make_candidate(root)
            output = root / 'attempt'
            args = self.execute_args(Path(os.path.relpath(archive)), digest, Path(os.path.relpath(output)))
            metadata = distribution.inspect_candidate(archive, digest, COMMIT)
            calls = []
            with patch.object(distribution, 'verify_source'), \
                    patch.object(distribution, 'verify_identity'), \
                    patch.object(distribution, 'verify_code'), \
                    patch.object(distribution, 'command', side_effect=self.command_fixture(calls)), \
                    patch.object(distribution, 'notarize'):
                distribution.execute(args, metadata)
            invocation, options = next((a, k) for a, k in calls if '--input-type=module' in a)
            self.assertTrue(Path(invocation[0]).is_absolute())
            self.assertTrue(Path(options['cwd']).is_absolute())

    def test_execute_orders_local_checks_before_both_notarizations(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, digest = self.make_candidate(root)
            output = root / 'attempt'
            args = self.execute_args(archive, digest, output)
            metadata = distribution.inspect_candidate(archive, digest, COMMIT)
            command_calls = []
            events = []

            def notarize(path, profile, folder, state):
                events.append(('notarize', path.name))

            command_side_effect = self.command_fixture(command_calls)
            with patch.object(distribution, 'verify_source'), \
                    patch.object(distribution, 'verify_identity'), \
                    patch.object(distribution, 'verify_code'), \
                    patch.object(distribution, 'command', side_effect=command_side_effect), \
                    patch.object(distribution, 'notarize', side_effect=notarize):
                distribution.execute(args, metadata)

            flattened = [tuple(map(str, args)) for args, _ in command_calls]
            runtime_index = next(i for i, call in enumerate(flattened) if '--input-type=module' in call)
            first_package_index = next(i for i, call in enumerate(flattened)
                                       if call[0] == '/usr/bin/ditto' and call[-1].endswith('submission.zip'))
            self.assertLess(runtime_index, first_package_index)
            self.assertEqual(events, [
                ('notarize', 'submission.zip'),
                ('notarize', 'GODL-Monitor-1.2.3-universal.dmg'),
            ])
            completed = json.loads((output / 'attempt.json').read_text())
            self.assertEqual((completed['status'], completed['stage']),
                             ('notarized-local-candidate', 'complete'))
            self.assertTrue((output / 'notarized/distribution.json').is_file())

    def test_execute_aborts_before_upload_when_local_runtime_check_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, digest = self.make_candidate(root)
            output = root / 'attempt'
            args = self.execute_args(archive, digest, output)
            metadata = distribution.inspect_candidate(archive, digest, COMMIT)
            command_calls = []
            with patch.object(distribution, 'verify_source'), \
                    patch.object(distribution, 'verify_identity'), \
                    patch.object(distribution, 'verify_code'), \
                    patch.object(distribution, 'command',
                                 side_effect=self.command_fixture(command_calls, fail_runtime=True)), \
                    patch.object(distribution, 'notarize') as mocked_notarize, \
                    self.assertRaisesRegex(ValueError, 'local runtime verification failed'):
                distribution.execute(args, metadata)
            self.assertFalse(mocked_notarize.called)
            self.assertFalse(any('notarytool' in map(str, args) for args, _ in command_calls))
            stopped = json.loads((output / 'attempt.json').read_text())
            self.assertEqual(stopped['status'], 'incomplete')
            self.assertFalse((output / 'notarized').exists())

    def test_late_execute_failures_never_promote_partial_candidate_or_change_input(self):
        scenarios = (
            ('app Gatekeeper', 'app-gatekeeper', 1),
            ('second notarization', 'second-notarization', 2),
            ('final DMG Gatekeeper', 'dmg-gatekeeper', 2),
        )
        for label, failure, expected_notarizations in scenarios:
            with self.subTest(stage=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive, digest = self.make_candidate(root)
                original = archive.read_bytes()
                output = root / 'attempt'
                args = self.execute_args(archive, digest, output)
                metadata = distribution.inspect_candidate(archive, digest, COMMIT)
                command_calls = []
                base_command = self.command_fixture(command_calls)
                notarized = []

                def failing_command(*command_args, **kwargs):
                    if command_args[:4] == ('/usr/sbin/spctl', '--assess', '--type', 'execute') \
                            and failure == 'app-gatekeeper':
                        command_calls.append((command_args, kwargs))
                        raise ValueError('app Gatekeeper failed')
                    if command_args[:4] == ('/usr/sbin/spctl', '--assess', '--type', 'open') \
                            and failure == 'dmg-gatekeeper':
                        command_calls.append((command_args, kwargs))
                        raise ValueError('DMG Gatekeeper failed')
                    return base_command(*command_args, **kwargs)

                def failing_notarize(path, profile, folder, state):
                    notarized.append(path.name)
                    if failure == 'second-notarization' and path.suffix == '.dmg':
                        raise ValueError('second notarization failed')

                with patch.object(distribution, 'verify_source'), \
                        patch.object(distribution, 'verify_identity'), \
                        patch.object(distribution, 'verify_code'), \
                        patch.object(distribution, 'command', side_effect=failing_command), \
                        patch.object(distribution, 'notarize', side_effect=failing_notarize), \
                        self.assertRaisesRegex(ValueError, 'failed'):
                    distribution.execute(args, metadata)

                attempt = json.loads((output / 'attempt.json').read_text())
                self.assertEqual(attempt['status'], 'incomplete')
                self.assertFalse((output / 'notarized').exists())
                self.assertEqual(archive.read_bytes(), original)
                self.assertEqual(len(notarized), expected_notarizations)

    def test_preexisting_output_is_preserved_without_upload(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, digest = self.make_candidate(root)
            output = root / 'attempt'
            output.mkdir()
            sentinel = output / 'keep.txt'
            sentinel.write_text('existing attempt\n')
            args = self.execute_args(archive, digest, output)
            metadata = distribution.inspect_candidate(archive, digest, COMMIT)

            with patch.object(distribution, 'verify_source'), \
                    patch.object(distribution, 'verify_identity'), \
                    patch.object(distribution, 'command') as mocked_command, \
                    patch.object(distribution, 'notarize') as mocked_notarize, \
                    self.assertRaises(FileExistsError):
                distribution.execute(args, metadata)

            self.assertEqual(sentinel.read_text(), 'existing attempt\n')
            self.assertEqual(list(output.iterdir()), [sentinel])
            self.assertFalse(mocked_command.called)
            self.assertFalse(mocked_notarize.called)


if __name__ == '__main__':
    unittest.main()
