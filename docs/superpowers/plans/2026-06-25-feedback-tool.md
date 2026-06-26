# Feedback Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable in-app feedback widget that creates GitHub Issues from bug reports and feature requests, with a Next.js backend proxy holding credentials.

**Architecture:** A Next.js 15 App Router project deployed on Vercel serves two outputs: a proxy API route that validates widget API keys and creates GitHub Issues, and a vanilla JS bundle built by esbuild and served as a CDN static asset from `/public/widget/`. Host apps embed one `<script>` tag and call `FeedbackWidget.init()`.

**Tech Stack:** Next.js 15, TypeScript 5 (strict), esbuild, @octokit/rest, @vercel/blob, html2canvas, Vitest, JSDOM

## Global Constraints

- Node.js 22+
- TypeScript strict mode
- Server code (`src/lib/`, `src/app/api/`) must never import from `src/widget/`
- Widget code (`src/widget/`) must never import Node.js built-ins or server packages
- `src/widget/types.ts` is the one shared import boundary (pure types only, no imports)
- esbuild target: `['chrome90', 'firefox90', 'safari14']`, format: `iife`
- Test globals enabled; default environment: `node`; widget tests override per-file with `// @vitest-environment jsdom`
- TDD: write failing test first, then implement

---

## File Map

| File | Purpose |
|------|---------|
| `src/widget/types.ts` | Shared TypeScript types (no imports) |
| `src/widget/capture.ts` | URL / UA / console-error / screenshot capture |
| `src/widget/api.ts` | POST feedback payload to proxy |
| `src/widget/ui.ts` | Floating button + modal DOM |
| `src/widget/index.ts` | `FeedbackWidget.init()` entry; sets `window.FeedbackWidget` |
| `src/lib/github.ts` | Octokit: format body + create GitHub Issues |
| `src/lib/storage.ts` | Vercel Blob: upload screenshot, return public URL |
| `src/app/api/feedback/route.ts` | Proxy: validate key → upload screenshot → create issue |
| `scripts/build-widget.ts` | esbuild pipeline (run via `tsx`) |
| `scripts/test-page.html` | Manual integration test page |
| `tests/lib/github.test.ts` | Unit tests for GitHub client |
| `tests/lib/storage.test.ts` | Unit tests for Blob storage |
| `tests/api/feedback.test.ts` | Unit tests for proxy route |
| `tests/widget/capture.test.ts` | Unit tests for capture module (jsdom) |
| `tests/widget/api.test.ts` | Unit tests for widget API client (jsdom) |
| `tests/widget/ui.test.ts` | Unit tests for widget UI (jsdom) |
| `.env.example` | Template for required env vars |

---

### Task 1: Project Scaffolding

**Files:**
- Create: entire project via `create-next-app`
- Create: `src/widget/types.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces: `FeedbackType`, `FeedbackUser`, `FeedbackConfig`, `FeedbackMetadata`, `FeedbackPayload` from `src/widget/types.ts`

- [ ] **Step 1: Scaffold Next.js**

```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --yes
```

Expected: Project files created in current directory.

- [ ] **Step 2: Install additional dependencies**

```bash
npm install @octokit/rest @vercel/blob html2canvas
npm install -D vitest @vitest/coverage-v8 jsdom @types/jsdom esbuild tsx
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 4: Add test and build:widget scripts to package.json**

In `package.json`, replace the `scripts` section with:

```json
{
  "scripts": {
    "dev": "npm run build:widget && next dev",
    "build": "npm run build:widget && next build",
    "build:widget": "tsx scripts/build-widget.ts",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p src/widget src/lib tests/lib tests/api tests/widget scripts public/widget
```

- [ ] **Step 6: Add generated widget file to .gitignore**

Append to `.gitignore`:

```
# Generated widget bundle
public/widget/feedback-widget.js
```

- [ ] **Step 7: Create shared types**

Create `src/widget/types.ts`:

```typescript
export type FeedbackType = 'bug' | 'feature';

export interface FeedbackUser {
  id: string;
  email: string;
}

export interface FeedbackConfig {
  apiKey: string;
  repo: string;
  user: FeedbackUser;
  endpoint?: string;
}

export interface FeedbackMetadata {
  url: string;
  browser: string;
  os: string;
  consoleErrors: string[];
}

export interface FeedbackPayload {
  apiKey: string;
  repo: string;
  type: FeedbackType;
  title: string;
  description: string;
  user: FeedbackUser;
  metadata: FeedbackMetadata;
  screenshot: string | null;
}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors (ignore Next.js generated files if any).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with shared widget types"
```

---

### Task 2: GitHub Client

**Files:**
- Create: `src/lib/github.ts`
- Create: `tests/lib/github.test.ts`

**Interfaces:**
- Consumes: `FeedbackType`, `FeedbackUser`, `FeedbackMetadata` from `src/widget/types.ts`
- Produces: `createIssue(params: CreateIssueParams): Promise<string>` — returns GitHub issue HTML URL

- [ ] **Step 1: Write failing tests**

Create `tests/lib/github.test.ts`:

```typescript
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

  it('embeds screenshot image when screenshotUrl provided', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue({ ...baseParams, screenshotUrl: 'https://blob.vercel.app/shot.png' });
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('![Screenshot](https://blob.vercel.app/shot.png)');
  });

  it('omits screenshot section when screenshotUrl is null', async () => {
    const { createIssue } = await import('@/lib/github');
    await createIssue(baseParams);
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).not.toContain('![Screenshot]');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/lib/github.test.ts
```

Expected: FAIL — `@/lib/github` module not found.

- [ ] **Step 3: Implement the GitHub client**

Create `src/lib/github.ts`:

```typescript
import { Octokit } from '@octokit/rest';
import type { FeedbackType, FeedbackUser, FeedbackMetadata } from '@/widget/types';

interface CreateIssueParams {
  repo: string;
  type: FeedbackType;
  title: string;
  description: string;
  metadata: FeedbackMetadata;
  user: FeedbackUser;
  screenshotUrl: string | null;
}

function formatBody(params: CreateIssueParams): string {
  const { description, metadata, user, screenshotUrl } = params;

  const metaTable = [
    '| Field | Value |',
    '|-------|-------|',
    `| URL | ${metadata.url} |`,
    `| Browser | ${metadata.browser} |`,
    `| OS | ${metadata.os} |`,
    `| User | ${user.email} (${user.id}) |`,
  ].join('\n');

  const errorsSection =
    metadata.consoleErrors.length > 0
      ? `\n\n**Console errors:**\n\`\`\`\n${metadata.consoleErrors.join('\n')}\n\`\`\``
      : '';

  const screenshotSection = screenshotUrl ? `\n\n![Screenshot](${screenshotUrl})` : '';

  return `${description}\n\n${metaTable}${errorsSection}${screenshotSection}`;
}

export async function createIssue(params: CreateIssueParams): Promise<string> {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = params.repo.split('/');
  const prefix = params.type === 'bug' ? '[Bug]' : '[Feature]';
  const label = params.type === 'bug' ? 'bug' : 'enhancement';

  const { data } = await octokit.issues.create({
    owner,
    repo,
    title: `${prefix} ${params.title}`,
    body: formatBody(params),
    labels: [label],
  });

  return data.html_url;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/lib/github.test.ts
```

Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github.ts tests/lib/github.test.ts
git commit -m "feat: add GitHub issue client with body formatting"
```

---

### Task 3: Screenshot Storage

**Files:**
- Create: `src/lib/storage.ts`
- Create: `tests/lib/storage.test.ts`

**Interfaces:**
- Produces: `uploadScreenshot(base64: string): Promise<string>` — returns public Vercel Blob URL

- [ ] **Step 1: Write failing tests**

Create `tests/lib/storage.test.ts`:

```typescript
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
    await uploadScreenshot('data:image/png;base64,abc123==');
    const [, buffer] = mockPut.mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('base64')).toBe('abc123==');
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/lib/storage.test.ts
```

Expected: FAIL — `@/lib/storage` not found.

- [ ] **Step 3: Implement screenshot storage**

Create `src/lib/storage.ts`:

```typescript
import { put } from '@vercel/blob';

export async function uploadScreenshot(base64: string): Promise<string> {
  const data = base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(data, 'base64');
  const filename = `screenshots/${Date.now()}.png`;

  const { url } = await put(filename, buffer, {
    access: 'public',
    contentType: 'image/png',
  });

  return url;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/lib/storage.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts tests/lib/storage.test.ts
git commit -m "feat: add Vercel Blob screenshot upload"
```

---

### Task 4: Proxy API Route

**Files:**
- Create: `src/app/api/feedback/route.ts`
- Create: `tests/api/feedback.test.ts`

**Interfaces:**
- Consumes: `createIssue` from `src/lib/github.ts`; `uploadScreenshot` from `src/lib/storage.ts`
- Produces: `POST /api/feedback` → `{ issueUrl: string }` on success; `{ error: string }` on failure

- [ ] **Step 1: Write failing tests**

Create `tests/api/feedback.test.ts`:

```typescript
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
  repo: 'org/repo',
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
  vi.stubEnv('WIDGET_API_KEYS', 'key_valid,key_other');
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

  it('uploads screenshot and passes URL to createIssue when screenshot provided', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    await POST(makeRequest({ ...validPayload, screenshot: 'data:image/png;base64,abc' }) as any);
    expect(mockUploadScreenshot).toHaveBeenCalledWith('data:image/png;base64,abc');
    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({ screenshotUrl: 'https://blob.vercel.app/shot.png' })
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/api/feedback.test.ts
```

Expected: FAIL — `@/app/api/feedback/route` not found.

- [ ] **Step 3: Implement the proxy route**

Create `src/app/api/feedback/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createIssue } from '@/lib/github';
import { uploadScreenshot } from '@/lib/storage';
import type { FeedbackType, FeedbackUser, FeedbackMetadata } from '@/widget/types';

interface FeedbackBody {
  apiKey: string;
  repo: string;
  type: FeedbackType;
  title: string;
  description: string;
  user: FeedbackUser;
  metadata: FeedbackMetadata;
  screenshot: string | null;
}

function getValidApiKeys(): string[] {
  return (process.env.WIDGET_API_KEYS ?? '').split(',').filter(Boolean);
}

function isValidBody(body: unknown): body is FeedbackBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.apiKey === 'string' &&
    typeof b.repo === 'string' &&
    (b.type === 'bug' || b.type === 'feature') &&
    typeof b.title === 'string' &&
    b.title.length > 0 &&
    typeof b.description === 'string' &&
    typeof b.user === 'object' && b.user !== null &&
    typeof b.metadata === 'object' && b.metadata !== null
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!getValidApiKeys().includes(body.apiKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let screenshotUrl: string | null = null;
  if (body.screenshot) {
    try {
      screenshotUrl = await uploadScreenshot(body.screenshot);
    } catch (err) {
      console.error('Screenshot upload failed:', err);
    }
  }

  try {
    const issueUrl = await createIssue({
      repo: body.repo,
      type: body.type,
      title: body.title,
      description: body.description,
      metadata: body.metadata,
      user: body.user,
      screenshotUrl,
    });
    return NextResponse.json({ issueUrl });
  } catch (err) {
    console.error('GitHub issue creation failed:', err);
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/api/feedback.test.ts
```

Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/feedback/route.ts tests/api/feedback.test.ts
git commit -m "feat: add /api/feedback proxy route"
```

---

### Task 5: Widget Capture Module

**Files:**
- Create: `src/widget/capture.ts`
- Create: `tests/widget/capture.test.ts`

**Interfaces:**
- Produces:
  - `installConsoleCapture(): void` — monkey-patches `console.error` to buffer errors; safe to call multiple times
  - `getConsoleErrors(): string[]` — returns copy of buffered errors
  - `captureMetadata(): FeedbackMetadata` — current URL + parsed UA + buffered errors
  - `captureScreenshot(): Promise<string | null>` — html2canvas screenshot as data URL, or null on failure

- [ ] **Step 1: Write failing tests**

Create `tests/widget/capture.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: () => 'data:image/png;base64,fakeshot',
  }),
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
    expect(result).toBe('data:image/png;base64,fakeshot');
  });

  it('returns null when html2canvas throws', async () => {
    vi.doMock('html2canvas', () => ({
      default: vi.fn().mockRejectedValue(new Error('canvas fail')),
    }));
    vi.resetModules();
    const { captureScreenshot } = await import('@/widget/capture');
    const result = await captureScreenshot();
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/widget/capture.test.ts
```

Expected: FAIL — `@/widget/capture` not found.

- [ ] **Step 3: Implement the capture module**

Create `src/widget/capture.ts`:

```typescript
import html2canvas from 'html2canvas';
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
    const canvas = await html2canvas(document.body);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/widget/capture.test.ts
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/widget/capture.ts tests/widget/capture.test.ts
git commit -m "feat: add widget capture module (URL, UA, console errors, screenshot)"
```

---

### Task 6: Widget API Client

**Files:**
- Create: `src/widget/api.ts`
- Create: `tests/widget/api.test.ts`

**Interfaces:**
- Consumes: `FeedbackPayload` from `src/widget/types.ts`
- Produces: `submitFeedback(endpoint: string, payload: FeedbackPayload): Promise<{ issueUrl: string }>`

- [ ] **Step 1: Write failing tests**

Create `tests/widget/api.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/widget/api.test.ts
```

Expected: FAIL — `@/widget/api` not found.

- [ ] **Step 3: Implement the widget API client**

Create `src/widget/api.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/widget/api.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/widget/api.ts tests/widget/api.test.ts
git commit -m "feat: add widget API client for submitting feedback to proxy"
```

---

### Task 7: Widget UI

**Files:**
- Create: `src/widget/ui.ts`
- Create: `tests/widget/ui.test.ts`

**Interfaces:**
- Consumes: `FeedbackType` from `src/widget/types.ts`
- Produces:
  - `WidgetFormData`: `{ type: FeedbackType; title: string; description: string }`
  - `injectWidget(onSubmit: (data: WidgetFormData) => Promise<string>): void`
    - Injects floating button + modal into host DOM; `onSubmit` returns `issueUrl`; shows success link or error message

- [ ] **Step 1: Write failing tests**

Create `tests/widget/ui.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  vi.resetModules();
});

describe('injectWidget', () => {
  it('injects a feedback button with id fw-button into body', async () => {
    const { injectWidget } = await import('@/widget/ui');
    injectWidget(vi.fn().mockResolvedValue(''));
    expect(document.getElementById('fw-button')).not.toBeNull();
  });

  it('injects a style tag with id fw-styles into head', async () => {
    const { injectWidget } = await import('@/widget/ui');
    injectWidget(vi.fn().mockResolvedValue(''));
    expect(document.getElementById('fw-styles')).not.toBeNull();
  });

  it('does not inject twice when called multiple times', async () => {
    const { injectWidget } = await import('@/widget/ui');
    const onSubmit = vi.fn().mockResolvedValue('');
    injectWidget(onSubmit);
    injectWidget(onSubmit);
    expect(document.querySelectorAll('#fw-button').length).toBe(1);
  });

  it('clicking the button opens a modal with id fw-modal', async () => {
    const { injectWidget } = await import('@/widget/ui');
    injectWidget(vi.fn().mockResolvedValue(''));
    (document.getElementById('fw-button') as HTMLButtonElement).click();
    expect(document.getElementById('fw-modal')).not.toBeNull();
  });

  it('modal contains type selector, title input, and description textarea', async () => {
    const { injectWidget } = await import('@/widget/ui');
    injectWidget(vi.fn().mockResolvedValue(''));
    (document.getElementById('fw-button') as HTMLButtonElement).click();
    expect(document.getElementById('fw-type')).not.toBeNull();
    expect(document.getElementById('fw-title')).not.toBeNull();
    expect(document.getElementById('fw-description')).not.toBeNull();
  });

  it('submitting the form calls onSubmit with type, title, and description', async () => {
    const onSubmit = vi.fn().mockResolvedValue('https://github.com/org/repo/issues/1');
    const { injectWidget } = await import('@/widget/ui');
    injectWidget(onSubmit);
    (document.getElementById('fw-button') as HTMLButtonElement).click();

    (document.getElementById('fw-type') as HTMLSelectElement).value = 'feature';
    (document.getElementById('fw-title') as HTMLInputElement).value = 'Add dark mode';
    (document.getElementById('fw-description') as HTMLTextAreaElement).value = 'Would be nice';

    document.getElementById('fw-form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'feature',
      title: 'Add dark mode',
      description: 'Would be nice',
    });
  });

  it('shows success div with issue link after successful submit', async () => {
    const { injectWidget } = await import('@/widget/ui');
    injectWidget(vi.fn().mockResolvedValue('https://github.com/org/repo/issues/1'));
    (document.getElementById('fw-button') as HTMLButtonElement).click();
    (document.getElementById('fw-title') as HTMLInputElement).value = 'T';
    (document.getElementById('fw-description') as HTMLTextAreaElement).value = 'D';
    document.getElementById('fw-form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));

    expect(document.getElementById('fw-success')).not.toBeNull();
    const link = document.querySelector('#fw-success a') as HTMLAnchorElement;
    expect(link.href).toBe('https://github.com/org/repo/issues/1');
  });

  it('shows error div when onSubmit rejects', async () => {
    const { injectWidget } = await import('@/widget/ui');
    injectWidget(vi.fn().mockRejectedValue(new Error('Unauthorized')));
    (document.getElementById('fw-button') as HTMLButtonElement).click();
    (document.getElementById('fw-title') as HTMLInputElement).value = 'T';
    (document.getElementById('fw-description') as HTMLTextAreaElement).value = 'D';
    document.getElementById('fw-form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));

    const errorEl = document.getElementById('fw-error');
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toContain('Unauthorized');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/widget/ui.test.ts
```

Expected: FAIL — `@/widget/ui` not found.

- [ ] **Step 3: Implement the widget UI**

Create `src/widget/ui.ts`:

```typescript
import type { FeedbackType } from './types';

export interface WidgetFormData {
  type: FeedbackType;
  title: string;
  description: string;
}

type SubmitHandler = (data: WidgetFormData) => Promise<string>;

const STYLES = `
  #fw-button {
    position: fixed; bottom: 24px; right: 24px;
    background: #0070f3; color: #fff; border: none;
    border-radius: 50%; width: 52px; height: 52px;
    font-size: 22px; cursor: pointer; z-index: 9998;
    box-shadow: 0 4px 14px rgba(0,112,243,.4);
  }
  #fw-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.4);
    z-index: 9999; display: flex; align-items: center; justify-content: center;
  }
  #fw-modal {
    background: #fff; border-radius: 12px; padding: 24px;
    width: 100%; max-width: 420px; box-shadow: 0 8px 32px rgba(0,0,0,.2);
    font-family: system-ui, sans-serif;
  }
  #fw-modal h2 { margin: 0 0 16px; font-size: 18px; }
  #fw-modal select, #fw-modal input, #fw-modal textarea {
    width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
    border-radius: 6px; font-size: 14px; box-sizing: border-box;
    margin-bottom: 12px; font-family: inherit;
  }
  #fw-modal textarea { min-height: 80px; resize: vertical; }
  #fw-modal button[type=submit] {
    background: #0070f3; color: #fff; border: none;
    padding: 10px 20px; border-radius: 6px; font-size: 14px;
    cursor: pointer; width: 100%;
  }
  #fw-modal button[type=submit]:disabled { opacity: .6; cursor: not-allowed; }
  #fw-close {
    float: right; background: none; border: none;
    font-size: 20px; cursor: pointer; color: #666; padding: 0;
  }
  #fw-success, #fw-error {
    padding: 12px; border-radius: 6px; margin-top: 8px; font-size: 14px;
  }
  #fw-success { background: #f0fdf4; color: #166534; }
  #fw-success a { color: #166534; }
  #fw-error { background: #fef2f2; color: #991b1b; }
`;

export function injectWidget(onSubmit: SubmitHandler): void {
  if (document.getElementById('fw-styles')) return;

  const style = document.createElement('style');
  style.id = 'fw-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.id = 'fw-button';
  button.setAttribute('aria-label', 'Send feedback');
  button.innerHTML = '&#128172;';
  button.addEventListener('click', () => openModal(onSubmit));
  document.body.appendChild(button);
}

function openModal(onSubmit: SubmitHandler): void {
  if (document.getElementById('fw-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'fw-overlay';
  overlay.innerHTML = `
    <div id="fw-modal" role="dialog" aria-modal="true" aria-label="Send feedback">
      <button id="fw-close" aria-label="Close">&#x2715;</button>
      <h2>Send Feedback</h2>
      <form id="fw-form">
        <select id="fw-type" aria-label="Feedback type">
          <option value="bug">Bug Report</option>
          <option value="feature">Feature Request</option>
        </select>
        <input id="fw-title" type="text" placeholder="Title" required aria-label="Title" />
        <textarea id="fw-description" placeholder="Describe the issue or feature..." required aria-label="Description"></textarea>
        <button type="submit" id="fw-submit">Submit Feedback</button>
      </form>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  overlay.querySelector('#fw-close')!.addEventListener('click', closeModal);

  overlay.querySelector('#fw-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('fw-submit') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    const type = (document.getElementById('fw-type') as HTMLSelectElement).value as FeedbackType;
    const title = (document.getElementById('fw-title') as HTMLInputElement).value;
    const description = (document.getElementById('fw-description') as HTMLTextAreaElement).value;
    const form = document.getElementById('fw-form')!;

    try {
      const issueUrl = await onSubmit({ type, title, description });
      form.innerHTML = `
        <div id="fw-success">
          Feedback submitted! <a href="${issueUrl}" target="_blank" rel="noopener">View issue &rarr;</a>
        </div>
      `;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Feedback';
      const existing = document.getElementById('fw-error');
      if (existing) existing.remove();
      const errorDiv = document.createElement('div');
      errorDiv.id = 'fw-error';
      errorDiv.textContent =
        err instanceof Error ? err.message : 'Submission failed. Try again.';
      form.appendChild(errorDiv);
    }
  });

  document.body.appendChild(overlay);
  (document.getElementById('fw-title') as HTMLInputElement | null)?.focus();
}

function closeModal(): void {
  document.getElementById('fw-overlay')?.remove();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/widget/ui.test.ts
```

Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/widget/ui.ts tests/widget/ui.test.ts
git commit -m "feat: add widget UI (floating button + feedback modal)"
```

---

### Task 8: Widget Entry Point + esbuild Pipeline

**Files:**
- Create: `src/widget/index.ts`
- Create: `scripts/build-widget.ts`
- Create: `scripts/test-page.html`
- Create: `public/widget/.gitkeep`

**Interfaces:**
- Consumes: `installConsoleCapture`, `captureMetadata`, `captureScreenshot` from `src/widget/capture.ts`; `submitFeedback` from `src/widget/api.ts`; `injectWidget` from `src/widget/ui.ts`; `FeedbackConfig` from `src/widget/types.ts`
- Produces: `window.FeedbackWidget.init(config: FeedbackConfig): void`

- [ ] **Step 1: Create the widget entry point**

Create `src/widget/index.ts`:

```typescript
import { installConsoleCapture, captureMetadata, captureScreenshot } from './capture';
import { submitFeedback } from './api';
import { injectWidget } from './ui';
import type { FeedbackConfig } from './types';

installConsoleCapture();

function detectEndpoint(): string {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
  const self = scripts.find((s) => s.src.includes('/widget/feedback-widget.js'));
  return self ? new URL(self.src).origin : window.location.origin;
}

const FeedbackWidget = {
  init(config: FeedbackConfig): void {
    const endpoint = config.endpoint ?? detectEndpoint();

    injectWidget(async (formData) => {
      const metadata = captureMetadata();
      const screenshot = await captureScreenshot();

      const result = await submitFeedback(endpoint, {
        apiKey: config.apiKey,
        repo: config.repo,
        type: formData.type,
        title: formData.title,
        description: formData.description,
        user: config.user,
        metadata,
        screenshot,
      });

      return result.issueUrl;
    });
  },
};

(window as Window & { FeedbackWidget: typeof FeedbackWidget }).FeedbackWidget = FeedbackWidget;
```

- [ ] **Step 2: Create the esbuild pipeline**

Create `scripts/build-widget.ts`:

```typescript
import esbuild from 'esbuild';
import { mkdirSync } from 'fs';

mkdirSync('public/widget', { recursive: true });

await esbuild.build({
  entryPoints: ['src/widget/index.ts'],
  bundle: true,
  minify: process.env.NODE_ENV === 'production',
  outfile: 'public/widget/feedback-widget.js',
  format: 'iife',
  platform: 'browser',
  target: ['chrome90', 'firefox90', 'safari14'],
  logLevel: 'info',
});
```

- [ ] **Step 3: Create the integration test page**

Create `scripts/test-page.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Feedback Widget Integration Test</title>
  <style>body { font-family: system-ui, sans-serif; padding: 40px; }</style>
</head>
<body>
  <h1>Feedback Widget Integration Test</h1>
  <p>Click the button in the bottom-right corner to test the widget.</p>
  <p>Submissions will create a real GitHub Issue in the configured repo.</p>

  <script src="../public/widget/feedback-widget.js"></script>
  <script>
    FeedbackWidget.init({
      apiKey: 'key_test',
      repo: 'bmichaelis/feedback-tool',
      endpoint: 'http://localhost:3000',
      user: { id: 'test-user', email: 'brett.michaelis@gmail.com' }
    });
  </script>
</body>
</html>
```

- [ ] **Step 4: Create .gitkeep for the public/widget directory**

```bash
touch public/widget/.gitkeep
```

- [ ] **Step 5: Build the widget**

```bash
npm run build:widget
```

Expected output includes a line like:
```
  public/widget/feedback-widget.js  XXXkb
```

- [ ] **Step 6: Verify the built file exists and has content**

```bash
ls -lh public/widget/feedback-widget.js
```

Expected: File exists with size > 0.

- [ ] **Step 7: Commit**

```bash
git add src/widget/index.ts scripts/build-widget.ts scripts/test-page.html public/widget/.gitkeep
git commit -m "feat: add widget entry point and esbuild pipeline"
```

---

### Task 9: Deploy Configuration + Full Verification

**Files:**
- Create: `.env.example`
- Verify: full test suite passes; full production build succeeds

- [ ] **Step 1: Create .env.example**

Create `.env.example`:

```bash
# GitHub Personal Access Token with "repo" scope
# Generate at: https://github.com/settings/tokens
GITHUB_TOKEN=ghp_your_token_here

# Comma-separated widget API keys — one per host app
# Generate with: openssl rand -hex 16
WIDGET_API_KEYS=key_abc123,key_def456

# Provided automatically when you run: vercel integrations add blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_your_token_here
```

- [ ] **Step 2: Copy to .env.local and fill in real values**

```bash
cp .env.example .env.local
```

Edit `.env.local` with real values. Do not commit this file (Next.js gitignores it by default).

- [ ] **Step 3: Confirm .env.local is gitignored**

```bash
grep '\.env\.local' .gitignore
```

Expected: `.env.local` appears in output.

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: All tests pass. No failures.

- [ ] **Step 5: Run the full production build**

```bash
npm run build
```

Expected: Widget builds successfully, then Next.js build completes with no TypeScript or compilation errors.

- [ ] **Step 6: Add Vercel Blob integration before deploying**

```bash
vercel integrations add blob
```

This sets `BLOB_READ_WRITE_TOKEN` automatically in your Vercel project. Also add `GITHUB_TOKEN` and `WIDGET_API_KEYS` via:

```bash
vercel env add GITHUB_TOKEN
vercel env add WIDGET_API_KEYS
```

- [ ] **Step 7: Manual integration test**

Start dev server:
```bash
npm run dev
```

Open `scripts/test-page.html` in a browser (open the file directly, or serve it with `npx serve scripts/`). Click the feedback button, fill in the form, submit. Verify a GitHub Issue appears in `bmichaelis/feedback-tool`.

- [ ] **Step 8: Commit**

```bash
git add .env.example
git commit -m "feat: add deploy config and env example"
```

---

## Self-Review Against Spec

**Spec coverage:**
- ✅ Script tag embed + `FeedbackWidget.init({ apiKey, repo, user })` → Tasks 8, 9
- ✅ Bug / Feature Request types with labels → Tasks 2, 7
- ✅ Auto-capture: URL, browser/OS, console errors, screenshot → Task 5
- ✅ User identity (id + email) from host app → Tasks 1, 8
- ✅ Backend proxy with apiKey validation against `WIDGET_API_KEYS` → Task 4
- ✅ GitHub Issue creation with formatted markdown body → Task 2
- ✅ Screenshot upload to Vercel Blob → Task 3
- ✅ `{ issueUrl }` response + "View issue →" link in success state → Tasks 4, 7
- ✅ Error states: 401, 400, 500, screenshot failure (non-blocking) → Tasks 4, 7
- ✅ `GITHUB_TOKEN`, `WIDGET_API_KEYS`, `BLOB_READ_WRITE_TOKEN` env vars → Tasks 2, 3, 4, 9
- ✅ Unit tests (Vitest): github, storage, route, capture, api, ui → Tasks 2–7
- ✅ Integration test page → Task 8
- ✅ esbuild pipeline → Task 8
- ✅ Endpoint auto-detection from script `src` attribute → Task 8
- ✅ v1 security note: any valid key can target any repo the PAT can access → in spec

**Type consistency:**
- `FeedbackType`, `FeedbackUser`, `FeedbackConfig`, `FeedbackMetadata`, `FeedbackPayload` defined Task 1 → used consistently Tasks 2–8
- `createIssue(params)` defined Task 2, consumed Task 4 — signatures match
- `uploadScreenshot(base64)` defined Task 3, consumed Task 4 — signatures match
- `submitFeedback(endpoint, payload)` defined Task 6, consumed Task 8 — signatures match
- `injectWidget(onSubmit)` / `WidgetFormData` defined Task 7, consumed Task 8 — signatures match

**No placeholders found.**
