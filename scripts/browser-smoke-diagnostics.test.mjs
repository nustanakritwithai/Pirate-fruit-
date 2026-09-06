import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyBrowserMovementSample,
  redactDiagnosticText,
} from './browser-smoke-diagnostics.mjs';

test('diagnostic redaction removes headers, query credentials and bearer values', () => {
  const raw = 'authorization: Bearer abc cookie=session=topsecret https://example.test/x?token=abc&code=xyz password=hunter2';
  const safe = redactDiagnosticText(raw);
  assert.doesNotMatch(safe, /abc|topsecret|xyz|hunter2/);
  assert.match(safe, /\[redacted\]/);
});

test('movement classification retries only a transient realtime disconnect', () => {
  assert.deepEqual(classifyBrowserMovementSample({
    controllerPresent: true, realtimePresent: true, realtimeConnected: false,
  }), { state: 'retry', reason: 'realtime-reconnecting' });
  assert.deepEqual(classifyBrowserMovementSample({
    controllerPresent: true, realtimePresent: true, realtimeConnected: true, sendAccepted: false,
  }), { state: 'retry', reason: 'move-send-not-ready' });
  assert.deepEqual(classifyBrowserMovementSample({
    controllerPresent: false, realtimePresent: true, realtimeConnected: true,
  }), { state: 'terminal', reason: 'controller-missing' });
  assert.deepEqual(classifyBrowserMovementSample({
    controllerPresent: true, realtimePresent: true, realtimeConnected: true, sendAccepted: true,
  }), { state: 'ready', reason: null });
});
