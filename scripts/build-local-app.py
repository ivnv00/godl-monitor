#!/usr/bin/env python3
"""Build a self-contained local app; optionally package both Mac architectures."""
import argparse
import hashlib
import json
import platform
import plistlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

VERSION = '0.2.23'
BUILD = '25'
MACOS = '14.0'
ENGINE_FILES = [
    'monitor-cli.mjs', 'chain.mjs', 'observation-store.mjs', 'monitor.mjs', 'period-cost.mjs', 'economics.mjs',
    'ongoing-cost.mjs', 'funded-accounting.mjs', 'accounting-evidence.mjs', 'accounting-service.mjs', 'accounting-cli.mjs',
    'transaction-evidence.mjs', 'rpc-config.mjs', 'runtime-failure.mjs', 'reward-balances.mjs', 'accounting-transport.mjs',
    'earnings.mjs', 'market-quotes.mjs', 'observation-publication.mjs', 'accounting-import.mjs', 'accounting-import-cli.mjs', 'package.json', 'package-lock.json',
]


def run(*args, **kwargs):
    return subprocess.run(list(map(str, args)), check=True, **kwargs)


def output(*args, **kwargs):
    return subprocess.check_output(list(map(str, args)), text=True, **kwargs).strip()


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def verify_architectures(path, expected):
    actual = set(output('/usr/bin/lipo', '-archs', path).split())
    if actual != set(expected):
        raise SystemExit(f'Unexpected architectures in {path.name}: {sorted(actual)}')


def combine(sources, destination, architectures):
    if len(sources) == 1:
        shutil.copy2(sources[0], destination)
    else:
        run('/usr/bin/lipo', '-create', *sources, '-output', destination)
    verify_architectures(destination, architectures)


def checksum_file(path):
    path.with_name(path.name + '.sha256').write_text(f'{sha256(path)}  {path.name}\n')


def verify_deployment_target(runtime):
    marker = json.loads((runtime / '.godl-node-runtime.json').read_text())
    required = tuple(map(int, marker['minimumMacOS'].split('.')))
    supported = tuple(map(int, MACOS.split('.')))
    length = max(len(required), len(supported))
    if required + (0,) * (length - len(required)) > supported + (0,) * (length - len(supported)):
        raise SystemExit('Node runtime requires a newer macOS than the app supports')


def require_clean_tracked_state(root):
    dirty = output('git', 'status', '--short', '--untracked-files=no', cwd=root)
    if dirty:
        raise SystemExit(
            'Packaging requires committed tracked inputs. Commit or stash tracked changes, then retry.\n' + dirty)


def export_committed_head(root, destination):
    commit = output('git', 'rev-parse', 'HEAD', cwd=root)
    with tempfile.NamedTemporaryFile(prefix='godl-head-', suffix='.tar', dir='/tmp') as archive:
        run('git', 'archive', '--format=tar', f'--output={archive.name}', commit, cwd=root)
        with tarfile.open(archive.name) as bundle:
            bundle.extractall(destination, filter='data')
    return commit


def verify_node_version(source, runtimes):
    expected = (source / '.nvmrc').read_text().strip()
    package = json.loads((source / 'engine/package.json').read_text())
    lock = json.loads((source / 'engine/package-lock.json').read_text())
    versions = {
        '.nvmrc': expected,
        'engine/package.json': package.get('engines', {}).get('node'),
        'engine/package-lock.json': lock.get('packages', {}).get('', {}).get('engines', {}).get('node'),
    }
    versions.update({
        f'{arch} packaged runtime': json.loads((runtime / '.godl-node-runtime.json').read_text()).get('nodeVersion')
        for arch, runtime in runtimes.items()
    })
    mismatched = [name for name, version in versions.items() if version != expected]
    if mismatched:
        raise SystemExit('Node version differs from .nvmrc in: ' + ', '.join(mismatched))
    return expected


def install_locked_dependencies(source, runtime):
    node = runtime / 'bin/node'
    npm_cli = runtime / 'lib/node_modules/npm/bin/npm-cli.js'
    if not npm_cli.is_file():
        raise SystemExit(f'Pinned Node runtime is missing npm: {npm_cli}')
    run(node, npm_cli, 'ci', '--ignore-scripts', '--omit=dev', cwd=source / 'engine')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--node-runtime', required=True, type=Path, help='Verified arm64 runtime root')
    parser.add_argument('--universal', action='store_true', help='Include native Apple silicon and Intel executables')
    parser.add_argument('--intel-node-runtime', type=Path, help='Verified x64 runtime root (required with --universal)')
    parser.add_argument('--dmg', action='store_true', help='Also create a local drag-to-Applications disk image')
    parser.add_argument('--install', action='store_true', help='Install to user Applications; refuses to replace an existing app')
    args = parser.parse_args()
    if args.universal != bool(args.intel_node_runtime):
        parser.error('--universal and --intel-node-runtime must be supplied together')
    root = Path(__file__).resolve().parents[1]
    require_clean_tracked_state(root)
    runtimes = {'arm64': args.node_runtime}
    if args.universal:
        runtimes['x86_64'] = args.intel_node_runtime
    for arch, path in list(runtimes.items()):
        runtimes[arch] = Path(output(sys.executable, root / 'scripts/fetch-node-runtime.py',
                                    '--validate', path, '--arch', 'x64' if arch == 'x86_64' else arch))
        verify_deployment_target(runtimes[arch])
    host = platform.machine()
    if host not in runtimes:
        raise SystemExit('This build needs a bundled runtime matching the build host')
    installed = Path.home() / 'Applications/GODL Monitor.app'
    if args.install and installed.exists():
        raise SystemExit(f'Refusing to replace existing app: {installed}')
    # Neutral build paths avoid embedding a contributor's personal home path.
    with tempfile.TemporaryDirectory(prefix='godl-source-', dir='/tmp') as clean_source:
        source = Path(clean_source)
        source_commit = export_committed_head(root, source)
        node_version = verify_node_version(source, runtimes)
        engine = source / 'engine'
        missing = [name for name in ENGINE_FILES if not (engine / name).is_file()]
        if missing:
            raise SystemExit(f'Missing packaged engine files: {", ".join(missing)}')
        install_locked_dependencies(source, runtimes[host])
        # Our dependencies are JavaScript. A future native add-on needs explicit
        # per-architecture packaging rather than accidentally copying the host build.
        if list((engine / 'node_modules').rglob('*.node')):
            raise SystemExit('Native Node add-ons require a reviewed architecture-aware packaging path')
        run(runtimes[host] / 'bin/node', '--input-type=module', '--eval',
            "import { DatabaseSync } from 'node:sqlite'; new DatabaseSync(':memory:').close(); await import('@solana/addresses');",
            cwd=engine)
        lock_checksum = sha256(engine / 'package-lock.json')
        binaries = {}
        for arch in runtimes:
            triple = f'{arch}-apple-macosx{MACOS}'
            run('swift', 'build', '-c', 'release', '--triple', triple, '-Xswiftc', '-warnings-as-errors', cwd=source)
            binaries[arch] = Path(output('swift', 'build', '-c', 'release', '--triple', triple, '--show-bin-path', cwd=source))
        with tempfile.TemporaryDirectory(prefix='godl-package-') as staging:
            stage = Path(staging)
            app = stage / 'GODL Monitor.app'
            macos = app / 'Contents/MacOS'
            resources = app / 'Contents/Resources'
            helpers = app / 'Contents/Helpers'
            for folder in (macos, resources, helpers):
                folder.mkdir(parents=True)
            combine([path / 'GODLMonitor' for path in binaries.values()], macos / 'GODLMonitor', runtimes)
            combine([path / 'bin/node' for path in runtimes.values()], helpers / 'node', runtimes)
            shutil.copytree(binaries[host] / 'GODLMacOS_GODLMonitor.bundle', resources / 'GODLMacOS_GODLMonitor.bundle')
            shutil.copy2(source / 'Brand/GODL.icns', resources / 'GODL.icns')
            for notice in ('LICENSE', 'NOTICE'):
                shutil.copy2(source / notice, resources / notice)
            runtime_resources = resources / 'NodeRuntime'
            runtime_resources.mkdir()
            shutil.copy2(runtimes[host] / 'LICENSE', runtime_resources / 'LICENSE')
            bundled = resources / 'engine'
            bundled.mkdir()
            for name in ENGINE_FILES:
                shutil.copy2(engine / name, bundled / name)
            shutil.copytree(engine / 'node_modules', bundled / 'node_modules')
            info = {'CFBundleName': 'GODL Monitor', 'CFBundleDisplayName': 'GODL',
                    'CFBundleIdentifier': 'dev.godl.personal.monitor', 'CFBundleExecutable': 'GODLMonitor',
                    'CFBundlePackageType': 'APPL', 'CFBundleShortVersionString': VERSION, 'CFBundleVersion': BUILD,
                    'LSMinimumSystemVersion': MACOS, 'LSUIElement': True, 'NSHighResolutionCapable': True,
                    'NSPrincipalClass': 'NSApplication', 'CFBundleIconFile': 'GODL'}
            with (app / 'Contents/Info.plist').open('wb') as target:
                plistlib.dump(info, target)
            for attribute in ('com.apple.FinderInfo', 'com.apple.ResourceFork'):
                subprocess.run(['xattr', '-r', '-d', attribute, str(app)], capture_output=True, check=False)
            run('codesign', '--force', '--sign', '-', helpers / 'node')
            provenance = {'nodeVersion': node_version, 'sourceCommit': source_commit,
                          'packageLockSha256': lock_checksum, 'bundledArchitectures': list(runtimes),
                          'bundledNodeSha256': sha256(helpers / 'node'), 'bundledSigning': 'ad-hoc',
                          'sources': {arch: json.loads((path / '.godl-node-runtime.json').read_text())
                                      for arch, path in runtimes.items()}}
            (runtime_resources / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
            run('codesign', '--force', '--sign', '-', app)
            run('codesign', '--verify', '--deep', '--strict', app)
            run(helpers / 'node', '--input-type=module', '--eval',
                "import { DatabaseSync } from 'node:sqlite'; new DatabaseSync(':memory:').close(); await import('./monitor.mjs');",
                cwd=bundled)
            dist = root / 'dist'
            dist.mkdir(exist_ok=True)
            stem = f'GODL-Monitor-{VERSION}-universal' if args.universal else 'GODL-Monitor-local'
            archive = dist / (stem + '.zip')
            temporary = dist / (stem + '.pending.zip')
            run('ditto', '-c', '-k', '--keepParent', app, temporary)
            run(sys.executable, root / 'scripts/check-privacy.py', '--archive', temporary)
            temporary.replace(archive)
            checksum_file(archive)
            print(archive)
            if args.dmg:
                # This separate staging root contains only already-verified app
                # bytes, a standard Applications link and a short generic guide.
                image_root = stage / 'disk'
                image_root.mkdir()
                shutil.copytree(app, image_root / app.name)
                (image_root / 'Applications').symlink_to('/Applications')
                (image_root / 'Start here.txt').write_text(
                    'GODL Monitor — private alpha\n\n'
                    '1. Drag GODL Monitor to Applications.\n'
                    '2. Eject this disk image, then open GODL Monitor from Applications.\n'
                    '3. Enter a public Solana address and choose Start monitoring.\n\n'
                    'The app uses a public RPC by default. To use your own Helius or other Mainnet HTTPS endpoint,\n'
                    'open Settings > Private RPC, enter the endpoint, then choose Save RPC. No RPC key is bundled.\n'
                    'Setup guide: https://github.com/ivnv00/godl-monitor/blob/main/docs/getting-started.md\n\n'
                    'The runtime is included. No Terminal, Node installation, wallet connection or private key is needed.\n' +
                    ('Apple silicon and Intel; macOS 14 or later.\n' if args.universal else 'Apple silicon; macOS 14 or later.\n') +
                    'This local candidate is ad-hoc signed, not Apple notarized.\n'
                    'If macOS blocks it, consult the project installation guide. Never disable Gatekeeper system-wide.\n'
                    'History starts on this Mac; verified net earnings need separately reviewed accounting history.\n')
                image = dist / (stem + '.dmg')
                pending = dist / (stem + '.pending.dmg')
                run('hdiutil', 'create', '-ov', '-format', 'UDZO', '-fs', 'HFS+', '-volname', 'GODL Monitor',
                    '-srcfolder', image_root, pending)
                run('hdiutil', 'verify', pending)
                pending.replace(image)
                checksum_file(image)
                print(image)
            if args.install:
                installed.parent.mkdir(exist_ok=True)
                shutil.copytree(app, installed)
                run('codesign', '--verify', '--deep', '--strict', installed)
                print(installed)


if __name__ == '__main__':
    main()
