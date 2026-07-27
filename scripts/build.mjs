import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_BASE_PATH = "/jorpago2";
const SITE_ORIGIN = "https://www.uv.es";
const IS_PREVIEW = process.env.SITE_PREVIEW === "true";
const OUTPUT_ROOT = path.resolve("publish", "jorpago2");
const CONTENT_ROOT = path.resolve("content");
const LOGO_PATH = `${SITE_BASE_PATH}/assets/media/2025/07/cropped-ChatGPT-Image-13-jul-2025-19_12_48-1.png`;
const PROFILE_IMAGE_PATH = `${SITE_BASE_PATH}/assets/github-profile.jpg`;
const PERSON_ID = `${SITE_ORIGIN}${SITE_BASE_PATH}/about-me/#person`;

const navigationSlugs = ["about-me", "research", "teaching", "resources", "contact"];

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

function route(slug = "", locale) {
  const localePath = locale.path ? `${SITE_BASE_PATH}/${locale.path}` : SITE_BASE_PATH;
  return slug ? `${localePath}/${slug}/` : `${localePath}/`;
}

function canonicalUrl(slug = "", locale) {
  return `${SITE_ORIGIN}${route(slug, locale)}`;
}

function conciseDescription(value) {
  const cleaned = value
    .replace(/\s*(?:…|\.\.\.)\s*Read more\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= 160) return cleaned;
  return `${cleaned.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

function navigationHtml(activeSlug, locale, strings) {
  return navigationSlugs
    .map((slug) => {
      const current = activeSlug === slug ? ' aria-current="page"' : "";
      return `<a href="${route(slug, locale)}"${current}>${escapeHtml(strings.navigation[slug])}</a>`;
    })
    .join("\n          ");
}

function alternateLinks(slug, localeBundles) {
  const available = localeBundles.filter(({ pagesBySlug }) => pagesBySlug.has(slug));
  if (available.length < 2) return "";

  const links = available.map(
    ({ locale }) =>
      `  <link rel="alternate" hreflang="${locale.code}" href="${canonicalUrl(slug, locale)}">`,
  );
  const defaultBundle = available.find(({ locale }) => locale.isDefault);
  if (defaultBundle) {
    links.push(
      `  <link rel="alternate" hreflang="x-default" href="${canonicalUrl(slug, defaultBundle.locale)}">`,
    );
  }
  return links.join("\n");
}

function languageSwitcherHtml(slug, locale, strings, localeBundles) {
  const available = localeBundles.filter(({ pagesBySlug }) => pagesBySlug.has(slug));
  if (available.length < 2) return "";

  const links = available
    .map(({ locale: option }) => {
      const current = option.code === locale.code ? ' aria-current="page"' : "";
      return `<a href="${route(slug, option)}" lang="${option.code}"${current}>${escapeHtml(option.label)}</a>`;
    })
    .join("\n          ");
  return `<nav class="language-nav" aria-label="${escapeHtml(strings.languageNavigation)}">\n          ${links}\n      </nav>`;
}

function schemaScript(value) {
  return `<script type="application/ld+json">
${JSON.stringify(value, null, 2)}
</script>`;
}

function personSchemaData(strings) {
  return {
    "@type": "Person",
    "@id": PERSON_ID,
    name: "Jorge Parra Gómez",
    honorificPrefix: "Dr.",
    jobTitle: strings.person.jobTitle,
    description: strings.person.description,
    image: `${SITE_ORIGIN}${PROFILE_IMAGE_PATH}`,
    url: `${SITE_ORIGIN}${SITE_BASE_PATH}/about-me/`,
    email: "mailto:jorge.parra@uv.es",
    worksFor: {
      "@type": "CollegeOrUniversity",
      name: "Universitat de València",
      url: "https://www.uv.es/",
    },
    knowsAbout: strings.person.knowsAbout,
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

function structuredData(page, pageTitle, description, locale, strings) {
  const person = personSchemaData(strings);

  if (page.slug === "") {
    return schemaScript({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${canonicalUrl("", locale)}#website`,
          name: strings.siteName,
          url: canonicalUrl("", locale),
          description,
          inLanguage: locale.code,
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
      "@id": `${canonicalUrl(page.slug, locale)}#profile`,
      url: canonicalUrl(page.slug, locale),
      name: pageTitle,
      description,
      dateModified: page.modified,
      inLanguage: locale.code,
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

function pageShell({ page, content, locale, strings, localeBundles }) {
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
<html lang="${locale.code}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="author" content="Jorge Parra Gómez">
  <meta name="robots" content="${IS_PREVIEW ? "noindex, nofollow, noarchive" : "index, follow, max-image-preview:large"}">
  <link rel="canonical" href="${canonicalUrl(page.slug, locale)}">
${alternateLinks(page.slug, localeBundles)}
  <link rel="icon" href="${LOGO_PATH}">
  <link rel="stylesheet" href="${SITE_BASE_PATH}/assets/style.css?v=48">
  <meta name="theme-color" content="#f6f7f3">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escapeHtml(strings.siteName)}">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl(page.slug, locale)}">
  <meta property="og:image" content="${SITE_ORIGIN}${SITE_BASE_PATH}/assets/og.png">
  <meta property="og:image:width" content="1536">
  <meta property="og:image:height" content="1024">
  <meta property="og:image:alt" content="${escapeHtml(strings.socialImageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${SITE_ORIGIN}${SITE_BASE_PATH}/assets/og.png">
  ${structuredData(page, pageTitle, description, locale, strings)}
</head>
<body data-carousel-previous="${escapeHtml(strings.carousel.previous)}" data-carousel-next="${escapeHtml(strings.carousel.next)}" data-carousel-slide="${escapeHtml(strings.carousel.slide)}" data-carousel-show="${escapeHtml(strings.carousel.show)}" data-carousel-status="${escapeHtml(strings.carousel.status)}">
  <a class="skip-link" href="#main-content">${escapeHtml(strings.skipLink)}</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="identity" href="${route("", locale)}" aria-label="${escapeHtml(strings.homepageLabel)}">
        <img src="${PROFILE_IMAGE_PATH}" alt="" width="52" height="52">
        <span class="identity-copy"><strong>Jorge Parra</strong><small>${escapeHtml(strings.identitySubtitle)}</small></span>
      </a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation">${escapeHtml(strings.menu)}</button>
      <nav class="primary-nav" id="primary-navigation" aria-label="${escapeHtml(strings.primaryNavigation)}">
          ${navigationHtml(page.slug, locale, strings)}
      </nav>
      ${languageSwitcherHtml(page.slug, locale, strings, localeBundles)}
    </div>
  </header>
  <main id="main-content">
    ${mainContent}
  </main>
  <footer class="site-footer">
    <div>
      <p><strong>${escapeHtml(strings.footerName)}</strong><br>${escapeHtml(strings.footerInstitution)}</p>
      <nav aria-label="${escapeHtml(strings.professionalProfiles)}">
        <a href="https://www.linkedin.com/in/jorgeparragomez/">${escapeHtml(strings.profiles.linkedin)}</a>
        <a href="https://www.researchgate.net/profile/Jorge-Parra-11">${escapeHtml(strings.profiles.researchGate)}</a>
        <a href="https://x.com/jorpargo_">${escapeHtml(strings.profiles.x)}</a>
        <a href="https://www.uv.es/uvweb/universidad/es/ficha-persona-1285950309813.html?p2=jorpago2">${escapeHtml(strings.profiles.uv)}</a>
      </nav>
      <p class="footer-copy">© ${new Date().getFullYear()} ${escapeHtml(strings.footerCopyright)}</p>
    </div>
  </footer>
  <script src="${SITE_BASE_PATH}/assets/site.js?v=4" defer></script>
</body>
</html>
`);
}

function notFoundPage(locale, strings, localeBundles) {
  const page = {
    slug: "404",
    title: strings.notFound.title,
    description: strings.notFound.description,
  };
  const content = `<p>${escapeHtml(strings.notFound.message)}</p>
<p><a class="button primary" href="${route("", locale)}">${escapeHtml(strings.notFound.action)}</a></p>`;
  return pageShell({ page, content, locale, strings, localeBundles });
}

function redirectPage(page, destination, locale, strings) {
  const target = `${route(destination.target, locale)}#${destination.anchor}`;
  return `<!doctype html>
<html lang="${locale.code}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)} | Dr. Jorge Parra</title>
  <meta name="description" content="${escapeHtml(conciseDescription(page.description))}">
  <link rel="canonical" href="${canonicalUrl(destination.target, locale)}">
  <meta http-equiv="refresh" content="0; url=${target}">
</head>
<body><p>${escapeHtml(strings.redirectMessage)} <a href="${target}">${escapeHtml(page.title)}</a>.</p></body>
</html>\n`;
}

async function loadLocaleBundles() {
  const config = JSON.parse(await readFile(path.join(CONTENT_ROOT, "locales.json"), "utf8"));
  if (!Array.isArray(config.locales) || config.locales.length === 0) {
    throw new Error("content/locales.json must define at least one locale.");
  }

  const localeCodes = new Set();
  const localePaths = new Set();
  for (const locale of config.locales) {
    if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale.code)) {
      throw new Error(`Invalid locale code: ${locale.code}`);
    }
    if (typeof locale.label !== "string" || !locale.label.trim()) {
      throw new Error(`Missing locale label: ${locale.code}`);
    }
    if (locale.path && !/^[a-z0-9-]+$/.test(locale.path)) {
      throw new Error(`Invalid locale path: ${locale.path}`);
    }
    if (localeCodes.has(locale.code)) throw new Error(`Duplicate locale: ${locale.code}`);
    if (localePaths.has(locale.path)) throw new Error(`Duplicate locale path: ${locale.path}`);
    localeCodes.add(locale.code);
    localePaths.add(locale.path);
  }
  if (!localeCodes.has(config.defaultLocale)) {
    throw new Error(`Default locale is not enabled: ${config.defaultLocale}`);
  }
  const defaultLocale = config.locales.find(({ code }) => code === config.defaultLocale);
  if (defaultLocale.path !== "") {
    throw new Error("The default locale must use the site root path.");
  }

  return Promise.all(
    config.locales.map(async (configuredLocale) => {
      const locale = {
        ...configuredLocale,
        isDefault: configuredLocale.code === config.defaultLocale,
      };
      const localeRoot = path.join(CONTENT_ROOT, "pages", locale.code);
      const [strings, pages] = await Promise.all([
        readFile(path.join(CONTENT_ROOT, "i18n", `${locale.code}.json`), "utf8").then(JSON.parse),
        readFile(path.join(localeRoot, "pages.json"), "utf8").then(JSON.parse),
      ]);
      if (!strings.navigation || navigationSlugs.some((slug) => !strings.navigation[slug])) {
        throw new Error(`Missing navigation strings for locale: ${locale.code}`);
      }
      if (!strings.carousel || !Array.isArray(strings.person?.knowsAbout)) {
        throw new Error(`Incomplete shared strings for locale: ${locale.code}`);
      }
      if (!Array.isArray(pages)) throw new Error(`Invalid page list for locale: ${locale.code}`);

      const pagesBySlug = new Map();
      for (const page of pages) {
        if (!/^[a-z0-9-]*$/.test(page.slug) || !page.title || !page.description || !page.modified) {
          throw new Error(`Invalid page metadata in locale: ${locale.code}`);
        }
        if (pagesBySlug.has(page.slug)) {
          throw new Error(`Duplicate page slug in ${locale.code}: ${page.slug}`);
        }
        pagesBySlug.set(page.slug, page);
      }
      return { locale, localeRoot, strings, pages, pagesBySlug };
    }),
  );
}

async function main() {
  const localeBundles = await loadLocaleBundles();
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

  for (const bundle of localeBundles) {
    const localeOutputRoot = bundle.locale.path
      ? path.join(OUTPUT_ROOT, bundle.locale.path)
      : OUTPUT_ROOT;
    for (const page of bundle.pages) {
      const outputDirectory = page.slug
        ? path.join(localeOutputRoot, page.slug)
        : localeOutputRoot;
      await mkdir(outputDirectory, { recursive: true });
      const redirect = mergedRoutes[page.slug];
      const fragmentName = page.slug || "home";
      const content = redirect
        ? ""
        : await readFile(path.join(bundle.localeRoot, `${fragmentName}.html`), "utf8");
      await writeFile(
        path.join(outputDirectory, "index.html"),
        redirect
          ? redirectPage(page, redirect, bundle.locale, bundle.strings)
          : pageShell({
              page,
              content,
              locale: bundle.locale,
              strings: bundle.strings,
              localeBundles,
            }),
        "utf8",
      );
    }
  }

  const defaultBundle = localeBundles.find(({ locale }) => locale.isDefault);
  const oldThesesRoute = path.join(OUTPUT_ROOT, "theases");
  await mkdir(oldThesesRoute, { recursive: true });
  await writeFile(
    path.join(oldThesesRoute, "index.html"),
    redirectPage(
      { title: "Theses", description: "Supervised theses." },
      mergedRoutes.theses,
      defaultBundle.locale,
      defaultBundle.strings,
    ),
    "utf8",
  );

  const sitemap = localeBundles
    .flatMap((bundle) =>
      bundle.pages
        .filter((page) => !mergedRoutes[page.slug])
        .map(
          (page) =>
            `  <url><loc>${canonicalUrl(page.slug, bundle.locale)}</loc><lastmod>${page.modified.slice(0, 10)}</lastmod></url>`,
        ),
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
  await writeFile(
    path.join(OUTPUT_ROOT, "404.html"),
    notFoundPage(defaultBundle.locale, defaultBundle.strings, localeBundles),
    "utf8",
  );
  await writeFile(
    path.join(OUTPUT_ROOT, ".htaccess"),
    `Options -Indexes\nDirectoryIndex index.html\nErrorDocument 404 ${SITE_BASE_PATH}/404.html\nRedirect 301 ${SITE_BASE_PATH}/publications/ ${SITE_BASE_PATH}/research/#publications\nRedirect 301 ${SITE_BASE_PATH}/books/ ${SITE_BASE_PATH}/teaching/#books\nRedirect 301 ${SITE_BASE_PATH}/theses/ ${SITE_BASE_PATH}/teaching/#theses\nRedirect 301 ${SITE_BASE_PATH}/theases/ ${SITE_BASE_PATH}/teaching/#theses\n`,
    "utf8",
  );

  const pageCount = localeBundles.reduce(
    (count, bundle) => count + bundle.pages.filter((page) => !mergedRoutes[page.slug]).length,
    0,
  );
  const redirectCount = localeBundles.reduce(
    (count, bundle) => count + bundle.pages.filter((page) => mergedRoutes[page.slug]).length,
    1,
  );
  console.log(`Built ${pageCount} pages and ${redirectCount} redirects in ${OUTPUT_ROOT}.`);
}

await main();
