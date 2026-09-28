#!/usr/bin/env python3
"""Build a sealed local bundle with its observer and verified Node runtime."""
import argparse, hashlib, json, plistlib, shutil, subprocess, sys, tempfile
from pathlib import Path

def sha256(path):
 digest=hashlib.sha256()
 with path.open('rb') as source:
  for chunk in iter(lambda: source.read(1024*1024),b''): digest.update(chunk)
 return digest.hexdigest()

parser=argparse.ArgumentParser()
parser.add_argument('--node-runtime',required=True,type=Path,help='Root produced by fetch-node-runtime.py')
parser.add_argument('--install',action='store_true',help='Install to user Applications; refuses to replace an existing app')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
engine=root/'engine'
fetcher=root/'scripts'/'fetch-node-runtime.py'
node_runtime=Path(subprocess.check_output(
 [sys.executable,str(fetcher),'--validate',str(args.node_runtime)],text=True
).strip())
node=node_runtime/'bin'/'node'
engine_files=[
 'monitor-cli.mjs','chain.mjs','observation-store.mjs','monitor.mjs','period-cost.mjs','economics.mjs',
 'ongoing-cost.mjs','accounting-evidence.mjs','accounting-service.mjs','accounting-cli.mjs',
 'transaction-evidence.mjs','rpc-config.mjs','reward-balances.mjs','accounting-transport.mjs',
 'earnings.mjs','market-quotes.mjs','package.json','package-lock.json'
]
missing=[name for name in engine_files if not (engine/name).is_file()]
if missing: raise SystemExit(f'Missing packaged engine files: {", ".join(missing)}')
subprocess.run([
 str(node),'--input-type=module','--eval',
 "import { DatabaseSync } from 'node:sqlite'; new DatabaseSync(':memory:').close(); await import('@solana/addresses');"
],cwd=engine,check=True)
installed=Path.home()/'Applications'/'GODL Monitor.app'
if args.install and installed.exists(): raise SystemExit(f'Refusing to replace existing app: {installed}')
# Compile a minimal copy in a neutral temporary path. Swift resource accessors
# embed their build path; a source checkout under a personal home must not leak.
with tempfile.TemporaryDirectory(prefix='godl-source-', dir='/tmp') as clean_source:
 build_source=Path(clean_source)
 shutil.copy2(root/'Package.swift', build_source/'Package.swift')
 shutil.copytree(root/'Sources', build_source/'Sources')
 shutil.copytree(root/'Tests', build_source/'Tests')
 subprocess.run(['swift','build','-c','release','-Xswiftc','-warnings-as-errors'],cwd=build_source,check=True)
 binarydir=Path(subprocess.check_output(['swift','build','-c','release','--show-bin-path'],cwd=build_source,text=True).strip())
 # Documents can gain File Provider FinderInfo after launch. Never stage/sign there.
 with tempfile.TemporaryDirectory(prefix='godl-package-') as staging:
  app=Path(staging)/'GODL Monitor.app'
  macos=app/'Contents'/'MacOS';resources=app/'Contents'/'Resources';helpers=app/'Contents'/'Helpers'
  macos.mkdir(parents=True);resources.mkdir(parents=True);helpers.mkdir(parents=True)
  shutil.copy2(binarydir/'GODLMonitor',macos/'GODLMonitor')
  shutil.copy2(node,helpers/'node')
  shutil.copytree(binarydir/'GODLMacOS_GODLMonitor.bundle',resources/'GODLMacOS_GODLMonitor.bundle')
  shutil.copy2(root/'Brand'/'GODL.icns',resources/'GODL.icns')
  for notice in ['LICENSE', 'NOTICE']:
   shutil.copy2(root/notice, resources/notice)
  runtime_resources=resources/'NodeRuntime';runtime_resources.mkdir()
  shutil.copy2(node_runtime/'LICENSE',runtime_resources/'LICENSE')
  bundled=resources/'engine';bundled.mkdir()
  for name in engine_files:
   shutil.copy2(engine/name,bundled/name)
  shutil.copytree(engine/'node_modules',bundled/'node_modules')
  info={'CFBundleName':'GODL Monitor','CFBundleDisplayName':'GODL','CFBundleIdentifier':'dev.godl.personal.monitor',
   'CFBundleExecutable':'GODLMonitor','CFBundlePackageType':'APPL','CFBundleShortVersionString':'0.2.5',
   'CFBundleVersion':'7','LSMinimumSystemVersion':'14.0','LSUIElement':True,'NSHighResolutionCapable':True,
   'NSPrincipalClass':'NSApplication','CFBundleIconFile':'GODL'}
  with (app/'Contents'/'Info.plist').open('wb') as f: plistlib.dump(info,f)
  # Remove only non-security build metadata. Quarantine/security attributes remain.
  for attribute in ['com.apple.FinderInfo','com.apple.ResourceFork']:
   subprocess.run(['xattr','-r','-d',attribute,str(app)],capture_output=True)
  subprocess.run(['codesign','--force','--sign','-',str(helpers/'node')],check=True)
  provenance=json.loads((node_runtime/'.godl-node-runtime.json').read_text())
  provenance['bundledNodeSha256']=sha256(helpers/'node')
  provenance['bundledSigning']='ad-hoc'
  (runtime_resources/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
  subprocess.run(['codesign','--force','--sign','-',str(app)],check=True)
  subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
  (root/'dist').mkdir(exist_ok=True)
  archive=root/'dist'/'GODL-Monitor-local.zip'
  temporary=root/'dist'/'GODL-Monitor-local.pending.zip'
  subprocess.run(['ditto','-c','-k','--keepParent',str(app),str(temporary)],check=True)
  temporary.replace(archive)
  print(archive)
  if args.install:
   installed.parent.mkdir(exist_ok=True)
   shutil.copytree(app,installed)
   subprocess.run(['codesign','--verify','--deep','--strict',str(installed)],check=True)
   print(installed)
