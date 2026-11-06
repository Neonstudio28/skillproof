import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeFor, scoreFindings, summarize } from '../src/score.js';

test('grade boundaries', () => {
  assert.equal(gradeFor(100), 'A');
  assert.equal(gradeFor(90), 'A');
  assert.equal(gradeFor(89), 'B');
  assert.equal(gradeFor(80), 'B');
  assert.equal(gradeFor(79), 'C');
  assert.equal(gradeFor(70), 'C');
  assert.equal(gradeFor(69), 'D');
  assert.equal(gradeFor(60), 'D');
  assert.equal(gradeFor(59), 'F');
  assert.equal(gradeFor(0), 'F');
});

test('scoreFindings starts at 100 and subtracts weights', () => {
  assert.deepEqual(scoreFindings([]), { score: 100, grade: 'A' });
  assert.deepEqual(scoreFindings([{ severity: 'warning' }]), { score: 95, grade: 'A' });
  assert.deepEqual(scoreFindings([{ severity: 'error' }]), { score: 85, grade: 'B' });
  assert.deepEqual(scoreFindings([{ severity: 'info' }]), { score: 100, grade: 'A' });
  assert.deepEqual(scoreFindings([{ severity: 'error' }, { severity: 'error' }]), { score: 70, grade: 'C' });
});

test('scoreFindings clamps at zero', () => {
  const errors = Array.from({ length: 20 }, () => ({ severity: 'error' }));
  assert.deepEqual(scoreFindings(errors), { score: 0, grade: 'F' });
});

test('summarize aggregates counts and averages scores', () => {
  const summary = summarize([
    { score: 100, summary: { errors: 0, warnings: 0, info: 0 } },
    { score: 80, summary: { errors: 1, warnings: 1, info: 0 } },
  ]);
  assert.deepEqual(summary, {
    skills: 2,
    errors: 1,
    warnings: 1,
    info: 0,
    score: 90,
    grade: 'A',
  });
});

test('summarize handles zero skills', () => {
  assert.deepEqual(summarize([]), {
    skills: 0,
    errors: 0,
    warnings: 0,
    info: 0,
    score: 100,
    grade: 'A',
  });
});
