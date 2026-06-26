// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeedbackPayload } from '@/widget/types';

const payload: FeedbackPayload = {
  apiKey: 'key_abc',
  repo: 'org/repo',
  type: 'bug',
  title: 'Test',
  description: 'Desc',
  user: { id: 'u1', email: 'a@b.com' },
  metadata: { url: 'https://x.com', browser: 'Chrome', os: 'macOS', consoleErrors: [] },
  screenshot: null,
};

beforeEach(() => {
  vi.resetModules();
  global.fetch = vi.fn();
});

describe('submitFeedback', () => {
  it('POSTs JSON to {endpoint}/api/feedback', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ issueUrl: 'https://github.com/org/repo/issues/1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const { submitFeedback } = await import('@/widget/api');
    await submitFeedback('https://feedback-tool.vercel.app', payload);
    expect(fetch).toHaveBeenCalledWith(
      'https://feedback-tool.vercel.app/api/feedback',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })
    );
  });

  it('returns issueUrl on success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ issueUrl: 'https://github.com/org/repo/issues/1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const { submitFeedback } = await import('@/widget/api');
    const result = await submitFeedback('https://feedback-tool.vercel.app', payload);
    expect(result.issueUrl).toBe('https://github.com/org/repo/issues/1');
  });

  it('throws with server error message on 401', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const { submitFeedback } = await import('@/widget/api');
    await expect(
      submitFeedback('https://feedback-tool.vercel.app', payload)
    ).rejects.toThrow('Unauthorized');
  });

  it('throws "HTTP 500" when response is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    );
    const { submitFeedback } = await import('@/widget/api');
    await expect(
      submitFeedback('https://feedback-tool.vercel.app', payload)
    ).rejects.toThrow('HTTP 500');
  });
});
