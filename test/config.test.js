import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONFIG_FILENAME,
  ConfigError,
  defaultConfig,
  loadConfig,
  validateConfig,
} from '../src/config.js';
import { tempDir, writeFile } from './helpers.js';

test('defaults are returned when no config exists', (t) => {
  const root = tempDir(t);
  assert.deepEqual(loadConfig({ cwd: root }), defaultConfig());
});

test('loads a config file from the invocation directory', (t) => {
  const root = tempDir(t);
  writeFile(root, CONFIG_FILENAME, JSON.stringify({
    $schema: 'https://example.com/schema.json',
    exclude: ['fixtures/'],
    rules: { 'name-format': 'off', 'body-empty': 'error' },
    strict: true,
    minScore: 80,
    maxWarnings: 2,
  }));

  assert.deepEqual(loadConfig({ cwd: root }), {
    exclude: ['fixtures/'],
    rules: { 'name-format': 'off', 'body-empty': 'error' },
    strict: true,
    minScore: 80,
    maxWarnings: 2,
  });
});

test('loads an explicit config path', (t) => {
  const root = tempDir(t);
  writeFile(root, 'configs/custom.json', JSON.stringify({ strict: true }));
  assert.deepEqual(loadConfig({ cwd: root, configPath: 'configs/custom.json' }), {
    ...defaultConfig(),
    strict: true,
  });
});

test('a missing explicit config is an error', (t) => {
  const root = tempDir(t);
  assert.throws(() => loadConfig({ cwd: root, configPath: 'missing.json' }), /Config file not found/);
});

test('invalid JSON is an error', (t) => {
  const root = tempDir(t);
  writeFile(root, CONFIG_FILENAME, '{ nope');
  assert.throws(() => loadConfig({ cwd: root }), /Invalid JSON/);
});

test('unknown options are rejected', () => {
  assert.throws(() => validateConfig({ strict: true, typo: 1 }), /unknown option "typo"/);
});

test('unknown rules are rejected', () => {
  assert.throws(() => validateConfig({ rules: { 'not-a-rule': 'off' } }), /unknown rule/);
});

test('invalid severities are rejected', () => {
  assert.throws(() => validateConfig({ rules: { 'name-format': 'fatal' } }), /severity/);
});

test('invalid scalar options are rejected', () => {
  assert.throws(() => validateConfig({ strict: 'yes' }), /strict/);
  assert.throws(() => validateConfig({ minScore: 101 }), /minScore/);
  assert.throws(() => validateConfig({ minScore: -1 }), /minScore/);
  assert.throws(() => validateConfig({ maxWarnings: 1.5 }), /maxWarnings/);
  assert.throws(() => validateConfig({ maxWarnings: -1 }), /maxWarnings/);
  assert.throws(() => validateConfig({ exclude: 'test' }), /exclude/);
  assert.throws(() => validateConfig({ rules: [] }), /rules/);
  assert.throws(() => validateConfig([]), /JSON object/);
});

test('null maxWarnings is accepted', () => {
  assert.doesNotThrow(() => validateConfig({ maxWarnings: null }));
});

test('defaultConfig returns a fresh object', () => {
  const first = defaultConfig();
  first.exclude.push('x');
  first.rules['name-format'] = 'off';
  const second = defaultConfig();
  assert.deepEqual(second.exclude, []);
  assert.deepEqual(second.rules, {});
});
