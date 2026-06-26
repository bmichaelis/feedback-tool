import type { FeedbackPayload } from './types';

export async function submitFeedback(
  endpoint: string,
  payload: FeedbackPayload
): Promise<{ issueUrl: string }> {
  const res = await fetch(`${endpoint}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}
