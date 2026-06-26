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
    target: ['chrome90', 'firefox90', 'safari14'],
    logLevel: 'info',
  });
})();
