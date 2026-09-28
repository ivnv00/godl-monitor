import { parseArgs } from 'node:util';
import { AccountingImportError, importAccountingAnchor, inspectAccountingAnchor } from './accounting-import.mjs';

const output = value => process.stdout.write(`${JSON.stringify(value)}\n`);

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    mode: { type: 'string' },
    wallet: { type: 'string' },
    input: { type: 'string' },
    profile: { type: 'string' },
    'expected-sha256': { type: 'string' },
    reviewed: { type: 'boolean' },
  } });
  if (positionals.length || !['inspect', 'import'].includes(values.mode)
      || !values.wallet || !values.input
      || (values.mode === 'inspect' && (values.profile || values['expected-sha256'] || values.reviewed))
      || (values.mode === 'import' && (!values.profile || !values['expected-sha256']))) {
    throw new Error('invalid request');
  }
  const review = values.mode === 'inspect'
    ? await inspectAccountingAnchor({ wallet: values.wallet, inputPath: values.input })
    : await importAccountingAnchor({ wallet: values.wallet, inputPath: values.input,
      profilePath: values.profile, expectedSha256: values['expected-sha256'], reviewed: values.reviewed === true });
  output({ schemaVersion: 1, status: values.mode === 'inspect' ? 'review' : 'imported', review });
} catch (error) {
  const message = error instanceof AccountingImportError
    ? error.message : 'The reviewed accounting anchor could not be processed.';
  output({ schemaVersion: 1, status: 'error', message });
  process.exitCode = 1;
}
