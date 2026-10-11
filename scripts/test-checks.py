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
    def installed_tree(self, root):
        engine = root / 'engine'
        engine.mkdir()
        manifest = {'dependencies': {'@solana/addresses': '8.3.0'}}
        (engine / 'package.json').write_text(json.dumps(manifest))
        packages = {
            '': manifest,
            'node_modules/@solana/addresses': {'version': '8.3.0'},
            'node_modules/@solana/assertions': {'version': '8.3.0'},
            'node_modules/@solana/addresses/node_modules/chalk': {'version': '5.6.0'},
        }
        (engine / 'package-lock.json').write_text(json.dumps({
            'lockfileVersion': 3, 'packages': packages,
        }))
        for path, metadata in packages.items():
            if path:
                package = engine / path / 'package.json'
                package.parent.mkdir(parents=True)
                package.write_text(json.dumps({
                    'name': path.rsplit('node_modules/', 1)[1], **metadata,
                }))
        return engine

    def test_installed_scoped_transitive_and_nested_packages_match_lock(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.installed_tree(root)
            checks.check_installed_dependencies(root)

    def test_changed_transitive_or_nested_package_is_rejected_with_install_remedy(self):
        for path in ('node_modules/@solana/assertions',
                     'node_modules/@solana/addresses/node_modules/chalk'):
            with self.subTest(path=path), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                engine = self.installed_tree(root)
                metadata = engine / path / 'package.json'
                installed = json.loads(metadata.read_text())
                installed['version'] = '1.0.0'
                metadata.write_text(json.dumps(installed))
                with self.assertRaisesRegex(SystemExit, 'npm ci --ignore-scripts --prefix engine'):
                    checks.check_installed_dependencies(root)

    def test_missing_or_malformed_transitive_metadata_is_rejected_with_install_remedy(self):
        for contents in (None, '{broken', '[]', '{"name":"@solana/assertions"}',
                         '{"name":"wrong-package","version":"8.3.0"}'):
            with self.subTest(contents=contents), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                engine = self.installed_tree(root)
                metadata = engine / 'node_modules/@solana/assertions/package.json'
                if contents is None:
                    metadata.unlink()
                else:
                    metadata.write_text(contents)
                with self.assertRaisesRegex(SystemExit, 'npm ci --ignore-scripts --prefix engine'):
                    checks.check_installed_dependencies(root)

    def test_manifest_dependency_changes_require_an_updated_lock(self):
        for field in ('dependencies', 'devDependencies', 'optionalDependencies'):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                engine = self.installed_tree(root)
                manifest = engine / 'package.json'
                changed = json.loads(manifest.read_text())
                changed[field] = {'chalk': '5.6.0'}
                manifest.write_text(json.dumps(changed))
                with self.assertRaisesRegex(SystemExit, 'package.json.*package-lock.json'):
                    checks.check_installed_dependencies(root)

    def test_malformed_and_unsupported_lock_structures_fail_clearly(self):
        invalid = [
            {'lockfileVersion': 2, 'packages': {'': {}}},
            {'lockfileVersion': 3, 'packages': []},
            {'lockfileVersion': 3, 'packages': {}},
            {'lockfileVersion': 3, 'packages': {'': [], 'node_modules/chalk': {'version': '5.6.0'}}},
            {'lockfileVersion': 3, 'packages': {'': {}, '../escape': {'version': '5.6.0'}}},
            {'lockfileVersion': 3, 'packages': {'': {}, 'node_modules/chalk': []}},
            {'lockfileVersion': 3, 'packages': {'': {}, 'node_modules/chalk': {}}},
            {'lockfileVersion': 3, 'packages': {'': {}, 'node_modules/chalk': {'version': '5.6.0', 'link': True}}},
        ]
        for lock in invalid:
            with self.subTest(lock=lock), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                engine = self.installed_tree(root)
                (engine / 'package.json').write_text('{}')
                (engine / 'package-lock.json').write_text(json.dumps(lock))
                with self.assertRaisesRegex(SystemExit, 'Unsupported|Malformed'):
                    checks.check_installed_dependencies(root)

    def test_lock_cannot_omit_a_declared_root_dependency(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            engine = self.installed_tree(root)
            lockfile = engine / 'package-lock.json'
            lock = json.loads(lockfile.read_text())
            del lock['packages']['node_modules/@solana/addresses']
            lockfile.write_text(json.dumps(lock))
            with self.assertRaisesRegex(SystemExit, 'Malformed package-lock.json'):
                checks.check_installed_dependencies(root)

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
