/**
 * build-genai.js
 * Bundles @google/genai web build into public/genai-bundle.js.
 * Run via: node build-genai.js  (or automatically via npm postinstall)
 *
 * Uses esbuild's JS API so it works cross-platform (Windows, macOS, Linux)
 * without relying on shell PATH resolution of the esbuild binary.
 */
const path = require('path');
const fs   = require('fs');

const entry  = path.resolve(__dirname, 'node_modules/@google/genai/dist/web/index.mjs');
const outfile = path.resolve(__dirname, 'public/genai-bundle.js');

if (!fs.existsSync(entry)) {
  console.error('[build-genai] Entry not found:', entry);
  console.error('  Run: npm install @google/genai');
  process.exit(1);
}

// Require esbuild from local node_modules (guaranteed to exist after npm install)
let esbuild;
try {
  esbuild = require('esbuild');
} catch (e) {
  console.error('[build-genai] esbuild not found in node_modules.');
  console.error('  Run: npm install --save-dev esbuild');
  process.exit(1);
}

esbuild.build({
  entryPoints: [entry],
  bundle:      true,
  format:      'iife',
  globalName:  'SalonBotGenAI',
  platform:    'browser',
  target:      ['es2019'],
  minify:      true,
  outfile:     outfile,
}).then(() => {
  const kb = Math.round(fs.statSync(outfile).size / 1024);
  console.log('[build-genai] Built public/genai-bundle.js (' + kb + ' kb)');
}).catch(err => {
  console.error('[build-genai] Build failed:', err.message);
  process.exit(1);
});
