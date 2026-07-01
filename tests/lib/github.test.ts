import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    issues: { create: mockCreate },
  })),
}));

beforeEach(() => {
  vi.stubEnv('GITHUB_TOKEN', 'test-token');
  mockCreate.mockResolvedValue({
    data: { html_url: 'https://github.com/org/repo/issues/42' },
  });
  vi.resetModules();
});

const baseParams = {
  repo: 'org/repo',
  type: 'bug' as const,
  title: 'Button broken',
  description: 'Nothing happens on click',
  metadata: {
    url: 'https://example.com/page',
    browser: 'Chrome 124',
    os: 'macOS',
    consoleErrors: ['TypeError: null is not an object'],
  },
  user: { id: 'u1', email: 'test@example.com' },
  screenshotUrl: null,
  userScreenshotUrl: null,
};

describe('createIssue', () => {
  it('returns the issue HTML URL', async () => {
    const { createIssue } = await import('@/lib/github');
    const url = await createIssue(baseParams);
    expect(url).toBe('https://github.com/org/repo/issues/42');
  });

  it('prefixes bug title with [Bug] and sets bug label', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue(baseParams);
    const call = mockCreate.mock.calls[0][0];
    expect(call.title).toBe('[Bug] Button broken');
    expect(call.labels).toContain('bug');
  });

  it('prefixes feature title with [Feature] and sets enhancement label', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue({ ...baseParams, type: 'feature' });
    const call = mockCreate.mock.calls[0][0];
    expect(call.title).toBe('[Feature] Button broken');
    expect(call.labels).toContain('enhancement');
  });

  it('splits repo string into owner and repo name', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue(baseParams);
    const call = mockCreate.mock.calls[0][0];
    expect(call.owner).toBe('org');
    expect(call.repo).toBe('repo');
  });

  it('includes description in issue body', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue(baseParams);
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('Nothing happens on click');
  });

  it('includes metadata table with url, browser, os, and user', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue(baseParams);
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('https://example.com/page');
    expect(body).toContain('Chrome 124');
    expect(body).toContain('macOS');
    expect(body).toContain('test@example.com');
  });

  it('includes console errors in body when present', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue(baseParams);
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('TypeError: null is not an object');
  });

  it('omits console errors section when none present', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue({
      ...baseParams,
      metadata: { ...baseParams.metadata, consoleErrors: [] },
    });
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).not.toContain('Console errors');
  });

  it('embeds page screenshot with label when screenshotUrl provided', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue({ ...baseParams, screenshotUrl: 'https://blob.vercel.app/shot.png' });
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('**Page screenshot:**');
    expect(body).toContain('![Page screenshot](https://blob.vercel.app/shot.png)');
  });

  it('embeds user screenshot with label when userScreenshotUrl provided', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue({ ...baseParams, userScreenshotUrl: 'https://blob.vercel.app/attach.png' });
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('**Attached by user:**');
    expect(body).toContain('![User screenshot](https://blob.vercel.app/attach.png)');
  });

  it('embeds both screenshots when both provided', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue({
      ...baseParams,
      screenshotUrl: 'https://blob.vercel.app/page.png',
      userScreenshotUrl: 'https://blob.vercel.app/user.png',
    });
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('**Page screenshot:**');
    expect(body).toContain('**Attached by user:**');
  });

  it('omits screenshot section when both are null', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue(baseParams);
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).not.toContain('![');
  });
});
