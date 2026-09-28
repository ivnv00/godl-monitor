#!/usr/bin/env python3
"""Small regression checks for the source and package privacy boundary."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('privacy_guard', Path(__file__).with_name('check-privacy.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

class PrivacyBoundaryTests(unittest.TestCase):
    def test_staged_private_bytes_are_checked_after_worktree_changes_or_deletion(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            (root / '.gitignore').write_text('private.txt\n')
            private = root / 'private.txt'
            private.write_bytes(b'/Users/' + b'example-person/')
            subprocess.run(['git', 'add', '-f', 'private.txt'], cwd=root, check=True)
            private.write_text('safe working copy')
            self.assertFalse(guard.inspect('private.txt', private.read_bytes()))
            failures, count = guard.inspect_index(root)
            self.assertEqual(count, 1)
            self.assertIn(('private.txt (index)', 'personal absolute home path'), failures)
            private.unlink()
            self.assertEqual(guard.inspect_index(root), (failures, count))

    def test_staged_symlink_is_rejected_even_after_replacing_it_with_a_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            link = root / 'link.txt'
            link.symlink_to('missing')
            subprocess.run(['git', 'add', 'link.txt'], cwd=root, check=True)
            link.unlink()
            link.write_text('safe working copy')
            failures, count = guard.inspect_index(root)
            self.assertEqual(count, 1)
            self.assertIn(('link.txt (index)', 'staged symlink requires review'), failures)

    def test_source_scan_includes_untracked_and_force_added_ignored_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            (root / '.gitignore').write_text('ignored.txt\nprivate.txt\n')
            (root / 'new.txt').write_text('local-only-marker')
            (root / 'ignored.txt').write_text('ignored')
            (root / 'private.txt').write_text('force added')
            subprocess.run(['git', 'add', '-f', 'private.txt'], cwd=root, check=True)
            paths = guard.source_paths(root)
            self.assertIn(root / 'new.txt', paths)
            self.assertIn(root / 'private.txt', paths)
            self.assertNotIn(root / 'ignored.txt', paths)
            with patch.dict(os.environ, {'PRIVATE_SCAN_VALUES': 'local-only-marker'}):
                self.assertTrue(guard.inspect('new.txt', (root / 'new.txt').read_bytes()))

    def test_deleted_source_is_skipped_but_dangling_symlink_remains_reviewable(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            removed = root / 'removed.md'
            removed.write_text('removed')
            subprocess.run(['git', 'add', 'removed.md'], cwd=root, check=True)
            removed.unlink()
            link = root / 'dangling'
            link.symlink_to('missing')
            paths = guard.source_paths(root)
            self.assertNotIn(removed, paths)
            self.assertIn(link, paths)

    def test_runtime_and_binary_identifiers_are_rejected(self):
        self.assertTrue(guard.inspect('Resources/connection.json', b'{}'))
        with patch.dict(os.environ, {'PRIVATE_SCAN_VALUES': 'local-only-marker'}):
            self.assertTrue(guard.inspect('MacOS/Monitor', b'\x00local-only-marker\x00'))
        home_path = b'/Users/' + b'example-person/'
        self.assertTrue(guard.inspect('MacOS/Monitor', home_path))
        upstream = b'/Users/' + b'admin/'
        self.assertFalse(guard.inspect('Contents/Helpers/node', upstream, official_node=True))
        with patch.dict(os.environ, {'PRIVATE_SCAN_VALUES': 'admin'}):
            self.assertTrue(guard.inspect('Contents/Helpers/node', upstream, official_node=True))
        pem = b'-----BEGIN PRIVATE KEY-----' + b'\n' + b'A' * 40
        self.assertTrue(guard.inspect('payload.txt', pem))

    def test_endpoints_distinguish_explicit_synthetic_values(self):
        endpoint = b'https://example.invalid/?api-' + b'key=not-a-real-secret'
        self.assertTrue(guard.inspect('test.mjs', endpoint))
        self.assertFalse(guard.inspect('test.mjs', b'https://example.invalid/?api-key=SYNTHETIC_test'))

    def test_account_literals_require_review_or_generated_keys(self):
        alphabet = guard.ALPHABET
        number = int.from_bytes(bytes(range(1, 33)), 'big')
        address = ''
        while number:
            number, digit = divmod(number, 58)
            address = alphabet[digit] + address
        self.assertTrue(guard.inspect('fixture.json', ('"' + address + '"').encode()))
        self.assertFalse(guard.inspect('fixture.json', ('"' + '1' * 32 + '"').encode()))

if __name__ == '__main__':
    unittest.main()
