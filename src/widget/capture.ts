import { toJpeg } from 'html-to-image';
import type { FeedbackMetadata } from './types';

const bufferedErrors: string[] = [];
let captureInstalled = false;

export function installConsoleCapture(): void {
  if (captureInstalled) return;
  captureInstalled = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    bufferedErrors.push(args.map(String).join(' '));
    original(...args);
  };
}

export function getConsoleErrors(): string[] {
  return [...bufferedErrors];
}

function parseBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Unknown';
}

function parseOS(ua: string): string {
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

export function captureMetadata(): FeedbackMetadata {
  const ua = navigator.userAgent;
  return {
    url: window.location.href,
    browser: parseBrowser(ua),
    os: parseOS(ua),
    consoleErrors: getConsoleErrors(),
  };
}

export async function captureScreenshot(): Promise<string | null> {
  try {
    const { clientWidth } = document.documentElement;
    const { scrollHeight } = document.body;

    const main = document.querySelector('main') as HTMLElement | null;
    const flex1 = main?.parentElement as HTMLElement | null;
    if (main && flex1) {
      const cs = (el: HTMLElement) => window.getComputedStyle(el);
      console.log('[FeedbackWidget] layout debug:', {
        flex1Width: cs(flex1).width,
        mainWidth: cs(main).width,
        mainMarginLeft: cs(main).marginLeft,
        mainMarginRight: cs(main).marginRight,
        mainBCR: main.getBoundingClientRect(),
      });
    }

    return await toJpeg(document.body, {
      quality: 0.8,
      pixelRatio: 1,
      width: clientWidth,
      height: scrollHeight,
      // overflow-x: hidden on body causes SVG foreignObject to constrain
      // content width; override to visible so centering works correctly
      style: { overflowX: 'visible' },
      filter: (node) =>
        !(node instanceof Element && node.id?.startsWith('fw-')),
    });
  } catch (err) {
    console.error('[FeedbackWidget] screenshot capture failed:', err);
    return null;
  }
}
