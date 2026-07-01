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
        type: formData.type,
        title: formData.title,
        description: formData.description,
        user: config.user,
        metadata,
        screenshot,
        userScreenshot: formData.userScreenshot,
      });

      return result.issueUrl;
    });
  },
};

(window as unknown as Window & { FeedbackWidget: typeof FeedbackWidget }).FeedbackWidget = FeedbackWidget;
