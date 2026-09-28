#!/usr/bin/env python3
"""Small regression checks for the source and package privacy boundary."""
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('privacy_guard', Path(__file__).with_name('check-privacy.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

class PrivacyBoundaryTests(unittest.TestCase):
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
