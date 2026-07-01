import { NextRequest, NextResponse } from 'next/server';
import { createIssue } from '@/lib/github';
import { uploadScreenshot, uploadAttachment } from '@/lib/storage';
import type { FeedbackType, FeedbackUser, FeedbackMetadata } from '@/widget/types';

interface FeedbackBody {
  apiKey: string;
  type: FeedbackType;
  title: string;
  description: string;
  user: FeedbackUser;
  metadata: FeedbackMetadata;
  screenshot: string | null;
  userScreenshot?: string | null;
}

// WIDGET_API_KEYS format: "key1:org/repo1,key2:org/repo2"
function getKeyRepoMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of (process.env.WIDGET_API_KEYS ?? '').split(',')) {
    const [key, repo] = entry.split(':');
    if (key && repo) map.set(key, repo);
  }
  return map;
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

function isValidBody(body: unknown): body is FeedbackBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if (
    !(
      typeof b.apiKey === 'string' &&
      (b.type === 'bug' || b.type === 'feature') &&
      typeof b.title === 'string' &&
      b.title.length > 0 &&
      typeof b.description === 'string' &&
      typeof b.user === 'object' && b.user !== null &&
      typeof b.metadata === 'object' && b.metadata !== null
    )
  ) return false;

  const meta = b.metadata as Record<string, unknown>;
  const user = b.user as Record<string, unknown>;
  return (
    typeof meta.url === 'string' &&
    typeof meta.browser === 'string' &&
    typeof meta.os === 'string' &&
    Array.isArray(meta.consoleErrors) &&
    typeof user.id === 'string' &&
    typeof user.email === 'string'
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders() });
  }

  if (!isValidBody(body)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders() });
  }

  const repo = getKeyRepoMap().get(body.apiKey);
  if (!repo) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
  }

  let screenshotUrl: string | null = null;
  if (body.screenshot) {
    try {
      screenshotUrl = await uploadScreenshot(body.screenshot);
    } catch (err) {
      console.error('Screenshot upload failed:', err);
    }
  }

  let userScreenshotUrl: string | null = null;
  if (body.userScreenshot) {
    try {
      userScreenshotUrl = await uploadAttachment(body.userScreenshot);
    } catch (err) {
      console.error('Attachment upload failed:', err);
    }
  }

  try {
    const issueUrl = await createIssue({
      repo,
      type: body.type,
      title: body.title,
      description: body.description,
      metadata: body.metadata,
      user: body.user,
      screenshotUrl,
      userScreenshotUrl,
    });
    return NextResponse.json({ issueUrl }, { headers: corsHeaders() });
  } catch (err) {
    console.error('GitHub issue creation failed:', err);
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 500, headers: corsHeaders() });
  }
}
