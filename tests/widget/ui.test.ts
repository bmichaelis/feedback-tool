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
      userScreenshot: null,
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
