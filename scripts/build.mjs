import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_BASE_PATH = "/jorpago2";
const SITE_ORIGIN = "https://www.uv.es";
const OUTPUT_ROOT = path.resolve("publish", "jorpago2");
const CONTENT_ROOT = path.resolve("content");
const LOGO_PATH = `${SITE_BASE_PATH}/assets/media/2025/07/cropped-ChatGPT-Image-13-jul-2025-19_12_48-1.png`;

const navigation = [
  ["About", "about-me"],
  ["Research", "research"],
  ["Publications", "publications"],
  ["Teaching", "teaching"],
  ["Books", "books"],
  ["Theses", "theses"],
  ["Resources", "resources"],
  ["Contact", "contact"],
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function route(slug = "") {
  return slug ? `${SITE_BASE_PATH}/${slug}/` : `${SITE_BASE_PATH}/`;
}

function canonicalUrl(slug = "") {
  return `${SITE_ORIGIN}${route(slug)}`;
}

function conciseDescription(value) {
  const cleaned = value
    .replace(/\s*(?:…|\.\.\.)\s*Read more\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= 160) return cleaned;
  return `${cleaned.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(new Date(`${value}Z`));
}

function navigationHtml(activeSlug) {
  return navigation
    .map(([label, slug]) => {
      const current = activeSlug === slug ? ' aria-current="page"' : "";
      return `<a href="${route(slug)}"${current}>${label}</a>`;
    })
    .join("\n          ");
}

function personSchema() {
  return `<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Jorge Parra Gómez",
    honorificPrefix: "Dr.",
    jobTitle: "Assistant Professor",
    affiliation: {
      "@type": "CollegeOrUniversity",
      name: "Universitat de València",
      url: "https://www.uv.es/",
    },
    url: canonicalUrl(),
    email: "mailto:jorge.parra@uv.es",
    sameAs: [
      "https://www.linkedin.com/in/jorgeparragomez/",
      "https://x.com/jorpargo_",
      "https://www.researchgate.net/profile/Jorge-Parra-11",
    ],
  },
  null,
  2,
)}
</script>`;
}

function pageShell({ page, content, hasSocialImage }) {
  const isHome = page.slug === "";
  const pageTitle = isHome
    ? "Dr. Jorge Parra | Photonics and Electronics"
    : `${page.title} | Dr. Jorge Parra`;
  const description = isHome
    ? "Dr. Jorge Parra is an Assistant Professor at the University of Valencia working on integrated photonics, advanced materials and emerging devices."
    : conciseDescription(page.description);
  const socialImage = hasSocialImage
    ? `
  <meta property="og:image" content="${SITE_ORIGIN}${SITE_BASE_PATH}/assets/og.png">
  <meta property="og:image:width" content="1536">
  <meta property="og:image:height" content="1024">
  <meta property="og:image:alt" content="Dr. Jorge Parra — Photonics and Electronics">
  <meta name="twitter:card" content="summary_large_image">`
    : "";
  const mainContent = isHome
    ? homeContent(content)
    : `<header class="page-heading">
        <p class="eyebrow">Dr. Jorge Parra</p>
        <h1>${escapeHtml(page.title)}</h1>
      </header>
      <article class="page-content">
${content}
      </article>
      <p class="last-updated">Last updated <time datetime="${page.modified}">${formatDate(page.modified)}</time></p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonicalUrl(page.slug)}">
  <link rel="icon" href="${LOGO_PATH}">
  <link rel="stylesheet" href="${SITE_BASE_PATH}/assets/style.css">
  <meta name="theme-color" content="#0b1f33">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Dr. Jorge Parra">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl(page.slug)}">${socialImage}
  ${isHome ? personSchema() : ""}
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="identity" href="${route()}" aria-label="Dr. Jorge Parra — homepage">
        <img src="${LOGO_PATH}" alt="" width="52" height="52">
        <span>Dr. Jorge Parra</span>
      </a>
      <nav class="primary-nav" aria-label="Primary navigation">
          ${navigationHtml(page.slug)}
      </nav>
    </div>
  </header>
  <main id="main-content">
    ${mainContent}
  </main>
  <footer class="site-footer">
    <div>
      <p><strong>Dr. Jorge Parra</strong><br>Department of Electronic Engineering · Universitat de València</p>
      <nav aria-label="Professional profiles">
        <a href="https://www.linkedin.com/in/jorgeparragomez/">LinkedIn</a>
        <a href="https://www.researchgate.net/profile/Jorge-Parra-11">ResearchGate</a>
        <a href="https://x.com/jorpargo_">X</a>
        <a href="https://www.uv.es/uvweb/universidad/es/ficha-persona-1285950309813.html?p2=jorpago2">UV profile</a>
      </nav>
    </div>
    <p>© ${new Date().getFullYear()} Jorge Parra</p>
  </footer>
</body>
</html>
`;
}

function homeContent(content) {
  const withoutOriginalHeading = content.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, "");

  return `<section class="hero">
      <div>
        <p class="eyebrow">Photonics · Advanced materials · Emerging devices</p>
        <h1>Researching the next generation of photonic and electronic devices.</h1>
        <p class="hero-intro">I’m Jorge Parra, Assistant Professor in the Department of Electronic Engineering at the University of Valencia.</p>
        <div class="hero-actions">
          <a class="button primary" href="${route("research")}">Explore research</a>
          <a class="button secondary" href="${route("publications")}">View publications</a>
        </div>
      </div>
      <div class="hero-mark" aria-hidden="true">
        <img src="${LOGO_PATH}" alt="">
        <span>Integrated photonics</span>
        <span>Functional materials</span>
        <span>Neuromorphic computing</span>
      </div>
    </section>
    <section class="home-content" aria-label="Highlights">
${withoutOriginalHeading}
    </section>`;
}

function notFoundPage(hasSocialImage) {
  const page = {
    slug: "404",
    title: "Page not found",
    description: "The requested page could not be found.",
    modified: new Date().toISOString().slice(0, 19),
  };
  const content = `<p>The page may have moved during the migration from WordPress.</p>
<p><a class="button primary" href="${route()}">Return to the homepage</a></p>`;
  return pageShell({ page, content, hasSocialImage });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const pages = JSON.parse(await readFile(path.join(CONTENT_ROOT, "pages.json"), "utf8"));
  const socialImagePath = path.join(CONTENT_ROOT, "og.png");
  const hasSocialImage = await fileExists(socialImagePath);

  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_ROOT, "assets"), { recursive: true });
  await cp(path.join(CONTENT_ROOT, "media"), path.join(OUTPUT_ROOT, "assets", "media"), {
    recursive: true,
  });
  await cp(path.resolve("src", "style.css"), path.join(OUTPUT_ROOT, "assets", "style.css"));
  if (hasSocialImage) await cp(socialImagePath, path.join(OUTPUT_ROOT, "assets", "og.png"));

  for (const page of pages) {
    const fragmentName = page.slug || "home";
    const content = await readFile(path.join(CONTENT_ROOT, "pages", `${fragmentName}.html`), "utf8");
    const outputDirectory = page.slug ? path.join(OUTPUT_ROOT, page.slug) : OUTPUT_ROOT;
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      path.join(outputDirectory, "index.html"),
      pageShell({ page, content, hasSocialImage }),
      "utf8",
    );
  }

  const oldThesesRoute = path.join(OUTPUT_ROOT, "theases");
  await mkdir(oldThesesRoute, { recursive: true });
  await writeFile(
    path.join(oldThesesRoute, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Theses | Dr. Jorge Parra</title><link rel="canonical" href="${canonicalUrl("theses")}"><meta http-equiv="refresh" content="0; url=${route("theses")}"></head><body><p>This page moved to <a href="${route("theses")}">Theses</a>.</p></body></html>\n`,
    "utf8",
  );

  const sitemap = pages
    .map(
      (page) =>
        `  <url><loc>${canonicalUrl(page.slug)}</loc><lastmod>${page.modified.slice(0, 10)}</lastmod></url>`,
    )
    .join("\n");
  await writeFile(
    path.join(OUTPUT_ROOT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap}\n</urlset>\n`,
    "utf8",
  );
  await writeFile(
    path.join(OUTPUT_ROOT, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}${SITE_BASE_PATH}/sitemap.xml\n`,
    "utf8",
  );
  await writeFile(path.join(OUTPUT_ROOT, "404.html"), notFoundPage(hasSocialImage), "utf8");
  await writeFile(
    path.join(OUTPUT_ROOT, ".htaccess"),
    `Options -Indexes\nDirectoryIndex index.html\nErrorDocument 404 ${SITE_BASE_PATH}/404.html\nRedirect 301 ${SITE_BASE_PATH}/theases/ ${SITE_BASE_PATH}/theses/\n`,
    "utf8",
  );

  console.log(`Built ${pages.length} pages in ${OUTPUT_ROOT}.`);
}

await main();
