# Feedback Tool — Design Spec
_Date: 2026-06-25_

## Purpose

A reusable in-app feedback widget that lets users of any application submit bug reports and feature requests directly to a GitHub repository. Host apps embed a single `<script>` tag; a Next.js backend proxy holds credentials and creates the GitHub Issues.

---

## Architecture

One repo, two outputs deployed together on Vercel:

```
feedback-tool/
├── src/
│   ├── app/
│   │   └── api/feedback/route.ts   ← proxy API route
│   ├── widget/                     ← vanilla TS, compiled by esbuild
│   │   ├── index.ts                ← FeedbackWidget.init() entry point
│   │   ├── ui.ts                   ← DOM button + modal
│   │   ├── capture.ts              ← metadata + screenshot collection
│   │   └── api.ts                  ← POST to proxy
│   └── lib/
│       ├── github.ts               ← Octokit wrapper
│       └── storage.ts              ← Vercel Blob upload
├── public/widget/
│   └── feedback-widget.js          ← esbuild output (CDN-served)
└── scripts/
    ├── build-widget.ts             ← esbuild script
    └── test-page.html              ← manual integration test page
```

The esbuild script runs during `next build` and outputs `feedback-widget.js` into `public/widget/`. Vercel serves it as a static CDN asset. No separate deployment needed.

---

## Host App Integration

```html
<script src="https://feedback-tool.vercel.app/widget/feedback-widget.js"></script>
<script>
  FeedbackWidget.init({
    apiKey: 'your-widget-api-key',  // authorizes calls to the proxy
    repo: 'org/repo-name',          // GitHub repo to create issues in
    user: { id: 'u123', email: 'brett@example.com' }
  })
</script>
```

The GitHub PAT lives only in Vercel environment variables — never exposed to the browser.

---

## Components

### Widget (`src/widget/`)

Compiled to a single self-contained JS bundle. Only external dependency: `html2canvas` for screenshots (bundled in).

| File | Responsibility |
|------|---------------|
| `index.ts` | Exports `FeedbackWidget.init()`. Monkey-patches `console.error` immediately on load to buffer errors before a report is filed. |
| `ui.ts` | Injects a floating button (bottom-right) and modal into the host page. Raw DOM — no framework. Styles injected as a `<style>` tag; no separate CSS file. |
| `capture.ts` | Collects `window.location.href`, `navigator.userAgent` (parsed to browser + OS), buffered console errors, and triggers `html2canvas` on submit. |
| `api.ts` | POSTs the assembled payload to the proxy endpoint. |

### Proxy API (`src/app/api/feedback/route.ts`)

Single Next.js Route Handler:
- Validates `apiKey` against `WIDGET_API_KEYS` (comma-separated env var — supports multiple keys for per-app rotation)
- Calls storage client to upload screenshot → gets public URL
- Calls GitHub client to create the issue
- Returns `{ issueUrl }` on success

> **v1 security note:** Any valid `apiKey` can target any `repo` the PAT has access to. The PAT's repo scope limits blast radius. Per-key repo allowlisting is out of scope for v1.

### GitHub Client (`src/lib/github.ts`)

Thin wrapper around `@octokit/rest`:
- `createIssue({ repo, type, title, description, metadata, user, screenshotUrl })`
- Formats a structured markdown issue body
- Applies label `bug` or `enhancement` based on type

### Screenshot Storage (`src/lib/storage.ts`)

Uploads the base64 PNG to Vercel Blob (public bucket), returns a URL embedded as an image in the GitHub Issue body. Screenshot failure is non-blocking — submission continues without it.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub PAT with `repo` scope |
| `WIDGET_API_KEYS` | Comma-separated valid API keys, e.g. `key_abc,key_def` |
| `BLOB_READ_WRITE_TOKEN` | Auto-provided by Vercel Blob integration |

---

## Data Flow

```
1.  User clicks floating button → modal opens
2.  User selects type (Bug / Feature Request), fills title + description, clicks Submit
3.  Widget captures in parallel:
      - window.location.href
      - navigator.userAgent → parsed browser + OS
      - buffered console.error calls (since init)
      - html2canvas screenshot of full page
4.  Widget POSTs to /api/feedback:
      { apiKey, repo, type, title, description,
        user: { id, email },
        metadata: { url, browser, os, consoleErrors[] },
        screenshot: '<base64 png>' }
5.  Proxy validates apiKey → 401 if invalid
6.  Proxy uploads screenshot to Vercel Blob → public URL
7.  Proxy calls GitHub API → creates issue:
      Title:  "[Bug] <title>"  or  "[Feature] <title>"
      Labels: ["bug"]          or  ["enhancement"]
      Body:
          <description>

          | Field   | Value               |
          |---------|---------------------|
          | URL     | https://...         |
          | Browser | Chrome 124 / macOS  |
          | User    | brett@example.com   |

          **Console errors:**
          ```
          TypeError: cannot read ...
          ```

          ![Screenshot](<blob-url>)

8.  Proxy returns { issueUrl } to widget
9.  Widget shows success state with "View issue →" link
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid `apiKey` | Proxy returns 401; widget shows "Unauthorized" in modal |
| Missing required fields | Proxy returns 400; widget shows inline validation errors |
| GitHub API failure | Proxy returns 500; widget shows "Submission failed, try again" |
| Screenshot capture failure | Logged, submission continues without screenshot |
| Blob upload failure | Logged, submission continues without screenshot URL |

---

## Testing

**Unit tests (Vitest):**
- `github.ts` — issue body formatting for bug vs. feature, correct labels
- `api/feedback/route.ts` — 401 on bad key, 400 on missing fields, 200 on valid payload (Octokit + Blob mocked)
- `capture.ts` — metadata shape, UA parsing, console error buffering

**Integration test (manual):**
- `scripts/test-page.html` loads the widget from `public/widget/feedback-widget.js`, inits with a test key pointing at `localhost:3000`, submits a real report, and verifies a GitHub Issue appears in a designated test repo.

No E2E framework — the integration test page covers the golden path with less overhead than Playwright at this stage.

---

## Out of Scope (v1)

- Admin dashboard for managing submissions
- Webhook configuration UI
- Custom widget themes
- Non-GitHub issue trackers (Linear, Jira)
- Video/screen recording
