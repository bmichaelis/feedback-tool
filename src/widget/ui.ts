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
