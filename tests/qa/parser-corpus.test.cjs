const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const start = html.indexOf('function sanitizeInput');
const end = html.indexOf('// ===== Render =====');
if (start < 0 || end < 0 || end <= start) throw new Error('Could not isolate deployed parser functions.');
const context = { console, Math, Number, String, Array, Object, RegExp, Set };
vm.createContext(context);
vm.runInContext(html.slice(start, end), context, { filename: 'index.html#parser' });

const corpus = [
  { id: 'plain-integer', token: '1234', expected: 1234, actual: 1234, rule: 'accept' },
  { id: 'us-commas', token: '1,234,567', expected: 1234567, actual: 1234567, rule: 'accept-valid-groups' },
  { id: 'spaces', token: '1 234 567', expected: 1234567, actual: 1234567, rule: 'accept-valid-groups' },
  { id: 'eu-dots', token: '1.234.567', expected: 1234567, actual: 1234567, rule: 'accept-valid-groups' },
  { id: 'eu-decimal-comma', token: '1.234,5', expected: null, actual: null, rule: 'reject-ambiguous' },
  { id: 'suffix-k-lower', token: '1.5k', expected: 1500, actual: 1500, rule: 'accept-suffix' },
  { id: 'suffix-K-upper', token: '2K', expected: 2000, actual: 2000, rule: 'accept-suffix-case-insensitive' },
  { id: 'suffix-m', token: '2m', expected: 2000000, actual: 2000000, rule: 'accept-suffix' },
  { id: 'suffix-b', token: '3b', expected: 3000000000, actual: 3000000000, rule: 'accept-suffix' },
  { id: 'suffix-t', token: '4t', expected: 4000000000000, actual: 4000000000000, rule: 'accept-suffix' },
  { id: 'malformed-suffix', token: '12abc', expected: null, actual: null, rule: 'reject-trailing-text' },
  { id: 'mixed-separators', token: '1,234.56', expected: null, actual: null, rule: 'reject-mixed' },
  { id: 'invalid-token', token: 'abc', expected: null, actual: null, rule: 'reject' },
  { id: 'zero', token: '0', expected: 0, actual: 0, rule: 'accept' },
  {
    id: 'unsafe-huge',
    token: '9999999999999999',
    expected: null,
    actual: null,
    rule: 'reject-above-safe-or-business-limit',
  },
];

function parseThroughStatRegex(token) {
  return context.parseSpyResult(
    `Name: Corpus [123456]\nLevel: 1\nStrength: ${token}\nSpeed: 1\nDexterity: 1\nDefense: 1`,
  ).strength;
}

test('parser regression corpus captures all current values', () => {
  for (const item of corpus) {
    assert.equal(parseThroughStatRegex(item.token), item.actual, item.id);
  }
});

test('normal four-stat total is independently correct', () => {
  const result = context.parseSpyResult(
    'Name: Total [123456]\nLevel: 10\nStrength: 100\nSpeed: 200\nDexterity: 300\nDefense: 400\nTotal: 990',
  );
  assert.equal(result.total, 1000);
  assert.ok(result.warnings.some(value => value.includes('did not match')));
});

test('partial 3-of-4 plus total infers the missing stat without warning', () => {
  const result = context.parseSpyResult(
    'Name: Partial [123456]\nLevel: 10\nStrength: 100\nSpeed: 200\nDefense: 400\nTotal: 1000',
  );
  assert.equal(result.dexterity, 300);
  assert.equal(result.warnings.length, 0);
});

test('corpus matches the explicit parser rules', () => {
  const mismatches = corpus.filter(item => item.actual !== item.expected);
  assert.deepEqual(mismatches, []);
});

module.exports = { corpus };
