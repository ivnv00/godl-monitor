#!/usr/bin/env python3
"""Fail closed on local state, private identifiers and unreviewed account literals.

Run before committing. PRIVATE_SCAN_VALUES may contain newline-separated private
identifiers for an additional local check; they are never printed or persisted.
This is a release guard, not a substitute for reviewing screenshots and fixtures.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'.git', '.build', '.swiftpm', 'node_modules', 'dist', '__pycache__'}
PRIVATE_FILES = {
    'rpc-config.json', 'connection.json', 'wallet-settings.json', 'monitor-view.json',
    'goals.json', 'reward-inbox.json', 'reward-notification-cursor.json',
    'accounting-anchor.json', 'accounting-checkpoint.json', 'acquisition-period.json',
    'market-quotes.json', '.monitor-instance.lock',
}
PRIVATE_DIRS = {'data', 'work', 'Wallets', 'accounting-evidence'}
PROTOCOL = {
    'mineWsRs2Rmw2jPMkVbgAbDjV1E23yQ8TEodaX3iza4',  # GODL program
    '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',  # Mainnet genesis
    'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF',  # GODL mint
    'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P',  # XAUt0 mint
    '49RF5rddTaRVq6iypkGvEYKhq5kUWHgRVspigNZHjoJc',  # Global board PDA
    'rngJSm78htuZREU5F3tb3JKnYSaPx1nMHZxyvNNFmxy',  # Protocol RNG
    'BPFLoaderUpgradeab1e11111111111111111111111',
    'ComputeBudget111111111111111111111111111111',
    'So11111111111111111111111111111111111111112',  # Wrapped SOL mint
    'EdftHBeEWwhpMPd9MZdPrGMGTKKXN9unt76xdqmmoKsd',  # Global config PDA
    '5epGzdW6veQwLQiQs1L45uUQ8jdSLQHWL8RbC7uTWVY3',  # Global treasury PDA
    '7SAZa5WvT7W24455wzN1hqagbyeKyiczSo7qeCfkA3Sz',  # Global gold vault PDA
    # PDAs derived in chain.test.mjs exclusively from Buffer.alloc(32, 7).
    'CE2V1Hj3oVE72XTfNCf4iAvP6snHA8VvUSKjqnSthJDm',
    '9M581Yhkw5GzC8GYo12PGN42J5fm78YCU1K6xShPetao',
    'DK73rBXmLvtQ5uCLsT14XBYeoa1Atf9VDFGAX7QKUYA',
    'AVVWQr9xYcXxp2akHafrzpEWW1zh7i9kaqHmHkJwkd4G',
}
ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
LITERAL = re.compile(r'''["'`]([1-9A-HJ-NP-Za-km-z]{32,44})["'`]''')
HOME_PATH = re.compile(rb'/Users/[A-Za-z0-9_.-]+/')
PRIVATE_KEY = re.compile(rb'-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{32}')
URL_SECRET = re.compile(rb'https?://[^\s"\'<>]+(?:api[_-]?key|token|secret)=[^\s"\'<>]+', re.I)
TEXT_SUFFIXES = {'.swift', '.mjs', '.py', '.md', '.json', '.yml', '.yaml', '.toml'}


def decode_address(value):
    number = 0
    for character in value:
        number = number * 58 + ALPHABET.index(character)
    raw = number.to_bytes((number.bit_length() + 7) // 8, 'big')
    return b'\0' * (len(value) - len(value.lstrip('1'))) + raw


def inspect(name, data, account_literals=True, official_node=False):
    problems = []
    path = Path(name)
    if path.name in PRIVATE_FILES or set(path.parts) & PRIVATE_DIRS or path.suffix in {'.sqlite', '.db', '.pem', '.key', '.log'}:
        problems.append('private runtime file or evidence path')
    # The pinned official Node binary embeds its upstream builder directory.
    # This exact prefix is exempt only for the packaged runtime; local private
    # identifiers below still scan every original byte, without exemptions.
    home_data = data.replace(b"/Users/" + b"admin/", b"<upstream-builder>/") if official_node else data
    if HOME_PATH.search(home_data):
        problems.append('personal absolute home path')
    if PRIVATE_KEY.search(data):
        problems.append('private key material')
    for match in URL_SECRET.finditer(data):
        if b'SYNTHETIC_' not in match.group(0) and b'YOUR_' not in match.group(0):
            problems.append('credential-bearing endpoint')
    for value in os.environ.get('PRIVATE_SCAN_VALUES', '').splitlines():
        if value and value.encode() in data:
            problems.append('private local identifier')
    if account_literals and path.suffix in TEXT_SUFFIXES:
        for match in LITERAL.finditer(data.decode('utf-8', errors='replace')):
            address = match.group(1)
            raw = decode_address(address)
            # Repeated-byte keys and a zero-prefixed test counter are synthetic.
            synthetic = len(set(raw)) == 1 or (len(raw) == 32 and raw[:-1] == bytes(31))
            if len(raw) == 32 and address not in PROTOCOL and not synthetic:
                line = data[:len(data.decode('utf-8', errors='replace')[:match.start()].encode())].count(b'\n') + 1
                problems.append(f'unreviewed account literal at line {line}')
    return [(name, item) for item in sorted(set(problems))]


def source_paths(root=ROOT):
    # Include new files before staging. Ignored local data stays outside the
    # source boundary; force-added ignored files are included by --cached.
    tracked = subprocess.run(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
                             cwd=root, capture_output=True)
    if tracked.returncode == 0:
        paths = {root / os.fsdecode(name) for name in tracked.stdout.split(b'\0') if name}
        return sorted(p for p in paths if p.exists() or p.is_symlink())
    return sorted(p for p in root.rglob('*') if (p.is_file() or p.is_symlink())
                  and not set(p.relative_to(root).parts) & EXCLUDED)


def inspect_index(root=ROOT):
    result = subprocess.run(['git', 'ls-files', '--stage', '-z'], cwd=root, capture_output=True)
    if result.returncode:
        # Downloaded source archives have no index. A broken checkout must fail
        # instead of silently skipping the bytes prepared for a commit.
        if any((parent / '.git').exists() for parent in (root, *root.parents)):
            raise RuntimeError('Cannot inspect the Git index; repair the checkout before committing.')
        return [], 0
    failures = []
    entries = [entry for entry in result.stdout.split(b'\0') if entry]
    for entry in entries:
        metadata, raw_name = entry.split(b'\t', 1)
        mode, object_id, stage = metadata.split()
        name = os.fsdecode(raw_name)
        label = f'{name} (index)'
        if stage != b'0':
            failures.append((label, 'unmerged index entry requires resolution'))
        if mode == b'120000':
            failures.append((label, 'staged symlink requires review'))
        elif mode not in {b'100644', b'100755'}:
            failures.append((label, 'unsupported staged file mode requires review'))
        else:
            data = subprocess.check_output(['git', 'cat-file', 'blob', object_id.decode('ascii')], cwd=root)
            failures += [(label, reason) for _, reason in inspect(name, data)]
    return failures, len(entries)


def inspect_history(root=ROOT):
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=root)

    if git('rev-parse', '--is-shallow-repository').strip() != b'false':
        raise SystemExit('History privacy review requires a complete clone; fetch the missing history first.')
    commits = git('rev-list', '--all', 'HEAD').splitlines()
    failures = []
    seen = set()
    blobs = {}
    for commit in commits:
        revision = commit.decode('ascii')
        failures += inspect(f'commit {revision[:12]}', git('cat-file', 'commit', revision), account_literals=False)
        for entry in git('ls-tree', '-r', '-z', '--full-tree', revision).split(b'\0'):
            if not entry:
                continue
            metadata, raw_name = entry.split(b'\t', 1)
            mode, kind, object_id = metadata.split()
            name = os.fsdecode(raw_name)
            identity = (mode, object_id, name)
            if identity in seen:
                continue
            seen.add(identity)
            label = f'{name} (history {revision[:12]})'
            if kind != b'blob' or mode not in {b'100644', b'100755'}:
                failures.append((label, 'historical symlink or unsupported file mode requires review'))
                continue
            if object_id not in blobs:
                blobs[object_id] = git('cat-file', 'blob', object_id.decode('ascii'))
            failures += [(label, reason) for _, reason in inspect(name, blobs[object_id])]
    # Annotated tag messages are public too; lightweight tags point to commits
    # already included above.
    for entry in git('for-each-ref', '--format=%(objecttype) %(objectname)', 'refs/tags').splitlines():
        kind, object_id = entry.split()
        if kind == b'tag':
            oid = object_id.decode('ascii')
            failures += inspect(f'tag {oid[:12]}', git('cat-file', 'tag', oid), account_literals=False)
    return failures, len(commits), len(seen)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path, help='Also scan a distributable ZIP')
    parser.add_argument('--history', action='store_true', help='Also scan all reachable Git history; requires a complete clone')
    args = parser.parse_args()
    paths = source_paths()
    failures, staged_count = inspect_index()
    for path in paths:
        if path.is_symlink():
            failures.append((str(path.relative_to(ROOT)), 'tracked symlink requires review'))
        else:
            failures += inspect(str(path.relative_to(ROOT)), path.read_bytes())
    if args.history:
        historical, commits, versions = inspect_history()
        failures += historical
    if args.archive:
        with zipfile.ZipFile(args.archive) as archive:
            for name in archive.namelist():
                if name.endswith('/'):
                    continue
                data = archive.read(name)
                failures += inspect(name, data, account_literals='/engine/node_modules/' not in name,
                                    official_node=name.endswith('/Contents/Helpers/node'))
    if failures:
        for name, reason in failures:
            print(f'{name}: {reason}', file=sys.stderr)
        return 1
    print(f'Privacy boundary passed: {len(paths)} source files, {staged_count} index entries'
          + (' and package' if args.archive else '') + '.')
    if args.history:
        print(f'History privacy boundary passed: {commits} commits, {versions} file versions and annotated tag messages.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
