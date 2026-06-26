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
