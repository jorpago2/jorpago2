import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_BASE_PATH = "/jorpago2";
const SITE_ORIGIN = "https://www.uv.es";
const OUTPUT_ROOT = path.resolve("publish", "jorpago2");
const CONTENT_ROOT = path.resolve("content");
const LOGO_PATH = `${SITE_BASE_PATH}/assets/media/2025/07/cropped-ChatGPT-Image-13-jul-2025-19_12_48-1.png`;
const PROFILE_IMAGE_PATH = `${SITE_BASE_PATH}/assets/github-profile.jpg`;

const navigation = [
  { label: "About me", slug: "about-me" },
  {
    label: "Research",
    children: [
      ["Overview", "research"],
      ["Publications", "publications"],
    ],
  },
  {
    label: "Teaching",
    children: [
      ["Courses", "teaching"],
      ["Books", "books"],
      ["Theses", "theses"],
    ],
  },
  {
    label: "Resources",
    children: [
      ["Links", "resources"],
      ["Simulators ↗", "https://jorpago2.github.io/"],
    ],
  },
  { label: "Contact", slug: "contact" },
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

function stripHtml(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&(?:nbsp|#160);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headingId(value) {
  return stripHtml(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function addHeadingIds(content) {
  return content.replace(/<(h[23])([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag, attributes, inner) => {
    if (/\sid=/i.test(attributes)) return match;
    return `<${tag}${attributes} id="${headingId(inner)}">${inner}</${tag}>`;
  });
}

function removeSpacers(content) {
  return content.replace(/<div[^>]*class="[^"]*wp-block-spacer[^"]*"[^>]*><\/div>/gi, "");
}

function preparePageContent(slug, sourceContent) {
  let content = sourceContent;

  if (slug === "about-me") {
    const separators = [...content.matchAll(/<hr class="wp-block-separator[^>]*\/>/g)];
    if (separators.length >= 2) {
      const first = separators[0];
      const second = separators[1];
      const carousel = content.slice(0, first.index).trim();
      const biography = content.slice(first.index + first[0].length, second.index).trim();
      const career = content.slice(second.index + second[0].length).trim();
      const portrait = biography.match(/<figure class="wp-block-media-text__media"><img\b[^>]*><\/figure>/i)?.[0];
      const portraitImage = portrait
        ?.match(/<img\b[^>]*>/i)?.[0]
        .replace(/alt="[^"]*"/i, 'alt="Jorge Parra"');
      const carouselWithPortrait = portraitImage
        ? carousel
            .replace('style="display: block; width: 100%;"', 'style="display: none; width: 100%;"')
            .replace(
              /(<ul class='slides'>)/,
              `$1
                <li style="display: block; width: 100%;" class="slide-profile ms-image" aria-roledescription="slide" data-slide-type="image">${portraitImage}<div class="caption-wrap"><div class="caption"><div>Jorge Parra</div></div></div></li>`,
            )
        : carousel;
      const biographyWithCarousel = portrait
        ? biography.replace(
            portrait,
            `<div class="wp-block-media-text__media about-carousel">${carouselWithPortrait}</div>`,
          )
        : biography;
      content = `<section class="about-biography">
<h2 id="biography">Biography</h2>
${biographyWithCarousel}
</section>
${career}`;
    }
  }

  if (slug === "publications" || slug === "teaching") {
    const firstHeading = content.search(/<h2\b/i);
    if (firstHeading > 0) {
      const carousel = content.slice(0, firstHeading).trim();
      const remainder = content.slice(firstHeading).trim();
      const isPublications = slug === "publications";
      content = `<section class="page-showcase">
<div class="section-heading"><p class="eyebrow">${isPublications ? "Selected devices" : "Learning and outreach"}</p><h2 id="${isPublications ? "research-visuals" : "teaching-in-practice"}">${isPublications ? "Research visuals" : "Teaching in practice"}</h2></div>
${carousel}
</section>
${remainder}`;
    }
  }

  if (slug === "research") {
    content = content.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i, '<p class="research-statement">$1</p>');
  }

  if (slug === "teaching") {
    content = content.replace(/<details\b(?![^>]*\sid=)/i, '<details id="previous-years"');
  }

  return addHeadingIds(removeSpacers(content));
}

function navigationHtml(activeSlug) {
  return navigation
    .map((item) => {
      if (item.slug) {
        const current = activeSlug === item.slug ? ' aria-current="page"' : "";
        return `<a href="${route(item.slug)}"${current}>${item.label}</a>`;
      }

      const groupIsCurrent = item.children.some(([, slug]) => slug === activeSlug);
      const links = item.children
        .map(([label, slug]) => {
          const current = activeSlug === slug ? ' aria-current="page"' : "";
          const href = slug.startsWith("https://") ? slug : route(slug);
          return `<a href="${href}"${current}>${label}</a>`;
        })
        .join("\n              ");

      return `<details class="nav-group"${groupIsCurrent ? ' data-current="true"' : ""}>
            <summary>${item.label}</summary>
            <div class="nav-submenu">
              ${links}
            </div>
          </details>`;
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
    : `<article class="page-layout page-${page.slug}">
        <h1 class="visually-hidden">${escapeHtml(page.title)}</h1>
        <div class="page-content">
${preparePageContent(page.slug, content)}
        </div>
      </article>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonicalUrl(page.slug)}">
  <link rel="icon" href="${LOGO_PATH}">
  <link rel="stylesheet" href="${SITE_BASE_PATH}/assets/style.css?v=28">
  <meta name="theme-color" content="#f6f7f3">
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
`;
}

function homeContent(content) {
  const withoutHeading = content.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, "");
  const notices = [...withoutHeading.matchAll(/<p class="[^"]*has-background[^"]*">[\s\S]*?<\/p>/g)].map(
    (match) => match[0],
  );
  let gallery = withoutHeading;
  for (const notice of notices) gallery = gallery.replace(notice, "");
  gallery = gallery.replace(
    /<div class="wp-block-group[^"]*">[\s\S]*?<p[^>]*>Last update:<\/p>[\s\S]*?<\/time><\/div><\/div>/i,
    "",
  );

  return `<article class="home-layout">
      <section class="home-intro" aria-labelledby="home-title">
        <div class="home-intro-copy">
          <p class="eyebrow">Assistant Professor · Universitat de València</p>
          <h1 id="home-title">Research and teaching in photonics and electronic engineering.</h1>
          <p class="home-lead">My work focuses on integrated photonics, functional materials, emerging devices and neuromorphic hardware. This website collects my research, publications, teaching and academic resources.</p>
          <div class="page-actions">
            <a class="button primary" href="${route("research")}">Research</a>
            <a class="button" href="${route("about-me")}">About me</a>
          </div>
        </div>
        <aside class="hero-carousel" aria-label="Research and teaching gallery">
${removeSpacers(gallery)}
        </aside>
      </section>
      <section class="home-updates" aria-labelledby="updates-title">
        <div class="section-heading"><p class="eyebrow">Information</p><h2 id="updates-title">For students and early-career researchers</h2></div>
        <div class="update-grid">
          ${notices.join("\n          ")}
        </div>
      </section>
    </article>`;
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
  await cp(path.resolve("src", "site.js"), path.join(OUTPUT_ROOT, "assets", "site.js"));
  await cp(path.join(CONTENT_ROOT, "github-profile.jpg"), path.join(OUTPUT_ROOT, "assets", "github-profile.jpg"));
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
