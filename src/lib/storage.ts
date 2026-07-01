import { put } from '@vercel/blob';

export async function uploadScreenshot(base64: string): Promise<string> {
  const match = base64.match(/^data:([^;]+);base64,/);
  const contentType = match?.[1] ?? 'image/jpeg';
  const ext = contentType.split('/')[1] ?? 'jpg';
  const data = base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(data, 'base64');
  const filename = `screenshots/${Date.now()}.${ext}`;

  const { url } = await put(filename, buffer, {
    access: 'public',
    contentType,
  });

  return url;
}

export async function uploadAttachment(base64: string): Promise<string> {
  const match = base64.match(/^data:([^;]+);base64,/);
  const contentType = match?.[1] ?? 'image/jpeg';
  const ext = contentType.split('/')[1] ?? 'jpg';
  const data = base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(data, 'base64');
  const filename = `attachments/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const { url } = await put(filename, buffer, {
    access: 'public',
    contentType,
  });

  return url;
}
