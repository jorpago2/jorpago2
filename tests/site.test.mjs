import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const SITE_BASE_PATH = "/jorpago2";
const OUTPUT_ROOT = path.resolve("publish", "jorpago2");
const pages = JSON.parse(await readFile(path.resolve("content", "pages.json"), "utf8"));

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function outputFileForUrl(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split(/[?#]/, 1)[0]);
  const relativePath = cleanPath.replace(new RegExp(`^${SITE_BASE_PATH}/?`), "");

  if (!relativePath) return path.join(OUTPUT_ROOT, "index.html");
  if (path.extname(relativePath)) return path.join(OUTPUT_ROOT, relativePath);
  return path.join(OUTPUT_ROOT, relativePath, "index.html");
}

test("all imported pages are built with metadata", async () => {
  assert.equal(pages.length, 12);

  for (const page of pages) {
    const outputFile = path.join(OUTPUT_ROOT, page.slug, "index.html");
    const html = await readFile(outputFile, "utf8");
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/www\.uv\.es\/jorpago2\//);
    assert.doesNotMatch(html, /jorpago2\.blogs\.uv\.es/);
    assert.doesNotMatch(html, /<script[^>]+src="https?:/i);
    assert.match(html, /<script src="\/jorpago2\/assets\/site\.js\?v=3" defer><\/script>/);
  }
});

test("homepage has the personal notebook layout and keeps the five-image carousel", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "index.html"), "utf8");

  assert.match(html, /<article class="home-layout">/);
  assert.match(html, /class="profile-card"/);
  assert.match(html, /assets\/media\/2025\/08\/Imagen1\.jpg/);
  assert.match(html, /assets\/style\.css\?v=6/);
  assert.match(html, /class="home-updates"/);
  assert.match(html, /class="home-explore"/);
  assert.match(html, /<img src="\/jorpago2\/assets\/github-profile\.jpg" alt="" width="52" height="52">/);
  assert.equal((html.match(/aria-roledescription="slide"/g) ?? []).length, 5);
  assert.equal((html.match(/<details class="nav-group"/g) ?? []).length, 2);
});

test("editorial section links point to headings on the same page", async () => {
  for (const slug of ["about-me", "research", "publications", "teaching"]) {
    const html = await readFile(path.join(OUTPUT_ROOT, slug, "index.html"), "utf8");
    const index = html.match(/<nav class="section-index"[\s\S]*?<\/nav>/)?.[0] ?? "";

    assert.notEqual(index, "", `${slug} is missing its section index`);
    for (const match of index.matchAll(/href="#([^"]+)"/g)) {
      assert.match(html, new RegExp(`id="${match[1]}"`), `${slug} is missing #${match[1]}`);
    }
  }
});

test("carousels use their original proportions and compact mobile controls", async () => {
  const script = await readFile(path.resolve("src", "site.js"), "utf8");
  const css = await readFile(path.resolve("src", "style.css"), "utf8");

  assert.match(script, /--carousel-aspect/);
  assert.match(css, /aspect-ratio: var\(--carousel-aspect/);
  assert.match(css, /\.carousel-dots \{\s*display: none;/);
  assert.match(css, /\.carousel-status \{[\s\S]*position: static;/);
});

test("local links and assets resolve", async () => {
  for (const page of pages) {
    const html = await readFile(path.join(OUTPUT_ROOT, page.slug, "index.html"), "utf8");
    const urls = [
      ...html.matchAll(/(?:href|src)="(\/jorpago2(?:\/[^"#?]*)?)/g),
    ].map((match) => match[1]);

    for (const url of new Set(urls)) {
      assert.equal(await exists(outputFileForUrl(url)), true, `Missing target for ${url}`);
    }
  }
});

test("migrated content images have alternative text", async () => {
  const fragments = await readdir(path.resolve("content", "pages"));

  for (const fragment of fragments) {
    const html = await readFile(path.resolve("content", "pages", fragment), "utf8");
    for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
      assert.match(image[0], /\salt="[^"]+"/i, `${fragment} contains an image without alt text`);
    }
  }
});

test("legacy route redirects and sitemap lists every page", async () => {
  const redirect = await readFile(path.join(OUTPUT_ROOT, "theases", "index.html"), "utf8");
  const sitemap = await readFile(path.join(OUTPUT_ROOT, "sitemap.xml"), "utf8");
  const mediaFiles = await readdir(path.join(OUTPUT_ROOT, "assets", "media"), {
    recursive: true,
  });

  assert.match(redirect, /url=\/jorpago2\/theses\//);
  assert.equal((sitemap.match(/<url>/g) ?? []).length, pages.length);
  assert.equal(mediaFiles.filter((file) => /\.(?:png|jpe?g)$/i.test(file)).length, 59);
});
