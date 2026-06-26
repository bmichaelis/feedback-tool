import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateIssue = vi.fn();
const mockUploadScreenshot = vi.fn();

vi.mock('@/lib/github', () => ({ createIssue: mockCreateIssue }));
vi.mock('@/lib/storage', () => ({ uploadScreenshot: mockUploadScreenshot }));

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  apiKey: 'key_valid',
  type: 'bug',
  title: 'Test bug',
  description: 'Something broke',
  user: { id: 'u1', email: 'a@b.com' },
  metadata: {
    url: 'https://x.com',
    browser: 'Chrome',
    os: 'macOS',
    consoleErrors: [],
  },
  screenshot: null,
};

beforeEach(() => {
  vi.stubEnv('WIDGET_API_KEYS', 'key_valid:org/repo,key_other:org/other');
  mockCreateIssue.mockResolvedValue('https://github.com/org/repo/issues/1');
  mockUploadScreenshot.mockResolvedValue('https://blob.vercel.app/shot.png');
  vi.resetModules();
});

describe('POST /api/feedback', () => {
  it('returns 401 when apiKey is invalid', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    const res = await POST(makeRequest({ ...validPayload, apiKey: 'bad_key' }) as any);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('returns 400 when required field title is missing', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    const { title, ...rest } = validPayload;
    const res = await POST(makeRequest(rest) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when type is not bug or feature', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    const res = await POST(makeRequest({ ...validPayload, type: 'complaint' }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 200 with issueUrl on valid payload', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    const res = await POST(makeRequest(validPayload) as any);
    expect(res.status).toBe(200);
    expect((await res.json()).issueUrl).toBe('https://github.com/org/repo/issues/1');
  });

  it('resolves repo from apiKey server-side and passes it to createIssue', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    await POST(makeRequest(validPayload) as any);
    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({ repo: 'org/repo' })
    );
  });

  it('uploads screenshot and passes URL to createIssue when screenshot provided', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    await POST(makeRequest({ ...validPayload, screenshot: 'data:image/png;base64,abc' }) as any);
    expect(mockUploadScreenshot).toHaveBeenCalledWith('data:image/png;base64,abc');
    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({ repo: 'org/repo', screenshotUrl: 'https://blob.vercel.app/shot.png' })
    );
  });

  it('passes screenshotUrl: null to createIssue when screenshot field is null', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    await POST(makeRequest(validPayload) as any);
    expect(mockUploadScreenshot).not.toHaveBeenCalled();
    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({ screenshotUrl: null })
    );
  });

  it('proceeds without screenshot when blob upload fails', async () => {
    mockUploadScreenshot.mockRejectedValue(new Error('Blob error'));
    const { POST } = await import('@/app/api/feedback/route');
    const res = await POST(
      makeRequest({ ...validPayload, screenshot: 'data:image/png;base64,abc' }) as any
    );
    expect(res.status).toBe(200);
    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({ screenshotUrl: null })
    );
  });

  it('returns 500 when GitHub API fails', async () => {
    mockCreateIssue.mockRejectedValue(new Error('GitHub error'));
    const { POST } = await import('@/app/api/feedback/route');
    const res = await POST(makeRequest(validPayload) as any);
    expect(res.status).toBe(500);
  });

  it('OPTIONS returns 204 with CORS headers', async () => {
    const { OPTIONS } = await import('@/app/api/feedback/route');
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('returns 400 when metadata fields are missing', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    const badPayload = { ...validPayload, metadata: { url: 'https://x.com' } }; // missing browser/os/consoleErrors
    const res = await POST(makeRequest(badPayload) as any);
    expect(res.status).toBe(400);
  });
});
