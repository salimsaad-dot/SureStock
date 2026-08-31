// Africa's Talking SMS REST API — chosen over Twilio for this project's
// Ghana-shop context (cheaper local delivery, and a real sandbox tier that
// needs no funded account to test against). A hand-rolled fetch call
// rather than the `africastalking` npm package: their whole API is one
// form-encoded POST, so a real dependency buys nothing here that a dozen
// lines of fetch don't already cover — same "no new dependency" bar as
// the load-test script and CSV exports elsewhere in this codebase.
//
// Deliberately never throws. A notification is always a side effect of
// some other real action (a sale, a till close) — a provider outage or a
// missing API key must never fail the thing that triggered it.

export interface SendSmsResult {
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED';
  providerResponse?: string;
}

function credentials() {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME || 'sandbox';
  const senderId = process.env.AFRICASTALKING_SENDER_ID;
  return { apiKey, username, senderId };
}

function endpoint(username: string): string {
  return username === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';
}

/**
 * Provider-ready, credentials wired later: with no AFRICASTALKING_API_KEY
 * set, this makes no network call at all and reports NOT_CONFIGURED —
 * every trigger path, log entry, and UI state around it is real and
 * testable today; dropping a real key into .env is the only remaining
 * step to make delivery real.
 */
export async function sendSms(to: string, message: string): Promise<SendSmsResult> {
  const { apiKey, username, senderId } = credentials();
  if (!apiKey) return { status: 'NOT_CONFIGURED' };

  const body = new URLSearchParams({ username, to, message });
  if (senderId) body.set('from', senderId);

  try {
    const res = await fetch(endpoint(username), {
      method: 'POST',
      headers: {
        apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    const text = await res.text();
    return { status: res.ok ? 'SENT' : 'FAILED', providerResponse: text.slice(0, 2000) };
  } catch (err) {
    return { status: 'FAILED', providerResponse: err instanceof Error ? err.message : String(err) };
  }
}
