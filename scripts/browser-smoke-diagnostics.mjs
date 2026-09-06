const SENSITIVE_VALUE = /(authorization|cookie|set-cookie|password|secret|token|csrf|session)\s*([:=])\s*([^\s,;}]+)/gi;
const SENSITIVE_QUERY = /([?&](?:authorization|cookie|password|secret|token|csrf|session|code)=)[^&\s]+/gi;
const BEARER = /\b(Bearer)\s+[^\s,;}]+/gi;

/** Keep CI diagnostics useful without ever echoing credentials. */
export function redactDiagnosticText(value, maxLength = 240) {
  return String(value ?? '')
    .replace(BEARER, '$1 [redacted]')
    .replace(SENSITIVE_QUERY, '$1[redacted]')
    .replace(SENSITIVE_VALUE, '$1$2[redacted]')
    .slice(0, maxLength);
}

/**
 * Movement may wait for the existing RealtimeClient reconnect budget, but a
 * missing controller/runtime is a terminal smoke setup error rather than a
 * reason to skip the authority gate.
 */
export function classifyBrowserMovementSample(sample) {
  if (!sample || typeof sample !== 'object') return { state: 'terminal', reason: 'invalid-page-sample' };
  if (sample.controllerPresent !== true) return { state: 'terminal', reason: 'controller-missing' };
  if (sample.realtimePresent !== true) return { state: 'terminal', reason: 'realtime-client-missing' };
  if (sample.realtimeConnected !== true || sample.sendAccepted === false) {
    return { state: 'retry', reason: sample.sendAccepted === false ? 'move-send-not-ready' : 'realtime-reconnecting' };
  }
  return { state: 'ready', reason: null };
}
