const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const parserStart = html.indexOf('function extractTornProfileId');
const parserEnd = html.indexOf('function parseDateValue', parserStart);
const importStart = html.indexOf('function extractImportTargets');
const importEnd = html.indexOf('async function importTargets', importStart);
const validationStart = html.indexOf('function validateTargetImport');
const validationEnd = html.indexOf('function renderImportPreview', validationStart);

if ([parserStart, parserEnd, importStart, importEnd, validationStart, validationEnd].some(index => index < 0)) {
  throw new Error('Could not isolate target import functions.');
}

const context = {
  console,
  Math,
  Number,
  String,
  Array,
  Object,
  RegExp,
  Set,
  state: { tasks: [] },
  qs: () => null,
  getKnownOrderIds: () => [],
  isSubmittedRecently: () => false,
};
vm.createContext(context);
vm.runInContext(
  html.slice(parserStart, parserEnd) + '\n'
    + html.slice(importStart, importEnd) + '\n'
    + html.slice(validationStart, validationEnd),
  context,
  { filename: 'index.html#import-targets' },
);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('imports plain Torn profile URLs without requiring player names', () => {
  const parsed = plain(context.extractImportTargets([
    'https://www.torn.com/profiles.php?XID=2127595',
    'https://www.torn.com/profiles.php?XID=988458',
  ].join('\n')));

  assert.deepEqual(parsed.map(item => [item.targetName, item.targetId]), [
    ['', '2127595'],
    ['', '988458'],
  ]);
});

test('imports Markdown profile links exactly once', () => {
  const parsed = plain(context.extractImportTargets(
    '[https://www.torn.com/profiles.php?XID=1828541](https://www.torn.com/profiles.php?XID=1828541)',
  ));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].targetId, '1828541');
  assert.equal(parsed[0].targetName, '');
});

test('supports raw XIDs, profile URLs, and existing formats in one paste', () => {
  const parsed = plain(context.extractImportTargets([
    '2791298',
    'https://www.torn.com/profiles.php?XID=2130337',
    'Existing Player | 2630958 | customer note | high',
    'Bracket Player [2120956]',
  ].join('\n')));

  assert.deepEqual(parsed.map(item => item.targetId), ['2791298', '2130337', '2630958', '2120956']);
  assert.equal(parsed[2].targetName, 'Existing Player');
  assert.equal(parsed[2].priority, 'high');
});

test('preserves non-numeric URL XIDs so validation can reject them', () => {
  const parsed = plain(context.extractImportTargets('https://www.torn.com/profiles.php?XID=not-a-number'));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].targetId, 'not-a-number');
});

test('deduplicates the same XID across raw, plain URL, and Markdown URL formats', () => {
  const validated = plain(context.validateTargetImport([
    '2127595',
    'https://www.torn.com/profiles.php?XID=2127595',
    '[https://www.torn.com/profiles.php?XID=2127595](https://www.torn.com/profiles.php?XID=2127595)',
  ].join('\n')));

  assert.deepEqual(validated.map(item => item.status), ['New', 'Duplicate', 'Duplicate']);
  assert.equal(validated.filter(item => item.status === 'New').length, 1);
});

test('marks a non-numeric URL XID invalid before import', () => {
  const validated = plain(context.validateTargetImport('https://www.torn.com/profiles.php?XID=not-a-number'));
  assert.equal(validated[0].status, 'Invalid');
});
