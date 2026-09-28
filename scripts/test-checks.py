#!/usr/bin/env python3
"""Guard failures that should stop a contributor preflight."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('checks', Path(__file__).with_name('check.py'))
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class PreflightTests(unittest.TestCase):
    def test_link_check_rejects_missing_file_and_repo_escape(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for link in ('missing.md', '../'):
                (root / 'README.md').write_text(f'[Broken]({link})')
                with self.assertRaises(SystemExit):
                    checks.check_docs(root)

    def test_links_support_images_and_encoded_paths_without_fetching_external_urls(self):
        text = '[Guide](docs/a%20b.md#part) ![image](img.png) <img src="logo.png"> [web](https://example.invalid/x) [section](#part)\n```sh\n[example](not-a-link.md)\n```\n'
        self.assertEqual(checks.local_links(text), ['docs/a b.md', 'img.png', 'logo.png'])

    def test_runtime_and_manifest_drift_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'engine').mkdir()
            (root / '.nvmrc').write_text('26.7.0\n')
            (root / 'engine/package.json').write_text(json.dumps({'engines': {'node': '26.7.0'}}))
            lock = root / 'engine/package-lock.json'
            lock.write_text(json.dumps({'packages': {'': {'engines': {'node': '26.7.0'}}}}))
            checks.check_node_pin(root, 'v26.7.0\n')
            with self.assertRaises(SystemExit):
                checks.check_node_pin(root, 'v22.13.0')
            lock.write_text(json.dumps({'packages': {'': {'engines': {'node': '22.13.0'}}}}))
            with self.assertRaises(SystemExit):
                checks.check_node_pin(root, 'v26.7.0')


if __name__ == '__main__':
    unittest.main()
