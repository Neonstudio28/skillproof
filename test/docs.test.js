import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rules } from '../src/rules/index.js';

const RULES_DOC = new URL('../docs/rules.md', import.meta.url);
const SCHEMA = new URL('../docs/skillproof.schema.json', import.meta.url);
const README = new URL('../README.md', import.meta.url);

test('docs/rules.md documents every rule exactly once', () => {
  const text = fs.readFileSync(RULES_DOC, 'utf8');
  for (const rule of rules) {
    const rows = text.match(new RegExp(`^\\| \`${rule.id}\` \\|`, 'gm')) ?? [];
    assert.equal(rows.length, 1, `docs/rules.md should document ${rule.id} exactly once`);
  }
});

test('docs/rules.md stays within the four documented rule categories', () => {
  const text = fs.readFileSync(RULES_DOC, 'utf8');
  const rows = [...text.matchAll(/^\| `([a-z0-9-]+)` \| (?:error|warning|info) \|/gm)].map((match) => match[1]);
  assert.deepEqual(new Set(rows), new Set(rules.map((rule) => rule.id)));
});

test('the JSON Schema rule list matches the implementation', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
  const documented = new Set(schema.properties.rules.propertyNames.enum);
  assert.deepEqual(documented, new Set(rules.map((rule) => rule.id)));
});

test('README states the current rule total', () => {
  const text = fs.readFileSync(README, 'utf8');
  const categoryCounts = [...text.matchAll(/^\| (?:Metadata|Content|References|Security) \| (\d+) \|/gm)]
    .map((match) => Number(match[1]));
  assert.deepEqual(categoryCounts, [14, 6, 4, 6]);
  assert.equal(categoryCounts.reduce((total, count) => total + count, 0), rules.length);
});
