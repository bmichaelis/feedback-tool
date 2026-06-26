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

/**
 * Chrome's getComputedStyle() reports marginLeft as "0px" for block elements centered
 * via `margin: auto` + `max-width`, even though the browser renders them at the correct
 * visual position. html-to-image reads getComputedStyle to inline styles on cloned
 * elements, so it inlines "0px" and the screenshot shows left-aligned content.
 *
 * Fix: before capture, read the actual BRC offset from the parent and stamp it as an
 * explicit inline margin-left. Restore originals after capture.
 */
function pinBlockMargins(root: HTMLElement): () => void {
  const fixes: Array<{ el: HTMLElement; origML: string }> = [];
  const candidates: Array<{ el: HTMLElement; offset: number }> = [];

  // Batch all reads before writing to avoid layout thrashing
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const parent = el.parentElement;
    if (!parent) return;
    // Only relevant for block containers — flex/grid position children via their own layout
    const parentDisplay = window.getComputedStyle(parent).display;
    if (parentDisplay !== 'block' && parentDisplay !== 'flow-root') return;
    const cs = window.getComputedStyle(el);
    if (cs.position === 'absolute' || cs.position === 'fixed') return;
    if (cs.marginLeft !== '0px') return;
    const offset = Math.round(
      el.getBoundingClientRect().left - parent.getBoundingClientRect().left,
    );
    if (offset > 0) candidates.push({ el, offset });
  });

  // Batch all writes
  candidates.forEach(({ el, offset }) => {
    fixes.push({ el, origML: el.style.marginLeft });
    el.style.marginLeft = `${offset}px`;
  });

  return () => fixes.forEach(({ el, origML }) => { el.style.marginLeft = origML; });
}

export async function captureScreenshot(): Promise<string | null> {
  try {
    const { clientWidth } = document.documentElement;
    const { scrollHeight } = document.body;
    const restore = pinBlockMargins(document.body);
    try {
      return await toJpeg(document.body, {
        quality: 0.8,
        pixelRatio: 1,
        width: clientWidth,
        height: scrollHeight,
        style: { overflowX: 'visible' },
        filter: (node) =>
          !(node instanceof Element && node.id?.startsWith('fw-')),
      });
    } finally {
      restore();
    }
  } catch (err) {
    console.error('[FeedbackWidget] screenshot capture failed:', err);
    return null;
  }
}
