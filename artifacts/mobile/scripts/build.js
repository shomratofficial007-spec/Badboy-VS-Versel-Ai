const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const distDirectory = path.join(projectRoot, 'dist');
const headersSource = path.join(projectRoot, 'public', '_headers');
const headersTarget = path.join(distDirectory, '_headers');

function fail(message, code = 1) {
  console.error(message);
  process.exitCode = code;
}

// Cloudflare Workers serves one static Expo web export from artifacts/mobile/dist.
// Replit/Pages-specific manifests and per-platform static-build bundles are not
// deployment targets in the Cloudflare-only architecture.
const child = spawn(
  'pnpm',
  ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', 'dist'],
  {
    stdio: 'inherit',
    cwd: projectRoot,
    env: {
      ...process.env,
      EXPO_PUBLIC_DOMAIN: process.env.EXPO_PUBLIC_DOMAIN || '',
    },
  },
);

child.on('error', (error) => {
  fail('Cloudflare Expo web export could not start: ' + error.message);
});

child.on('exit', (code) => {
  if (code !== 0) {
    fail('Cloudflare Expo web export failed.', code ?? 1);
    return;
  }

  if (!fs.existsSync(distDirectory)) {
    fail('Expo export completed without creating artifacts/mobile/dist.');
    return;
  }

  if (!fs.existsSync(headersSource)) {
    fail('Cloudflare static asset headers file is missing: ' + headersSource);
    return;
  }

  try {
    fs.copyFileSync(headersSource, headersTarget);
  } catch (error) {
    fail('Could not copy Cloudflare static asset headers: ' + error.message);
    return;
  }

  console.log('Copied Cloudflare static asset headers to dist/_headers');
  console.log('Cloudflare Worker static web export is ready.');
});
