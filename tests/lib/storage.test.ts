import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPut = vi.fn();

vi.mock('@vercel/blob', () => ({
  put: mockPut,
}));

beforeEach(() => {
  vi.resetModules();
  mockPut.mockResolvedValue({ url: 'https://blob.vercel.app/screenshots/123.png' });
});

describe('uploadScreenshot', () => {
  it('returns the public blob URL', async () => {
    const { uploadScreenshot } = await import('@/lib/storage');
    const url = await uploadScreenshot('data:image/png;base64,abc123');
    expect(url).toBe('https://blob.vercel.app/screenshots/123.png');
  });

  it('strips the data URL prefix before uploading', async () => {
    const { uploadScreenshot } = await import('@/lib/storage');
    await uploadScreenshot('data:image/png;base64,dGVzdA==');
    const [, buffer] = mockPut.mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('base64')).toBe('dGVzdA==');
  });

  it('uploads with public access and png content type', async () => {
    const { uploadScreenshot } = await import('@/lib/storage');
    await uploadScreenshot('data:image/png;base64,abc123');
    const [, , options] = mockPut.mock.calls[0];
    expect(options.access).toBe('public');
    expect(options.contentType).toBe('image/png');
  });

  it('uses a screenshots/ prefixed timestamped filename', async () => {
    const { uploadScreenshot } = await import('@/lib/storage');
    await uploadScreenshot('data:image/png;base64,abc123');
    const [filename] = mockPut.mock.calls[0];
    expect(filename).toMatch(/^screenshots\/\d+\.png$/);
  });
});
