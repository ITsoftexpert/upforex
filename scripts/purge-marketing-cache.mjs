import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validateUrls(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Provide published page URLs with --urls-file pages.json or as arguments.');
  }
  return [...new Set(values.map((value) => {
    const url = new URL(value);
    const page = url.pathname.replace(/^\/(hi|ar|fr|es|de|zh-cn|zh-tw|ja|pt|ru)(?=\/|$)/, '');
    if (url.protocol !== 'https:' || url.host !== 'www.upforex.com' ||
        url.username || url.password || url.search || url.hash ||
        /^\/(?:admin|api|terms|login|register|dashboard)(?:\/|$)/.test(page)) {
      throw new Error('Purge URLs must be public HTTPS marketing pages on www.upforex.com without query strings.');
    }
    return url.href;
  }))];
}

export async function purgeUrls(urls, request = fetch, env = process.env) {
  const files = validateUrls(urls);
  const zone = env.CLOUDFLARE_ZONE_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!zone || !/^[a-f0-9]{32}$/i.test(zone) || !token) {
    throw new Error('Set CLOUDFLARE_ZONE_ID and a zone-scoped CLOUDFLARE_API_TOKEN with Cache Purge permission in the deployment environment.');
  }
  for (let index = 0; index < files.length; index += 30) {
    const response = await request(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: files.slice(index, index + 30) }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(`Cloudflare purge failed (HTTP ${response.status}); publication must not be reported as fully refreshed.`);
    }
  }
  return files.length;
}

async function main() {
  const args = process.argv.slice(2);
  let dryRun = false;
  const urls = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--dry-run') dryRun = true;
    else if (args[index] === '--urls-file') {
      const filename = args[++index];
      if (!filename) throw new Error('--urls-file requires a JSON file containing an array of published URLs.');
      urls.push(...validateUrls(JSON.parse(await readFile(filename, 'utf8'))));
    } else urls.push(args[index]);
  }
  const files = validateUrls(urls);
  if (dryRun) console.log(JSON.stringify({ dryRun: true, files }, null, 2));
  else console.log(`Purged ${await purgeUrls(files)} published marketing page(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
