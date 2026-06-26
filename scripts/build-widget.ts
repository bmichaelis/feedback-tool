import esbuild from 'esbuild';
import { mkdirSync } from 'fs';

mkdirSync('public/widget', { recursive: true });

void (async () => {
  await esbuild.build({
    entryPoints: ['src/widget/index.ts'],
    bundle: true,
    minify: process.env.NODE_ENV === 'production',
    outfile: 'public/widget/feedback-widget.js',
    format: 'iife',
    platform: 'browser',
    target: ['chrome107', 'firefox107', 'safari16'],
    logLevel: 'info',
  });
})();
