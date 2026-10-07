import { uniqueScreenshotUrls } from "../services/screenshotResolver";

/**
 * Converts indirect image viewing page URLs (FastPic, ImageBan, PostImg, etc.)
 * to direct raw image URLs so desktop browsers/apps can display them inline.
 */
export function resolveImageUrl(url?: string): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  let trimmed = url.trim();
  if (!trimmed) return undefined;

  // 1. Extract URL if string contains BBCode [IMG]...[/IMG]
  const bbImgMatch = trimmed.match(/\[img\](.*?)\[\/img\]/i);
  if (bbImgMatch) {
    trimmed = bbImgMatch[1].trim();
  } else {
    // Extract URL if string contains RuTracker lazy-load <var title="...">
    const varMatch = trimmed.match(/<var\s+[^>]*title=["']?([^"'>\s]+)/i);
    if (varMatch) {
      trimmed = varMatch[1].trim();
    } else {
      // Extract URL if string contains HTML <img src="...">
      const htmlImgMatch = trimmed.match(/<img\s+[^>]*src=["']?([^"'>\s]+)/i);
      if (htmlImgMatch) {
        trimmed = htmlImgMatch[1].trim();
      }
    }
  }

  // Filter tracker icons/smiles/placeholders from being rendered as images
  if (
    trimmed.includes("static.rutracker.cc/smiles/") ||
    trimmed.includes("tr_oops.gif") ||
    trimmed.includes("broken_image_") ||
    trimmed.includes("spacer.gif")
  ) {
    return undefined;
  }

  // Upgrade http -> https for known hosts
  if (trimmed.startsWith("http://")) {
    trimmed = trimmed.replace(/^http:\/\//i, "https://");
  }

  // 2. FastPic Thumbnail to Big Direct Image
  // Example: https://i106.fastpic.org/thumb/2018/1121/6f/b01f9d61bc26b3bcc0b9883cc548046f.jpeg
  // Target:  https://i106.fastpic.org/big/2018/1121/6f/b01f9d61bc26b3bcc0b9883cc548046f.jpg
  if (trimmed.includes("fastpic.org/thumb/") || trimmed.includes("fastpic.ru/thumb/")) {
    return trimmed.replace(/\/thumb\//i, "/big/");
  }

  // 3. ImageBam Thumbnail to Direct Image
  // Example: https://thumbs4.imagebam.com/88/18/a8/ME1BKPS4_t.jpg
  // Target:  https://images4.imagebam.com/88/18/a8/ME1BKPS4.jpg
  if (trimmed.includes("imagebam.com/") && trimmed.includes("_t.")) {
    return trimmed.replace(/thumbs(\d+)?\.imagebam\.com/i, "images$1.imagebam.com").replace(/_t\./i, ".");
  }

  // Direct image extensions
  if (/\.(jpg|jpeg|png|gif|webp|svg)($|\?)/i.test(trimmed)) {
    return trimmed;
  }

  // 4. FastPic HTML page to direct image
  // Example: https://fastpic.org/fullview/128/2026/1001/a1cdfbd11a82467fd92e089b5516499b.jpg.html
  // Example: https://fastpic.org/view/128/2026/0929/_786ce37312f5db1807e65b45a4ae3a6d.webp.html
  if (trimmed.includes("fastpic.org/fullview/") || trimmed.includes("fastpic.org/view/") || trimmed.includes("fastpic.ru/")) {
    const match = trimmed.match(/fastpic\.(?:org|ru)\/(?:fullview|view)\/(\d+)\/(\d+)\/(\d+)\/([^/.\s]+)/i);
    if (match) {
      const [, server, year, date, hash] = match;
      const sub = hash.slice(-2);
      const extMatch = trimmed.match(/\.(webp|png|gif|jpeg|jpg)\.html/i);
      const ext = extMatch ? extMatch[1] : "jpg";
      return `https://i${server}.fastpic.org/big/${year}/${date}/${sub}/${hash}.${ext}`;
    }
  }

  // 5. ImageBan HTML page
  // Example: https://imageban.ru/show/2026/09/28/fc9753b4f16e6ed5c16b907b19991a04/jpg
  if (trimmed.includes("imageban.ru/show/")) {
    const match = trimmed.match(/imageban\.ru\/show\/(\d+)\/(\d+)\/(\d+)\/([^/.\s]+)/i);
    if (match) {
      const [, year, month, day, hash] = match;
      return `https://i4.imageban.ru/out/${year}/${month}/${day}/${hash}.jpg`;
    }
    return trimmed.replace(/\/show\//i, "/out/").replace(/\/jpg$/i, ".jpg");
  }

  // 6. PostImg HTML page
  if (trimmed.includes("postimg.cc/")) {
    return trimmed.replace(/postimg\.cc\//i, "i.postimg.cc/") + ".jpg";
  }

  // If URL ends in .html or .php and couldn't be resolved to an image, return undefined so img tag isn't broken
  if (/\.(html|htm|php)($|\?)/i.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

/** Preserves stored entries for provider candidate resolution at load time. */
export function resolveScreenshotUrls(urls?: string[] | null): string[] {
  return uniqueScreenshotUrls(urls);
}
