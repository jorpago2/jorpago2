import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_BASE_PATH = "/jorpago2";
const SITE_ORIGIN = "https://www.uv.es";
const IS_PREVIEW = process.env.SITE_PREVIEW === "true";
const OUTPUT_ROOT = path.resolve("publish", "jorpago2");
const CONTENT_ROOT = path.resolve("content");
const LOGO_PATH = `${SITE_BASE_PATH}/assets/media/2025/07/cropped-ChatGPT-Image-13-jul-2025-19_12_48-1.png`;
const PROFILE_IMAGE_PATH = `${SITE_BASE_PATH}/assets/github-profile.jpg`;

const navigation = [
  { label: "About me", slug: "about-me" },
  { label: "Research", slug: "research" },
  { label: "Teaching", slug: "teaching" },
  { label: "Resources", slug: "resources" },
  { label: "Contact", slug: "contact" },
];

const mergedRoutes = {
  publications: { target: "research", anchor: "publications" },
  books: { target: "teaching", anchor: "books" },
  theses: { target: "teaching", anchor: "theses" },
};

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

function navigationHtml(activeSlug) {
  return navigation
    .map((item) => {
      const current = activeSlug === item.slug ? ' aria-current="page"' : "";
      return `<a href="${route(item.slug)}"${current}>${item.label}</a>`;
    })
    .join("\n          ");
}

function schemaScript(value) {
  return `<script type="application/ld+json">
${JSON.stringify(value, null, 2)}
</script>`;
}

function personSchemaData() {
  return {
    "@type": "Person",
    "@id": `${canonicalUrl("about-me")}#person`,
    name: "Jorge Parra Gómez",
    honorificPrefix: "Dr.",
    jobTitle: "Assistant Professor",
    description:
      "Assistant Professor researching integrated photonics, functional materials, emerging devices and neuromorphic hardware.",
    image: `${SITE_ORIGIN}${PROFILE_IMAGE_PATH}`,
    url: canonicalUrl("about-me"),
    email: "mailto:jorge.parra@uv.es",
    worksFor: {
      "@type": "CollegeOrUniversity",
      name: "Universitat de València",
      url: "https://www.uv.es/",
    },
    knowsAbout: [
      "Integrated photonics",
      "Functional materials",
      "Electronic engineering",
      "Emerging electronic and photonic devices",
      "Neuromorphic hardware",
    ],
    sameAs: [
      "https://orcid.org/0000-0003-4610-3411",
      "https://scholar.google.es/citations?user=5kYBpXIAAAAJ&hl=en",
      "https://www.linkedin.com/in/jorgeparragomez/",
      "https://www.researchgate.net/profile/Jorge-Parra-11",
      "https://x.com/jorpargo_",
      "https://www.uv.es/uvweb/universidad/es/ficha-persona-1285950309813.html?p2=jorpago2",
    ],
  };
}

function structuredData(page, pageTitle, description) {
  const person = personSchemaData();

  if (page.slug === "") {
    return schemaScript({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${canonicalUrl()}#website`,
          name: "Dr. Jorge Parra — Photonics and Electronics",
          url: canonicalUrl(),
          description,
          inLanguage: "en",
          author: { "@id": person["@id"] },
        },
        person,
      ],
    });
  }

  if (page.slug === "about-me") {
    return schemaScript({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "@id": `${canonicalUrl(page.slug)}#profile`,
      url: canonicalUrl(page.slug),
      name: pageTitle,
      description,
      dateModified: page.modified,
      inLanguage: "en",
      mainEntity: person,
    });
  }

  return "";
}

function externalLinksInNewTab(html) {
  return html.replace(/<a\b(?=[^>]*\bhref="https?:\/\/)[^>]*>/gi, (anchor) => {
    let updated = /\starget="[^"]*"/i.test(anchor)
      ? anchor.replace(/\starget="[^"]*"/i, ' target="_blank"')
      : anchor.replace(/>$/, ' target="_blank">');
    if (!/\bnoopener\b/i.test(updated) || !/\bnoreferrer\b/i.test(updated)) {
      updated = /\srel="/i.test(updated)
        ? updated.replace(/\srel="([^"]*)"/i, ' rel="$1 noopener noreferrer"')
        : updated.replace(/>$/, ' rel="noopener noreferrer">');
    }
    return updated;
  });
}

function pageShell({ page, content }) {
  const isHome = page.slug === "";
  const pageTitle = page.seoTitle || `${page.title} | Dr. Jorge Parra`;
  const description = conciseDescription(page.description);
  const mainContent = isHome
    ? content
    : `<article class="page-layout page-${page.slug}">
        <h1 class="visually-hidden">${escapeHtml(page.title)}</h1>
        <div class="page-content">
${content}
        </div>
      </article>`;

  return externalLinksInNewTab(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="author" content="Jorge Parra Gómez">
  <meta name="robots" content="${IS_PREVIEW ? "noindex, nofollow, noarchive" : "index, follow, max-image-preview:large"}">
  <link rel="canonical" href="${canonicalUrl(page.slug)}">
  <link rel="icon" href="${LOGO_PATH}">
  <link rel="stylesheet" href="${SITE_BASE_PATH}/assets/style.css?v=48">
  <meta name="theme-color" content="#f6f7f3">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Dr. Jorge Parra">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl(page.slug)}">
  <meta property="og:image" content="${SITE_ORIGIN}${SITE_BASE_PATH}/assets/og.png">
  <meta property="og:image:width" content="1536">
  <meta property="og:image:height" content="1024">
  <meta property="og:image:alt" content="Dr. Jorge Parra — Photonics and Electronics">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${SITE_ORIGIN}${SITE_BASE_PATH}/assets/og.png">
  ${structuredData(page, pageTitle, description)}
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="identity" href="${route()}" aria-label="Dr. Jorge Parra — homepage">
        <img src="${PROFILE_IMAGE_PATH}" alt="" width="52" height="52">
        <span class="identity-copy"><strong>Jorge Parra</strong><small>Assistant Professor at University of Valencia · Photonics · Electronics</small></span>
      </a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation">Menu</button>
      <nav class="primary-nav" id="primary-navigation" aria-label="Primary navigation">
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
      <p class="footer-copy">© ${new Date().getFullYear()} Jorge Parra</p>
    </div>
  </footer>
  <script src="${SITE_BASE_PATH}/assets/site.js?v=3" defer></script>
</body>
</html>
`);
}

function notFoundPage() {
  const page = {
    slug: "404",
    title: "Page not found",
    description: "The requested page could not be found.",
  };
  const content = `<p>The page may have moved during the migration from WordPress.</p>
<p><a class="button primary" href="${route()}">Return to the homepage</a></p>`;
  return pageShell({ page, content });
}

function redirectPage(page, destination) {
  const target = `${route(destination.target)}#${destination.anchor}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)} | Dr. Jorge Parra</title>
  <meta name="description" content="${escapeHtml(conciseDescription(page.description))}">
  <link rel="canonical" href="${canonicalUrl(destination.target)}">
  <meta http-equiv="refresh" content="0; url=${target}">
</head>
<body><p>This content moved to <a href="${target}">${escapeHtml(page.title)}</a>.</p></body>
</html>\n`;
}

async function main() {
  const pages = JSON.parse(await readFile(path.join(CONTENT_ROOT, "pages.json"), "utf8"));
  const socialImagePath = path.join(CONTENT_ROOT, "og.png");

  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_ROOT, "assets"), { recursive: true });
  await cp(path.join(CONTENT_ROOT, "media"), path.join(OUTPUT_ROOT, "assets", "media"), {
    recursive: true,
  });
  await cp(path.resolve("src", "style.css"), path.join(OUTPUT_ROOT, "assets", "style.css"));
  await cp(path.resolve("src", "site.js"), path.join(OUTPUT_ROOT, "assets", "site.js"));
  await cp(path.join(CONTENT_ROOT, "github-profile.jpg"), path.join(OUTPUT_ROOT, "assets", "github-profile.jpg"));
  await cp(socialImagePath, path.join(OUTPUT_ROOT, "assets", "og.png"));

  for (const page of pages) {
    const outputDirectory = page.slug ? path.join(OUTPUT_ROOT, page.slug) : OUTPUT_ROOT;
    await mkdir(outputDirectory, { recursive: true });
    const redirect = mergedRoutes[page.slug];
    const fragmentName = page.slug || "home";
    const content = redirect
      ? ""
      : await readFile(path.join(CONTENT_ROOT, "pages", `${fragmentName}.html`), "utf8");
    await writeFile(
      path.join(outputDirectory, "index.html"),
      redirect ? redirectPage(page, redirect) : pageShell({ page, content }),
      "utf8",
    );
  }

  const oldThesesRoute = path.join(OUTPUT_ROOT, "theases");
  await mkdir(oldThesesRoute, { recursive: true });
  await writeFile(
    path.join(oldThesesRoute, "index.html"),
    redirectPage({ title: "Theses", description: "Supervised theses." }, mergedRoutes.theses),
    "utf8",
  );

  const sitemap = pages
    .filter((page) => !mergedRoutes[page.slug])
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
    IS_PREVIEW
      ? "User-agent: *\nDisallow: /\n"
      : `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}${SITE_BASE_PATH}/sitemap.xml\n`,
    "utf8",
  );
  await writeFile(path.join(OUTPUT_ROOT, "404.html"), notFoundPage(), "utf8");
  await writeFile(
    path.join(OUTPUT_ROOT, ".htaccess"),
    `Options -Indexes\nDirectoryIndex index.html\nErrorDocument 404 ${SITE_BASE_PATH}/404.html\nRedirect 301 ${SITE_BASE_PATH}/publications/ ${SITE_BASE_PATH}/research/#publications\nRedirect 301 ${SITE_BASE_PATH}/books/ ${SITE_BASE_PATH}/teaching/#books\nRedirect 301 ${SITE_BASE_PATH}/theses/ ${SITE_BASE_PATH}/teaching/#theses\nRedirect 301 ${SITE_BASE_PATH}/theases/ ${SITE_BASE_PATH}/teaching/#theses\n`,
    "utf8",
  );

  console.log(`Built ${pages.length - Object.keys(mergedRoutes).length} pages and ${Object.keys(mergedRoutes).length + 1} redirects in ${OUTPUT_ROOT}.`);
}

await main();
