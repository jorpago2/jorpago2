import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const SITE_BASE_PATH = "/jorpago2";
const OUTPUT_ROOT = path.resolve("publish", "jorpago2");
const pages = JSON.parse(await readFile(path.resolve("content", "pages.json"), "utf8"));
const mergedRoutes = {
  publications: "/jorpago2/research/#publications",
  books: "/jorpago2/teaching/#books",
  theses: "/jorpago2/teaching/#theses",
};

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
    if (mergedRoutes[page.slug]) {
      assert.match(html, new RegExp(`http-equiv="refresh" content="0; url=${mergedRoutes[page.slug]}`));
      assert.doesNotMatch(html, /assets\/site\.js/);
      continue;
    }
    assert.match(html, /<script src="\/jorpago2\/assets\/site\.js\?v=3" defer><\/script>/);
    assert.doesNotMatch(html, /Last update:|Last updated|class="last-updated"/);
  }
});

test("homepage has the personal academic layout and keeps the five-image carousel", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "index.html"), "utf8");

  assert.match(html, /<article class="home-layout">/);
  assert.match(html, /class="hero-carousel"/);
  assert.doesNotMatch(html, /class="home-gallery"/);
  assert.match(html, /assets\/style\.css\?v=42/);
  assert.match(html, /<a href="\/jorpago2\/research\/">Research<\/a>/);
  assert.match(html, /<a href="\/jorpago2\/teaching\/">Teaching<\/a>/);
  assert.match(html, /<a href="\/jorpago2\/resources\/">Resources<\/a>/);
  assert.doesNotMatch(html, /class="hub-link"/);
  assert.match(html, /class="home-updates"/);
  assert.match(html, /<h2 class="visually-hidden" id="updates-title">Information<\/h2>/);
  assert.doesNotMatch(html, /Opportunities and learning tools/);
  assert.match(html, /class="information-grid"/);
  assert.equal((html.match(/class="information-entry /g) ?? []).length, 2);
  assert.match(html, /href="\/jorpago2\/new-students\/">Could research be right for you\?/);
  assert.match(html, /href="\/jorpago2\/career-strategy\/">Five principles for building a research career/);
  assert.doesNotMatch(html, /research-career decisions|>this<|ðŸ”/);
  assert.match(html, /class="information-panel simulator-information"[\s\S]*?Online simulators and tools[\s\S]*?href="https:\/\/jorpago2\.github\.io\/"/);
  assert.doesNotMatch(html, /class="update-grid"/);
  assert.doesNotMatch(html, /class="home-explore"/);
  assert.match(html, /© \d{4} Jorge Parra<\/p>/);
  assert.match(html, /<img src="\/jorpago2\/assets\/github-profile\.jpg" alt="" width="52" height="52">/);
  assert.equal((html.match(/aria-roledescription="slide"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /class="nav-group"|class="nav-submenu"/);
});

test("contact page highlights email, student projects and office location", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "contact", "index.html"), "utf8");

  assert.match(html, /class="contact-lead"/);
  assert.match(html, /class="contact-email">jorge \[dot\] parra \[at\] uv \[dot\] es/);
  assert.match(html, /class="contact-students"/);
  assert.match(html, /Potential project topics include, but are not limited to:/);
  assert.equal((html.match(/<li>\s*<strong>[^<]+<\/strong>\s*<span>[^<]+<\/span>\s*<\/li>/g) ?? []).length, 5);
  assert.match(html, /class="contact-location"/);
  assert.match(html, /class="contact-map" href="https:\/\/maps\.app\.goo\.gl\/LvbvRk8MteuCgczDA"/);
});

test("new students page presents compact research guidance", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "new-students", "index.html"), "utf8");

  assert.match(html, /class="student-orientation"/);
  assert.equal((html.match(/<li>\s*<strong>[^<]+<\/strong>/g) ?? []).length, 4);
  assert.match(html, /Claude Shannon,[\s\S]*?“Creative Thinking” \(1952\)/);
  assert.match(html, /href="\/jorpago2\/contact\/#student-projects-title"/);
  assert.doesNotMatch(html, />this<\/a>/);
});

test("PhD FAQ uses concise exclusive disclosures and official sources", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "faq", "index.html"), "utf8");

  assert.equal((html.match(/<details class="faq-item" name="phd-faq"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /<details class="faq-item" name="phd-faq" open>/);
  assert.match(html, /boe\.es\/eli\/es\/l\/2011\/06\/01\/14\/con/);
  assert.match(html, /oecd\.org\/en\/publications\/education-at-a-glance-2025/);
  assert.match(html, /href="\/jorpago2\/new-students\/"/);
  assert.doesNotMatch(html, /18-24 k|37–40 hours|wp-block-image/);
});

test("career strategy presents five concise principles and current sources", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "career-strategy", "index.html"), "utf8");

  assert.match(html, /class="career-guide"/);
  assert.equal((html.match(/<p class="career-question">/g) ?? []).length, 5);
  assert.match(html, /aneca\.es\/web\/guest\/criterios-de-evaluaci/);
  assert.match(html, /erc\.europa\.eu\/news-events\/events\/erc-grants-what-expect-2026-calls/);
  assert.match(html, /href="\/jorpago2\/research\/"/);
  assert.doesNotMatch(html, /young professor|JCR are still crucial|Without funding, there is no science/);
});

test("resources page uses a compact five-group directory", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "resources", "index.html"), "utf8");

  assert.match(html, /class="resource-directory"/);
  assert.equal((html.match(/class="resource-group /g) ?? []).length, 5);
  assert.ok(html.indexOf("resources-collections") < html.indexOf("resources-fabrication"));
  assert.doesNotMatch(html, />Others</);
  assert.doesNotMatch(html, />https?:\/\//);
  assert.equal((html.match(/class="online-tool-card"/g) ?? []).length, 2);
  assert.match(html, /href="https:\/\/jorpago2\.github\.io\/fdtd-2d-simulator\/"/);
  assert.match(html, /href="https:\/\/jorpago2\.github\.io\/drift-difussion-simulator\/"/);
});

test("research and teaching consolidate their former child pages", async () => {
  const research = await readFile(path.join(OUTPUT_ROOT, "research", "index.html"), "utf8");
  const teaching = await readFile(path.join(OUTPUT_ROOT, "teaching", "index.html"), "utf8");

  assert.match(research, /id="overview"[\s\S]*?id="publications"/);
  assert.equal((research.match(/<details class="publication-year wp-block-details" name="publication-years"/g) ?? []).length, 9);
  assert.equal((research.match(/name="publication-years" open/g) ?? []).length, 1);
  assert.match(research, /10\.1088\/2515-7647\/ae6004/);
  assert.match(teaching, /id="courses"[\s\S]*?id="books"[\s\S]*?id="theses"/);
  assert.match(teaching, /Teoría de circuitos eléctricos/);
  assert.match(teaching, /Energy-efficient ITO microheaters/);
});

test("about page places the expanded carousel beside the biography", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "about-me", "index.html"), "utf8");
  const css = await readFile(path.resolve("src", "style.css"), "utf8");
  const carousel = html.match(/<div class="wp-block-media-text__media about-carousel">[\s\S]*?<\/ul>/)?.[0] ?? "";

  assert.match(carousel, /class="slide-profile ms-image"/);
  assert.match(carousel, /src="\/jorpago2\/assets\/media\/2025\/08\/Imagen1\.jpg"[^>]*alt="Jorge Parra"/);
  assert.equal((carousel.match(/aria-roledescription="slide"/g) ?? []).length, 13);
  assert.doesNotMatch(html, /id="highlights"|Selected moments/);
  assert.match(css, /\.about-biography \.wp-block-media-text \{[\s\S]*?grid-template-columns: minmax\(20rem/);
  assert.match(css, /\.about-carousel \.carousel-controls \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;/);
});

test("interior pages begin directly with content and keep an accessible page title", async () => {
  for (const slug of pages.map((page) => page.slug).filter((slug) => slug && !mergedRoutes[slug])) {
    const html = await readFile(path.join(OUTPUT_ROOT, slug, "index.html"), "utf8");
    assert.match(html, /<h1 class="visually-hidden">[^<]+<\/h1>\s*<div class="page-content">/);
    assert.doesNotMatch(html, /class="page-heading"|class="section-index"|On this page|class="page-description"/);
  }
});

test("carousels use their original proportions and compact mobile controls", async () => {
  const script = await readFile(path.resolve("src", "site.js"), "utf8");
  const css = await readFile(path.resolve("src", "style.css"), "utf8");

  assert.match(script, /--carousel-aspect/);
  assert.match(css, /aspect-ratio: var\(--carousel-aspect/);
  assert.match(css, /\.metaslider\.carousel-ready \.slides li \{[\s\S]*?opacity: 0;[\s\S]*?transition: opacity 0\.8s ease/);
  assert.match(css, /\.hero-carousel \.carousel-controls \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;/);
  assert.match(css, /\.carousel-dots \{\s*display: none;/);
  assert.match(css, /\.carousel-status \{[\s\S]*position: static;/);
});

test("header and page content share the same horizontal alignment", async () => {
  const css = await readFile(path.resolve("src", "style.css"), "utf8");

  assert.match(css, /\.header-inner \{[\s\S]*?width: min\(calc\(100% - 5rem\), var\(--max-width\)\);/);
  assert.match(css, /\.home-layout,[\s\S]*?width: min\(calc\(100% - 5rem\), var\(--max-width\)\);/);
  assert.match(css, /\.home-intro \{[\s\S]*?padding: clamp\([^;]+\) 0;/);
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
  const oldThesesRedirect = await readFile(path.join(OUTPUT_ROOT, "theases", "index.html"), "utf8");
  const publicationsRedirect = await readFile(path.join(OUTPUT_ROOT, "publications", "index.html"), "utf8");
  const booksRedirect = await readFile(path.join(OUTPUT_ROOT, "books", "index.html"), "utf8");
  const thesesRedirect = await readFile(path.join(OUTPUT_ROOT, "theses", "index.html"), "utf8");
  const sitemap = await readFile(path.join(OUTPUT_ROOT, "sitemap.xml"), "utf8");
  const mediaFiles = await readdir(path.join(OUTPUT_ROOT, "assets", "media"), {
    recursive: true,
  });

  assert.match(publicationsRedirect, /url=\/jorpago2\/research\/#publications/);
  assert.match(booksRedirect, /url=\/jorpago2\/teaching\/#books/);
  assert.match(thesesRedirect, /url=\/jorpago2\/teaching\/#theses/);
  assert.match(oldThesesRedirect, /url=\/jorpago2\/teaching\/#theses/);
  assert.equal((sitemap.match(/<url>/g) ?? []).length, pages.length - Object.keys(mergedRoutes).length);
  assert.doesNotMatch(sitemap, /<loc>[^<]+\/(?:publications|books|theses)\/<\/loc>/);
  assert.equal(mediaFiles.filter((file) => /\.(?:png|jpe?g)$/i.test(file)).length, 59);
});
