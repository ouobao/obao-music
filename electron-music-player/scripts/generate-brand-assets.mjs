import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const brandingDirectory = path.join(projectRoot, 'assets', 'branding');
const sourcePath = path.join(brandingDirectory, 'oubao-logo.svg');
const iconSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];

await mkdir(brandingDirectory, { recursive: true });
const source = await readFile(sourcePath, 'utf8');
const systemBrowserPath = await findSystemBrowser();
const browser = await chromium.launch({
  headless: true,
  ...(systemBrowserPath ? { executablePath: systemBrowserPath } : {})
});

try {
  const page = await browser.newPage({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 1
  });
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          * { box-sizing: border-box; }
          html, body { width: 100%; height: 100%; margin: 0; background: transparent; overflow: hidden; }
          svg { display: block; width: 100%; height: 100%; }
        </style>
      </head>
      <body>${source}</body>
    </html>
  `);

  const logo = page.locator('svg');
  const pngBySize = new Map();
  for (const size of [...iconSizes, 512]) {
    await page.setViewportSize({ width: size, height: size });
    pngBySize.set(size, await logo.screenshot({ omitBackground: true }));
  }

  await writeFile(path.join(brandingDirectory, 'oubao-logo.png'), pngBySize.get(512));
  await writeFile(path.join(brandingDirectory, 'oubao-tray.png'), pngBySize.get(32));
  await writeFile(path.join(brandingDirectory, 'oubao-logo.ico'), createIco(iconSizes.map((size) => ({
    size,
    data: pngBySize.get(size)
  }))));
} finally {
  await browser.close();
}

function createIco(images) {
  const headerSize = 6;
  const directoryEntrySize = 16;
  const dataOffset = headerSize + directoryEntrySize * images.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let nextOffset = dataOffset;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(directoryEntrySize);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(nextOffset, 12);
    nextOffset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

async function findSystemBrowser() {
  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env.PROGRAMFILES ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe')
      ]
    : [];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next installed browser candidate.
    }
  }

  return null;
}
