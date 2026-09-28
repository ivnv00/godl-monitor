#!/usr/bin/env python3
"""Regression checks for architecture, OS and artifact integrity boundaries."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('package_builder', Path(__file__).with_name('build-local-app.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PackageBoundaryTests(unittest.TestCase):
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
