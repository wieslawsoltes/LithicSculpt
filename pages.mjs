import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

// Publish only browser assets. Relative URLs support GitHub Pages project paths.
const destination = new URL('./_site/', import.meta.url);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of ['index.html', 'style.css', 'src', 'dist', 'LICENSE']) {
  await cp(new URL(name, import.meta.url), new URL(name, destination), { recursive: true });
}
await mkdir(new URL('tests/', destination));
for (const name of ['gpu-smoke.html', 'gpu-smoke.js']) {
  await cp(new URL(`tests/${name}`, import.meta.url), new URL(`tests/${name}`, destination));
}
await writeFile(new URL('.nojekyll', destination), '');
console.log('GitHub Pages assets prepared in _site/');
