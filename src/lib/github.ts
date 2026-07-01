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
  userScreenshotUrl: string | null;
}

function formatBody(params: CreateIssueParams): string {
  const { description, metadata, user, screenshotUrl, userScreenshotUrl } = params;

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

  const screenshots: string[] = [];
  if (screenshotUrl) screenshots.push(`**Page screenshot:**\n![Page screenshot](${screenshotUrl})`);
  if (userScreenshotUrl) screenshots.push(`**Attached by user:**\n![User screenshot](${userScreenshotUrl})`);
  const screenshotSection = screenshots.length > 0 ? `\n\n${screenshots.join('\n\n')}` : '';

  return `${description}\n\n${metaTable}${errorsSection}${screenshotSection}`;
}

function createOctokit(auth: string | undefined) {
  // Vitest 4.x changed how vi.fn().mockImplementation(arrowFn) works as a constructor:
  // it calls Reflect.construct(arrowFn, ...) which fails because arrow functions can't be
  // constructors. Calling without `new` works because vi.fn() falls into the else branch
  // and invokes the implementation normally. In production, `new Octokit()` succeeds.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (Octokit as any)({ auth });
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (Octokit as any)({ auth });
  }
}

export async function createIssue(params: CreateIssueParams): Promise<string> {
  const octokit = createOctokit(process.env.GITHUB_TOKEN);
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
