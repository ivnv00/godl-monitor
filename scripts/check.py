#!/usr/bin/env python3
"""Run the same local checks as CI. Does not install, publish or read app data."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def run(*command):
    print(f'\n> {" ".join(map(str, command))}', flush=True)
    subprocess.run(list(map(str, command)), cwd=ROOT, check=True)


def require_tool(name):
    if not shutil.which(name):
        raise SystemExit(f'Missing {name}. See docs/development.md for setup.')


def local_links(text):
    text = re.sub(r'^```.*?^```[^\n]*$', '', text, flags=re.MULTILINE | re.DOTALL)
    links = [a or b for a, b in re.findall(r'\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)', text)]
    links += re.findall(r'(?:src|href)="([^"]+)"', text)
    return [unquote(urlsplit(link).path) for link in links
            if not urlsplit(link).scheme and not urlsplit(link).netloc and urlsplit(link).path]


def check_docs(root):
    files = [*root.glob('*.md'), *root.glob('docs/**/*.md'), *root.glob('Brand/*.md'),
             *root.glob('engine/test-fixtures/*.md'), *root.glob('.github/*.md')]
    failures = []
    count = 0
    for file in sorted(set(files)):
        for link in local_links(file.read_text()):
            count += 1
            target = (file.parent / link).resolve()
            if not target.is_relative_to(root.resolve()) or not target.exists():
                failures.append(f'{file.relative_to(root)}: {link}')
    if failures:
        raise SystemExit('Broken or out-of-repository documentation links:\n' + '\n'.join(failures))
    print(f'Documentation: {count} local file links resolve (external URLs and anchors not checked).')


def check_node_pin(root, actual):
    expected = (root / '.nvmrc').read_text().strip()
    package = json.loads((root / 'engine/package.json').read_text())
    lock = json.loads((root / 'engine/package-lock.json').read_text())
    if package['engines']['node'] != expected or lock['packages']['']['engines']['node'] != expected:
        raise SystemExit('Node version differs between .nvmrc, engine/package.json and its lockfile.')
    if actual.strip() != f'v{expected}':
        raise SystemExit(f'Use Node {expected} from .nvmrc; found {actual.strip()}. See docs/development.md.')


def check_installed_dependencies(root):
    """Check installed metadata against the lock; this does not attest package contents."""
    engine = root / 'engine'

    def fail(reason):
        raise SystemExit(f'{reason}\nInstall locked dependencies: '
                         'npm ci --ignore-scripts --prefix engine')

    def read_metadata(path):
        label = path.relative_to(engine)
        try:
            metadata = json.loads(path.read_text())
        except (OSError, ValueError):
            fail(f'{label}: missing, unreadable or malformed package metadata.')
        if not isinstance(metadata, dict):
            fail(f'{label}: package metadata must be a JSON object.')
        return metadata

    lock = read_metadata(engine / 'package-lock.json')
    if lock.get('lockfileVersion') != 3:
        fail('Unsupported package-lock.json: expected npm lockfileVersion 3.')
    packages = lock.get('packages')
    if not isinstance(packages, dict) or not isinstance(packages.get(''), dict):
        fail('Malformed package-lock.json: expected packages with a root metadata object.')
    manifest = read_metadata(engine / 'package.json')
    for field in ('dependencies', 'devDependencies', 'optionalDependencies'):
        declared = manifest.get(field, {})
        if not isinstance(declared, dict) or any(not isinstance(value, str) for value in declared.values()):
            fail(f'Malformed package.json: expected a {field} object with string versions.')
        if declared != packages[''].get(field, {}):
            fail(f'package.json {field} differs from package-lock.json; update the lockfile first.')
        for name in declared:
            if f'node_modules/{name}' not in packages:
                fail(f'Malformed package-lock.json: missing locked root dependency {name}.')
    for path, expected in packages.items():
        if path:
            if (not re.fullmatch(r'node_modules/(?:@[^/]+/)?[^/]+(?:/node_modules/(?:@[^/]+/)?[^/]+)*', path)
                    or any(part in ('.', '..') for part in path.split('/'))):
                fail(f'Unsupported package-lock.json package path: {path}.')
            if (not isinstance(expected, dict) or not isinstance(expected.get('version'), str)
                    or not expected['version']):
                fail(f'Malformed package-lock.json metadata for {path}: expected a version string.')
            if any(expected.get(field) for field in ('link', 'optional', 'os', 'cpu')):
                fail(f'Unsupported package-lock.json entry for {path}: linked, optional or platform-specific package.')
            installed = read_metadata(engine / path / 'package.json')
            if installed.get('name') != path.rsplit('node_modules/', 1)[1]:
                fail(f'{path}: installed package name differs from its locked path.')
            if installed.get('version') != expected['version']:
                fail(f'{path}: installed version differs from package-lock.json.')
    print(f'Dependencies: {len(packages) - 1} installed package names and versions match the lock '
          '(metadata only; package contents are not attested).')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite', choices=('all', 'native', 'portable'), default='all',
                        help='all: complete Mac preflight; native: Swift only; portable: engine, scripts, docs and privacy')
    args = parser.parse_args()
    if sys.version_info < (3, 12):
        raise SystemExit('Use Python 3.12 or later. See docs/development.md.')
    require_tool('git')
    if args.suite in ('all', 'native'):
        if sys.platform != 'darwin':
            raise SystemExit('Native checks require macOS. Use --suite portable on other platforms.')
        require_tool('swift')
    if args.suite in ('all', 'portable'):
        require_tool('node')
        require_tool('npm')
        check_installed_dependencies(ROOT)
        check_node_pin(ROOT, subprocess.check_output(['node', '--version'], text=True))
        run(sys.executable, 'scripts/check-privacy.py')
        check_docs(ROOT)
        run('npm', 'test', '--prefix', 'engine')
        for test in sorted((ROOT / 'scripts').glob('test-*.py')):
            run(sys.executable, test.relative_to(ROOT))
    if args.suite in ('all', 'native'):
        run('swift', 'test', '-Xswiftc', '-warnings-as-errors')
    print(f'\nPassed: {args.suite} checks. Packaging and hardware validation are separate release checks.')


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from None
