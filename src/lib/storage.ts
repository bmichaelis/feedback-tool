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
