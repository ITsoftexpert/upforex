// Build-time compression, not visitor-time work. No runtime dependencies.
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const br = promisify(zlib.brotliCompress), gz = promisify(zlib.gzip);
const root = path.resolve(__dirname, '../dist/upforex_Frontend/browser');
async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else if (/\.(?:js|css|json|svg|txt|xml)$/i.test(entry.name)) files.push(file);
  }
  return files;
}
async function main() {
  const files = await walk(root), stats = { files: 0, originalBytes: 0, brotliBytes: 0, gzipBytes: 0 };
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++], input = await fs.readFile(file);
      if (input.length < 1024) continue;
      const [brotli, gzip] = await Promise.all([br(input, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }), gz(input, { level: 9 })]);
      if (brotli.length < input.length) await fs.writeFile(file + '.br', brotli);
      if (gzip.length < input.length) await fs.writeFile(file + '.gz', gzip);
      stats.files++; stats.originalBytes += input.length; stats.brotliBytes += brotli.length; stats.gzipBytes += gzip.length;
    }
  }));
  console.log('Precompressed browser assets: ' + JSON.stringify(stats));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
