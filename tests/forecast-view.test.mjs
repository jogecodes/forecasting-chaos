import test from 'node:test';
import assert from 'node:assert/strict';
import { revealedDiagnosticMarkers } from '../src/forecast-view.js';

test('diagnostic markers appear at their own times and disappear on rewind', () => {
  const events = { onset: 5.96, confirmation: 7 };
  assert.deepEqual(revealedDiagnosticMarkers(events, 0, 28), []);
  assert.deepEqual(revealedDiagnosticMarkers(events, 5.95, 28), []);
  const onset = revealedDiagnosticMarkers(events, 5.96, 28);
  assert.equal(onset.length, 1);assert.deepEqual(onset[0].dash, []);
  assert.equal(revealedDiagnosticMarkers(events, 6.99, 28).length, 1);
  const confirmed = revealedDiagnosticMarkers(events, 7, 28);
  assert.equal(confirmed.length, 2);assert.deepEqual(confirmed[1].dash, [2, 3]);
  assert.deepEqual(revealedDiagnosticMarkers(events, 2, 28), []);
});

test('absent or out-of-window diagnostic events never create markers', () => {
  assert.deepEqual(revealedDiagnosticMarkers({ onset: null, confirmation: null }, 100, 100), []);
  assert.equal(revealedDiagnosticMarkers({ onset: 20, confirmation: 30 }, 100, 25).length, 1);
  assert.deepEqual(revealedDiagnosticMarkers({ onset: undefined, confirmation: NaN }, 100, 100), []);
});
