// Single-HTML bundler for 《勇闖屍骨山》
// Produces a zero-network, double-click runnable standalone HTML file: dist/勇闖屍骨山.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gameDir = path.join(root, 'game');
const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });

// Resolve 'three' and 'three/addons/*' to local game/lib copies (zero external CDN!)
const localThreePlugin = {
  name: 'local-three',
  setup(build) {
    build.onResolve({ filter: /^three$/ }, () => ({
      path: path.join(gameDir, 'lib', 'three.module.js'),
    }));
    build.onResolve({ filter: /^three\/addons\// }, (args) => ({
      path: path.join(gameDir, 'lib', args.path.replace(/^three\/addons\//, '')),
    }));
  },
};

const result = await esbuild.build({
  entryPoints: [path.join(gameDir, 'src', 'main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  write: false,
  plugins: [localThreePlugin],
});

const bundledJs = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// Embed any optional MP3 music files placed in game/assets/music/
const embeddedAssets = {};
const musicDir = path.join(gameDir, 'assets', 'music');
if (fs.existsSync(musicDir)) {
  for (const name of fs.readdirSync(musicDir)) {
    if (name.endsWith('.mp3')) {
      const buf = fs.readFileSync(path.join(musicDir, name));
      embeddedAssets[`assets/music/${name}`] = `data:audio/mpeg;base64,${buf.toString('base64')}`;
    }
  }
}

let html = fs.readFileSync(path.join(gameDir, 'index.html'), 'utf8');
// Strip importmap & external module script
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/i, '');
html = html.replace(
  /<script type="module" src="\.\/src\/main\.js"><\/script>/i,
  () => `<script>window.__A=${JSON.stringify(embeddedAssets)};</script>\n  <script>\n${bundledJs}\n  </script>`
);

const outFile = path.join(distDir, '勇闖屍骨山.html');
fs.writeFileSync(outFile, html, 'utf8');

// Also write a preview copy inside game/ so local static server can verify it in browser
const previewFile = path.join(gameDir, 'standalone_preview.html');
fs.writeFileSync(previewFile, html, 'utf8');

const sizeKB = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`BUILD_OK: ${outFile} (${sizeKB} KB, embedded audio: ${Object.keys(embeddedAssets).length})`);
