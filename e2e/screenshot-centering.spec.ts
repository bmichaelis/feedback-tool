/**
 * End-to-end tests for widget screenshot centering.
 *
 * Covers the Chrome getComputedStyle quirk where marginLeft is reported as "0px"
 * for block elements centered via `margin: auto` + `max-width`, even though the
 * browser renders them at the correct visual position. The widget's pinBlockMargins()
 * fix reads BRC offsets before capture to stamp explicit pixel margins.
 *
 * Test layout (centering-page.html):
 *   Viewport 1200px wide, main max-width 600px → 300px margins each side.
 *   Blue content block inside main spans x=320..880 at y≈104.
 *
 * Sample points (y=150, well inside the blue block):
 *   x=50   → should be white  (body background, left margin zone)
 *   x=600  → should be blue   (inside centered content block)
 *   x=1150 → should be white  (body background, right margin zone)
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WIDGET_BUNDLE = path.resolve(__dirname, '../public/widget/feedback-widget.js');
const FIXTURE_HTML = fs.readFileSync(
  path.resolve(__dirname, 'fixtures/centering-page.html'),
  'utf8',
);
const FAKE_ENDPOINT = 'http://localhost:9999';

/**
 * Load a page with the widget injected, intercept the API call, submit a
 * feedback form, and return the screenshot data URL from the intercepted body.
 */
async function captureScreenshotFromWidget(page: Page, html: string): Promise<string> {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: WIDGET_BUNDLE });

  let screenshotDataUrl = '';
  await page.route(`${FAKE_ENDPOINT}/api/feedback`, async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      screenshot?: string;
    };
    screenshotDataUrl = body.screenshot ?? '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ issueUrl: 'https://github.com/test/issues/1' }),
    });
  });

  await page.evaluate((endpoint: string) => {
    (window as unknown as { FeedbackWidget: { init(c: object): void } }).FeedbackWidget.init({
      apiKey: 'test-key',
      endpoint,
    });
  }, FAKE_ENDPOINT);

  await page.click('#fw-button');
  await page.fill('#fw-title', 'Test');
  await page.fill('#fw-description', 'Centering check');
  await page.click('#fw-submit');
  await page.waitForSelector('#fw-success', { timeout: 15_000 });

  return screenshotDataUrl;
}

type RGBA = [number, number, number, number];

interface PixelSample {
  left: RGBA;   // x=50,  y=sampleY — should be white (background)
  center: RGBA; // x=600, y=sampleY — should be blue (content)
  right: RGBA;  // x=1150, y=sampleY — should be white (background)
  imageSize: { w: number; h: number };
}

/**
 * Decode the JPEG data URL in the browser with Canvas and read pixel values
 * at the three sample points.
 */
async function samplePixels(page: Page, dataUrl: string, sampleY: number): Promise<PixelSample> {
  return page.evaluate(
    async ({ dataUrl, sampleY }: { dataUrl: string; sampleY: number }) => {
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('image failed to load'));
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const px = (x: number, y: number) =>
        Array.from(ctx.getImageData(x, y, 1, 1).data) as [number, number, number, number];

      return {
        left: px(50, sampleY),
        center: px(600, sampleY),
        right: px(1150, sampleY),
        imageSize: { w: canvas.width, h: canvas.height },
      };
    },
    { dataUrl, sampleY },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Widget screenshot centering', () => {
  test('block mx-auto max-width element is centered, not left-aligned', async ({ page }) => {
    const dataUrl = await captureScreenshotFromWidget(page, FIXTURE_HTML);

    expect(dataUrl, 'screenshot should be present in API payload').toBeTruthy();

    // Save to test-results for visual inspection
    const outPath = path.resolve(__dirname, 'test-results/centering-test.jpg');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));

    // y=150: 64px header + 40px main padding + 46px into the blue content block
    const pixels = await samplePixels(page, dataUrl, 150);

    expect(
      pixels.imageSize.w,
      'screenshot width should match viewport',
    ).toBe(1200);

    // Left margin zone (x=50) — should be white background
    // White: all channels ≥ 200 after JPEG compression
    expect(pixels.left[0]).toBeGreaterThan(200); // R
    expect(pixels.left[1]).toBeGreaterThan(200); // G
    expect(pixels.left[2]).toBeGreaterThan(200); // B

    // Center (x=600) — should be inside the blue content block (#2563eb)
    // Blue: B channel high, R channel low, well away from any JPEG boundary artifact
    expect(pixels.center[2]).toBeGreaterThan(150); // B
    expect(pixels.center[0]).toBeLessThan(100);    // R

    // Right margin zone (x=1150) — should be white background
    expect(pixels.right[0]).toBeGreaterThan(200); // R
    expect(pixels.right[1]).toBeGreaterThan(200); // G
    expect(pixels.right[2]).toBeGreaterThan(200); // B
  });

  test('widget UI elements are excluded from screenshot', async ({ page }) => {
    const dataUrl = await captureScreenshotFromWidget(page, FIXTURE_HTML);

    // The feedback button is fixed at bottom-right (x≈1148, y≈748 in a 1200×800 view).
    // It should NOT appear in the screenshot (filtered by fw- id prefix).
    // Blue button color: close to #0070f3 (r=0, g=112, b=243).
    // At those coords, the screenshot should show white page background, not button blue.
    const buttonY = 760; // near bottom of 800px viewport
    const pixels = await samplePixels(page, dataUrl, buttonY);

    // At y=760, x=600 (center), expect white or near-white — not button blue
    const centerAtBottom = pixels.center;
    const isButtonBlue = centerAtBottom[2] > 200 && centerAtBottom[0] < 50;
    expect(isButtonBlue, 'feedback button should not appear in screenshot').toBe(false);
  });
});

/**
 * Tip: to add a test against the real deployed simple-vid /projects page:
 *
 *   test('real /projects page is centered', async ({ page }) => {
 *     await page.goto('https://simple-vid.kindacoach.com/projects');
 *     await page.addScriptTag({ path: WIDGET_BUNDLE });
 *     // then follow the same captureScreenshotFromWidget pattern, adjusting
 *     // max-width and viewport to match the real site's values.
 *   });
 */
