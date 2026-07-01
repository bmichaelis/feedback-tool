// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('html-to-image', () => ({
  toJpeg: vi.fn().mockResolvedValue('data:image/jpeg;base64,fakeshot'),
}));

beforeEach(() => {
  vi.resetModules();
});

describe('installConsoleCapture + getConsoleErrors', () => {
  it('buffers console.error calls after install', async () => {
    const { installConsoleCapture, getConsoleErrors } = await import('@/widget/capture');
    installConsoleCapture();
    console.error('first error');
    console.error('second error');
    expect(getConsoleErrors()).toContain('first error');
    expect(getConsoleErrors()).toContain('second error');
  });

  it('still calls original console.error', async () => {
    const original = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { installConsoleCapture } = await import('@/widget/capture');
    installConsoleCapture();
    console.error('test');
    expect(original).toHaveBeenCalled();
    original.mockRestore();
  });

  it('is idempotent — calling twice does not double-wrap', async () => {
    const { installConsoleCapture, getConsoleErrors } = await import('@/widget/capture');
    installConsoleCapture();
    installConsoleCapture();
    console.error('once');
    expect(getConsoleErrors().filter((e) => e === 'once').length).toBe(1);
  });
});

describe('captureMetadata', () => {
  it('includes current URL', async () => {
    const { installConsoleCapture, captureMetadata } = await import('@/widget/capture');
    installConsoleCapture();
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.com/page?q=1' },
      writable: true,
    });
    const meta = captureMetadata();
    expect(meta.url).toBe('https://example.com/page?q=1');
  });

  it('parses Chrome on macOS from UA string', async () => {
    const { installConsoleCapture, captureMetadata } = await import('@/widget/capture');
    installConsoleCapture();
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      configurable: true,
    });
    const meta = captureMetadata();
    expect(meta.browser).toContain('Chrome');
    expect(meta.os).toContain('macOS');
  });

  it('includes buffered console errors', async () => {
    const { installConsoleCapture, captureMetadata } = await import('@/widget/capture');
    installConsoleCapture();
    console.error('async error occurred');
    const meta = captureMetadata();
    expect(meta.consoleErrors).toContain('async error occurred');
  });
});

describe('captureScreenshot', () => {
  it('returns a base64 data URL on success', async () => {
    const { captureScreenshot } = await import('@/widget/capture');
    const result = await captureScreenshot();
    expect(result).toBe('data:image/jpeg;base64,fakeshot');
  });

  it('returns null when toJpeg throws', async () => {
    vi.doMock('html-to-image', () => ({
      toJpeg: vi.fn().mockRejectedValue(new Error('canvas fail')),
    }));
    vi.resetModules();
    const { captureScreenshot } = await import('@/widget/capture');
    const result = await captureScreenshot();
    expect(result).toBeNull();
  });
});
