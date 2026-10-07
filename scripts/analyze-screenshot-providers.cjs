const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { screenshotProvider, isScreenshotPage, isScreenshotThumbnail, uniqueScreenshotUrls } = load('src/services/screenshotResolver.ts');
const directory = path.resolve(process.argv[2] || path.join(__dirname, '../../ecohub-app/data'));
const totals = {};
let itemsCount = 0, rawCount = 0, uniqueCount = 0;
for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.json')).sort()) {
  const data = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
  for (const item of Array.isArray(data) ? data : data.items || []) {
    itemsCount++;
    const shots = item.content?.screenshots ?? item.screenshots ?? [];
    if (!Array.isArray(shots)) continue;
    uniqueCount += uniqueScreenshotUrls(shots).length;
    for (const url of shots) {
      if (typeof url !== 'string') continue;
      rawCount++;
      const provider = screenshotProvider(url);
      const stats = totals[provider] ||= { count: 0, http: 0, https: 0, thumbnail: 0, direct: 0, page: 0 };
      stats.count++;
      if (/^http:/i.test(url.trim())) stats.http++;
      if (/^https:/i.test(url.trim())) stats.https++;
      if (isScreenshotThumbnail(url)) stats.thumbnail++;
      if (isScreenshotPage(url)) stats.page++; else if (!isScreenshotThumbnail(url)) stats.direct++;
    }
  }
}
console.log(JSON.stringify({ directory, items: itemsCount, raw: rawCount, unique: uniqueCount, providers: Object.fromEntries(Object.entries(totals).sort((a, b) => b[1].count - a[1].count)) }, null, 2));
