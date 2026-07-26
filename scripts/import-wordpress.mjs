import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WORDPRESS_ORIGIN = "https://jorpago2.blogs.uv.es";
const API_ROOT = `${WORDPRESS_ORIGIN}/wp-json/wp/v2`;
const SITE_BASE_PATH = "/jorpago2";
const CONTENT_ROOT = path.resolve("content");
const PAGE_ROOT = path.join(CONTENT_ROOT, "pages");
const MEDIA_ROOT = path.join(CONTENT_ROOT, "media");

async function fetchChecked(url, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "jorge-parra-static-site-migrator/1.0" },
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Could not fetch ${url}: ${lastError.message}`);
}

async function fetchJson(url) {
  return (await fetchChecked(url)).json();
}

function decodeHtml(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function textFromHtml(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function pageSlug(wordpressSlug) {
  if (wordpressSlug === "main") return "";
  if (wordpressSlug === "theases") return "theses";
  return wordpressSlug;
}

function mediaRelativePath(sourceUrl) {
  const marker = "/files/";
  const pathname = new URL(sourceUrl).pathname;
  const markerIndex = pathname.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(`Unexpected media URL: ${sourceUrl}`);
  }

  return decodeURIComponent(pathname.slice(markerIndex + marker.length));
}

function urlPath(relativePath) {
  return relativePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function allMediaUrls(media) {
  const urls = [media.source_url];

  for (const size of Object.values(media.media_details?.sizes ?? {})) {
    if (size.source_url) urls.push(size.source_url);
  }

  return urls;
}

function improveContent(html, mediaUrlMap, altTextByUrl) {
  let improved = html
    .replace(/\s+srcset=("[^"]*"|'[^']*')/gi, "")
    .replace(/\s+sizes=("[^"]*"|'[^']*')/gi, "")
    .replace(/\s+data-(?:id|type)=("[^"]*"|'[^']*')/gi, "");

  for (const [remoteUrl, localUrl] of mediaUrlMap) {
    improved = improved.replaceAll(remoteUrl, localUrl);
  }

  improved = improved
    .replace(/https?:\/\/jorpago2\.blogs\.uv\.es/gi, SITE_BASE_PATH)
    .replaceAll(`${SITE_BASE_PATH}/theases/`, `${SITE_BASE_PATH}/theses/`);

  improved = improved.replace(/<img\b[^>]*>/gi, (imageTag) => {
    const sourceMatch = imageTag.match(/\ssrc=(?:"([^"]+)"|'([^']+)')/i);
    const titleMatch = imageTag.match(/\stitle=(?:"([^"]*)"|'([^']*)')/i);
    const source = sourceMatch?.[1] ?? sourceMatch?.[2] ?? "";
    const fallback = decodeHtml(
      titleMatch?.[1] ??
        titleMatch?.[2] ??
        source.split("/").pop()?.replace(/[-_]+/g, " ") ??
        "Image",
    ).replace(/\.[a-z0-9]+$/i, "");
    const altText = altTextByUrl.get(source) || fallback;
    const escapedAlt = altText.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

    if (/\salt=(?:""|'')/i.test(imageTag)) {
      return imageTag.replace(/\salt=(?:""|'')/i, ` alt="${escapedAlt}"`);
    }

    if (!/\salt=/i.test(imageTag)) {
      return imageTag.replace(/>$/, ` alt="${escapedAlt}">`);
    }

    return imageTag;
  });

  return `${improved.trim()}\n`;
}

async function downloadMedia(mediaItems) {
  const queue = [...mediaItems];

  async function worker() {
    while (queue.length > 0) {
      const media = queue.shift();
      const relativePath = mediaRelativePath(media.source_url);
      const destination = path.join(MEDIA_ROOT, relativePath);
      const bytes = Buffer.from(await (await fetchChecked(media.source_url)).arrayBuffer());
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
  }

  await Promise.all(Array.from({ length: 6 }, () => worker()));
}

async function main() {
  await mkdir(PAGE_ROOT, { recursive: true });
  await mkdir(MEDIA_ROOT, { recursive: true });

  const [pages, mediaItems] = await Promise.all([
    fetchJson(`${API_ROOT}/pages?per_page=100&orderby=date&order=asc`),
    fetchJson(`${API_ROOT}/media?per_page=100`),
  ]);

  if (pages.length !== 12 || mediaItems.length !== 59) {
    throw new Error(
      `Unexpected WordPress inventory: ${pages.length} pages, ${mediaItems.length} media items`,
    );
  }

  const mediaUrlMap = new Map();
  const altTextByUrl = new Map();

  for (const media of mediaItems) {
    const relativePath = mediaRelativePath(media.source_url);
    const localUrl = `${SITE_BASE_PATH}/assets/media/${urlPath(relativePath)}`;
    const altText = media.alt_text || textFromHtml(media.title.rendered);

    for (const remoteUrl of allMediaUrls(media)) {
      mediaUrlMap.set(remoteUrl, localUrl);
    }
    altTextByUrl.set(localUrl, altText);
  }

  await downloadMedia(mediaItems);

  const pageIndex = [];

  for (const page of pages) {
    const slug = pageSlug(page.slug);
    const fileName = slug || "home";
    const content = improveContent(page.content.rendered, mediaUrlMap, altTextByUrl);
    const plainText = textFromHtml(page.content.rendered);

    await writeFile(path.join(PAGE_ROOT, `${fileName}.html`), content, "utf8");
    pageIndex.push({
      id: page.id,
      slug,
      originalSlug: page.slug,
      title: decodeHtml(page.title.rendered),
      description: textFromHtml(page.excerpt.rendered) || plainText.slice(0, 170),
      modified: page.modified,
      source: page.link,
    });
  }

  await writeFile(
    path.join(CONTENT_ROOT, "pages.json"),
    `${JSON.stringify(pageIndex, null, 2)}\n`,
    "utf8",
  );

  console.log(`Imported ${pages.length} pages and ${mediaItems.length} images.`);
}

await main();
