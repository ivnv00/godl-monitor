#!/usr/bin/env python3
"""Preview a pinned local candidate; sign/upload only with explicit execution flags."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import plistlib
import re
import shutil
import stat
import subprocess
import sys
import unicodedata
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APP = 'GODL Monitor.app'
ARCHES = ('arm64', 'x86_64')
NODE_ENTITLEMENTS = {'com.apple.security.cs.allow-jit': True}
NODE = 'Contents/Helpers/node'
PROVENANCE = 'Contents/Resources/NodeRuntime/provenance.json'
LOCK = 'Contents/Resources/engine/package-lock.json'
EXECUTABLE = 'Contents/MacOS/GODLMonitor'
MACH_MAGICS = {bytes.fromhex(value) for value in (
    'feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca')}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest_file(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def command(*args, cwd=None, details=False):
    result = subprocess.run(list(map(str, args)), cwd=cwd, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT if details else subprocess.PIPE)
    # Tool output can include signing names, local paths and Keychain context.
    # Keep errors terse; submission IDs and stage are recorded separately.
    require(result.returncode == 0, f'{Path(str(args[0])).name} failed (exit {result.returncode})')
    return result.stdout.strip()


def inspect_candidate(archive, expected_sha, expected_commit):
    require(re.fullmatch(r'[0-9a-f]{64}', expected_sha), 'Use a complete lowercase ZIP SHA-256')
    require(re.fullmatch(r'[0-9a-f]{40}', expected_commit), 'Use a complete source commit')
    require(archive.is_file() and not archive.is_symlink(), 'Candidate must be a regular ZIP file')
    require(archive.stat().st_size <= 1024 ** 3, 'Candidate ZIP is too large')
    require(digest_file(archive) == expected_sha, 'Candidate ZIP checksum mismatch')
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        require(len(entries) <= 20000 and sum(item.file_size for item in entries) <= 2 * 1024 ** 3,
                'Candidate expands beyond the package limit')
        names = set()
        for item in entries:
            name = item.filename.rstrip('/')
            parts = PurePosixPath(name).parts
            require(parts and parts[0] == APP and '/'.join(parts) == name and
                    all(part not in ('.', '..') for part in parts) and
                    not any(ord(c) < 32 or c in '\\:' for c in name), 'Unsafe candidate ZIP path')
            folded = unicodedata.normalize('NFC', name).casefold()
            require(folded not in names, 'Duplicate or case-colliding ZIP path')
            names.add(folded)
            kind = stat.S_IFMT(item.external_attr >> 16)
            require(kind in (0, stat.S_IFREG, stat.S_IFDIR) and
                    (kind != stat.S_IFDIR or item.is_dir()), 'Links and special files are not accepted')
            require(not item.flag_bits & 1 and item.file_size <= 1024 ** 3, 'Unsupported ZIP member')
            if not item.is_dir():
                with bundle.open(item) as source:
                    magic = source.read(4)
                require(magic not in MACH_MAGICS or name in (f'{APP}/{NODE}', f'{APP}/{EXECUTABLE}'),
                        'Unexpected native code requires a separate signing review')
                require(not name.endswith(('.node', '.dylib')), 'Native add-ons require a separate signing review')

        def read_small(relative):
            item = bundle.getinfo(f'{APP}/{relative}')
            require(item.file_size < 1024 ** 2, 'Oversized package metadata')
            return bundle.read(item)

        info = plistlib.loads(read_small('Contents/Info.plist'))
        provenance = json.loads(read_small(PROVENANCE))
        require(isinstance(info, dict) and isinstance(provenance, dict), 'Invalid package metadata')
        require(info.get('CFBundleIdentifier') == 'dev.godl.personal.monitor' and
                info.get('CFBundleExecutable') == 'GODLMonitor' and
                info.get('CFBundlePackageType') == 'APPL', 'Unexpected app identity')
        version = info.get('CFBundleShortVersionString', '')
        require(isinstance(version, str) and re.fullmatch(r'\d+\.\d+\.\d+', version), 'Invalid app version')
        require(provenance.get('sourceCommit') == expected_commit, 'Candidate source commit mismatch')
        require(provenance.get('bundledSigning') == 'ad-hoc', 'Input must be the reviewed ad-hoc candidate')
        require(sorted(provenance.get('bundledArchitectures', [])) == sorted(ARCHES),
                'A universal candidate is required')
        for relative, key in ((NODE, 'bundledNodeSha256'), (LOCK, 'packageLockSha256')):
            with bundle.open(f'{APP}/{relative}') as source:
                require(hashlib.file_digest(source, 'sha256').hexdigest() == provenance.get(key),
                        f'Bundled {key} mismatch')
        require(bundle.getinfo(f'{APP}/{EXECUTABLE}').file_size > 0, 'Missing app executable')
    return {'version': version, 'sourceCommit': expected_commit, 'inputSha256': expected_sha,
            'nodeVersion': provenance.get('nodeVersion'), 'packageLockSha256': provenance.get('packageLockSha256')}


def extract_candidate(archive, destination):
    # Called only on the private, revalidated copy. No symlinks or special files.
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            target = destination / item.filename
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(item) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o755 if (item.external_attr >> 16) & 0o111 else 0o644)


def verify_source(metadata):
    require(command('git', 'rev-parse', 'HEAD', cwd=ROOT) == metadata['sourceCommit'],
            'Checkout HEAD must match the reviewed candidate')
    require(not command('git', 'status', '--porcelain', '--untracked-files=all', cwd=ROOT),
            'Signing requires a clean committed checkout')
    require((ROOT / '.nvmrc').read_text().strip() == metadata['nodeVersion'] and
            digest_file(ROOT / 'engine/package-lock.json') == metadata['packageLockSha256'],
            'Candidate runtime or lockfile differs from reviewed source')


def verify_identity(identity, team):
    identities = command('/usr/bin/security', 'find-identity', '-v', '-p', 'codesigning')
    matches = re.findall(r'\b' + re.escape(identity) + r' "Developer ID Application: [^\n"]+ \(' +
                         re.escape(team) + r'\)"', identities, re.IGNORECASE)
    require(len(matches) == 1, 'Expected valid Developer ID Application identity/team was not found')


def verify_code(path, team, entitlements):
    requirement = ('anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists '
                   f'and certificate leaf[subject.OU] = "{team}"')
    command('/usr/bin/codesign', '--verify', '--strict', '--all-architectures',
            '--test-requirement', requirement, path)
    for arch in ARCHES:
        details = command('/usr/bin/codesign', '-d', '--arch', arch, '--verbose=4', path, details=True)
        flags = re.search(r'flags=0x([0-9a-fA-F]+)', details)
        require(flags and int(flags[1], 16) & 0x10000 and f'TeamIdentifier={team}\n' in details + '\n'
                and '\nTimestamp=' in details, 'Hardened runtime, team or secure timestamp missing')
        encoded = command('/usr/bin/codesign', '-d', '--arch', arch, '--entitlements', '-', '--xml', path)
        actual = plistlib.loads(encoded.encode()) if encoded else {}
        require(actual == entitlements, 'Unexpected code signing entitlements')


def save_state(folder, state):
    pending = folder / 'attempt.pending.json'
    pending.write_text(json.dumps(state, indent=2) + '\n')
    pending.replace(folder / 'attempt.json')


def notarize(path, profile, folder, state):
    entry = {'artifact': path.name, 'sha256': digest_file(path), 'status': 'submitting'}
    state['submissions'].append(entry)
    save_state(folder, state)
    # Submit separately so an ID survives an interrupted wait. Never auto-retry.
    result = json.loads(command('/usr/bin/xcrun', 'notarytool', 'submit', path,
                                '--keychain-profile', profile, '--output-format', 'json'))
    submission = str(uuid.UUID(result['id']))
    entry.update(id=submission, status='submitted')
    save_state(folder, state)
    result = json.loads(command('/usr/bin/xcrun', 'notarytool', 'wait', submission,
                                '--keychain-profile', profile, '--output-format', 'json'))
    require(result.get('id') == submission, 'Notary result belongs to another submission')
    status = result.get('status')
    entry['status'] = status if status in ('Accepted', 'Invalid', 'Rejected', 'In Progress') else 'unknown'
    save_state(folder, state)
    require(status == 'Accepted', 'Apple has not accepted this submission; inspect its recorded ID')
    command('/usr/bin/xcrun', 'stapler', 'staple', path if path.suffix == '.dmg' else path.parent / APP)
    command('/usr/bin/xcrun', 'stapler', 'validate', path if path.suffix == '.dmg' else path.parent / APP)


def execute(args, metadata):
    # The engine smoke changes cwd; relative staging paths would then resolve
    # inside the engine directory instead of the caller's checkout.
    args.archive = args.archive.absolute()
    args.output = args.output.absolute()
    verify_source(metadata)
    verify_identity(args.identity, args.team_id)
    # Exclusive directory reservation: never replace a prior attempt/candidate.
    args.output.mkdir(mode=0o700)
    state = {**metadata, 'status': 'incomplete', 'stage': 'input', 'submissions': []}
    save_state(args.output, state)
    try:
        work = args.output / 'work'
        work.mkdir()
        archive = work / 'input.zip'
        shutil.copyfile(args.archive, archive)
        inspect_candidate(archive, args.sha256, args.source_commit)
        command(sys.executable, ROOT / 'scripts/check-privacy.py', '--history', '--archive', archive)
        extract_candidate(archive, work)
        app = work / APP
        node = app / NODE
        for executable in (node, app / EXECUTABLE):
            require(set(command('/usr/bin/lipo', '-archs', executable).split()) == set(ARCHES),
                    'Packaged executable is not universal')
        command('/usr/bin/codesign', '--verify', '--deep', '--strict', '--all-architectures', app)
        state['stage'] = 'signing'
        save_state(args.output, state)
        entitlements = work / 'node-entitlements.plist'
        entitlements.write_bytes(plistlib.dumps(NODE_ENTITLEMENTS))
        signing = ('/usr/bin/codesign', '--force', '--sign', args.identity, '--options', 'runtime', '--timestamp')
        command(*signing, '--entitlements', entitlements, node)
        verify_code(node, args.team_id, NODE_ENTITLEMENTS)
        provenance_path = app / PROVENANCE
        provenance = json.loads(provenance_path.read_text())
        provenance.update(bundledNodeSha256=digest_file(node), bundledSigning='developer-id')
        provenance_path.write_text(json.dumps(provenance, indent=2) + '\n')
        # Do not preserve upstream entitlements and do not sign using --deep.
        command(*signing, app)
        verify_code(app, args.team_id, {})
        command('/usr/bin/codesign', '--verify', '--deep', '--strict', '--all-architectures', app)
        command(node, '--input-type=module', '--eval',
                "import {DatabaseSync} from 'node:sqlite'; new DatabaseSync(':memory:').close(); "
                "function hot(n){return n+1;} for(let i=0;i<1000000;i++)if(hot(i)!==i+1)throw Error('JIT'); "
                "await import('./monitor.mjs'); await import('./accounting-import.mjs');",
                cwd=app / 'Contents/Resources/engine')
        state['stage'] = 'app-notarization'
        save_state(args.output, state)
        app_zip = work / 'submission.zip'
        command('/usr/bin/ditto', '-c', '-k', '--keepParent', app, app_zip)
        notarize(app_zip, args.keychain_profile, args.output, state)
        command('/usr/sbin/spctl', '--assess', '--type', 'execute', app)
        final = work / 'notarized'
        final.mkdir()
        stem = f"GODL-Monitor-{metadata['version']}-universal"
        zip_path = final / f'{stem}.zip'
        command('/usr/bin/ditto', '-c', '-k', '--keepParent', app, zip_path)
        command(sys.executable, ROOT / 'scripts/check-privacy.py', '--archive', zip_path)
        disk = work / 'disk'
        disk.mkdir()
        shutil.copytree(app, disk / APP)
        (disk / 'Applications').symlink_to('/Applications')
        (disk / 'Start here.txt').write_text(
            'GODL Monitor\n\n1. Drag GODL Monitor to Applications.\n'
            '2. Eject this disk image and open the app from Applications.\n'
            '3. Enter your public Solana address. No wallet connection or private key is needed.\n\n'
            'Apple silicon and Intel; macOS 14 or later. The runtime is included.\n'
            'Your own Helius or other Mainnet HTTPS RPC is optional: Settings > Private RPC.\n'
            'History starts on this Mac. Verified net earnings need separately reviewed accounting history.\n'
            'Guide: https://github.com/ivnv00/godl-monitor/blob/main/docs/getting-started.md\n')
        state['stage'] = 'dmg-notarization'
        save_state(args.output, state)
        dmg = final / f'{stem}.dmg'
        command('/usr/bin/hdiutil', 'create', '-format', 'UDZO', '-fs', 'HFS+', '-volname', 'GODL Monitor',
                '-srcfolder', disk, dmg)
        command('/usr/bin/codesign', '--force', '--sign', args.identity, '--timestamp', dmg)
        command('/usr/bin/codesign', '--verify', '--strict', dmg)
        notarize(dmg, args.keychain_profile, args.output, state)
        command('/usr/bin/hdiutil', 'verify', dmg)
        command('/usr/sbin/spctl', '--assess', '--type', 'open', '--context', 'context:primary-signature', dmg)
        hashes = {}
        for artifact in (zip_path, dmg):
            hashes[artifact.name] = digest_file(artifact)
            artifact.with_name(artifact.name + '.sha256').write_text(f'{hashes[artifact.name]}  {artifact.name}\n')
        state.update(status='notarized-local-candidate', stage='complete', artifacts=hashes)
        (final / 'distribution.json').write_text(json.dumps(state, indent=2) + '\n')
        # Only this directory is a completed candidate. No publication occurs.
        final.rename(args.output / 'notarized')
        save_state(args.output, state)
    except BaseException:
        state['status'] = 'incomplete'
        save_state(args.output, state)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True, type=Path)
    parser.add_argument('--sha256', required=True, help='Previously reviewed input ZIP SHA-256')
    parser.add_argument('--source-commit', required=True, help='Previously reviewed full source revision')
    parser.add_argument('--execute', action='store_true', help='Use Developer ID signing and Apple services')
    parser.add_argument('--approve-apple-upload', action='store_true', help='Confirm separately obtained owner approval')
    parser.add_argument('--identity', help='Developer ID Application certificate SHA-1 fingerprint (not a secret)')
    parser.add_argument('--team-id', help='Expected ten-character Apple developer team ID')
    parser.add_argument('--keychain-profile', help='Existing notarytool Keychain profile; never pass a password')
    parser.add_argument('--output', type=Path, help='New private attempt directory; must not exist')
    args = parser.parse_args(argv)
    if args.execute:
        if not (args.approve_apple_upload and args.output and args.keychain_profile and
                re.fullmatch(r'[A-Fa-f0-9]{40}', args.identity or '') and
                re.fullmatch(r'[A-Z0-9]{10}', args.team_id or '')):
            parser.error('Execution requires upload approval, identity fingerprint, team, Keychain profile and new output')
        require(sys.platform == 'darwin', 'Execution requires macOS')
        args.identity = args.identity.upper()
    else:
        require(not any((args.approve_apple_upload, args.identity, args.team_id, args.keychain_profile, args.output)),
                'Signing options require --execute; preview needs only the three candidate inputs')
    metadata = inspect_candidate(args.archive, args.sha256, args.source_commit)
    if not args.execute:
        print(json.dumps({**metadata, 'mode': 'preview', 'uploads': False,
                          'next': 'After owner approval: sign Node/app, notarize/staple app, package/notarize/staple DMG. '
                                  'Preview validates ZIP structure and provenance, not signatures or Apple acceptance.'}, indent=2))
        return
    execute(args, metadata)
    print('Completed local notarized candidate. Publication and clean-Mac validation remain separate.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError, zipfile.BadZipFile, plistlib.InvalidFileException) as error:
        raise SystemExit(f'Stopped: {error}') from None
