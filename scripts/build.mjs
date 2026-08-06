import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const SITE_BASE_PATH = "/jorpago2";
const SITE_ORIGIN = "https://www.uv.es";
const IS_PREVIEW = process.env.SITE_PREVIEW === "true";
const OUTPUT_ROOT = path.resolve("publish", "jorpago2");
const CONTENT_ROOT = path.resolve("content");
const LOGO_PATH = `${SITE_BASE_PATH}/assets/media/2025/07/cropped-ChatGPT-Image-13-jul-2025-19_12_48-1.png`;
const PROFILE_IMAGE_PATH = `${SITE_BASE_PATH}/assets/github-profile.jpg`;
const PERSON_ID = `${SITE_ORIGIN}${SITE_BASE_PATH}/about-me/#person`;
const execFileAsync = promisify(execFile);
const tailwindCli = path.join(
  path.dirname(fileURLToPath(import.meta.resolve("@tailwindcss/cli/package.json"))),
  "dist",
  "index.mjs",
);

const navigationIds = ["about-me", "research", "teaching", "resources", "contact"];

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

function navigationHtml(activeId, bundle) {
  return navigationIds
    .map((id) => {
      const page = bundle.pagesById.get(id);
      if (!page) return "";
      const current = activeId === id ? ' aria-current="page"' : "";
      return `<a class="block min-h-11 cursor-pointer rounded-ui-control px-3.5 py-2.5 text-[0.78rem] font-bold text-ui-ink no-underline hover:text-ui-accent" href="${route(page.slug, bundle.locale)}"${current}>${escapeHtml(bundle.strings.navigation[id])}</a>`;
    })
    .filter(Boolean)
    .join("\n          ");
}

function alternateLinks(pageId, localeBundles) {
  const available = localeBundles.filter(({ pagesById }) => pagesById.has(pageId));
  if (available.length < 2) return "";

  const links = available.map(
    ({ locale, pagesById }) =>
      `  <link rel="alternate" hreflang="${locale.code}" href="${canonicalUrl(pagesById.get(pageId).slug, locale)}">`,
  );
  const defaultBundle = available.find(({ locale }) => locale.isDefault);
  if (defaultBundle) {
    links.push(
      `  <link rel="alternate" hreflang="x-default" href="${canonicalUrl(defaultBundle.pagesById.get(pageId).slug, defaultBundle.locale)}">`,
    );
  }
  return links.join("\n");
}

function languageSwitcherHtml(pageId, locale, strings, localeBundles) {
  const available = localeBundles.filter(({ pagesById }) => pagesById.has(pageId));
  if (available.length < 2) return "";

  const links = available
    .map(({ locale: option, pagesById }) => {
      const current = option.code === locale.code ? ' aria-current="page"' : "";
      return `<a class="grid min-h-11 min-w-11 place-items-center p-1.5 text-[0.7rem] font-bold text-ui-muted no-underline hover:text-ui-accent" href="${route(pagesById.get(pageId).slug, option)}" lang="${option.code}"${current}>${escapeHtml(option.label)}</a>`;
    })
    .join("\n          ");
  return `<span class="language-nav ml-2 inline-flex items-center gap-0.5 border-l border-ui pl-2.5 max-[820px]:mt-1.5 max-[820px]:ml-0 max-[820px]:flex max-[820px]:border-t max-[820px]:border-l-0 max-[820px]:pt-2.5 max-[820px]:pl-1.5" role="group" aria-label="${escapeHtml(strings.languageNavigation)}">\n          ${links}\n        </span>`;
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

  if (page.id === "home") {
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

  if (page.id === "about-me") {
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

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function localized(value, localeCode, label) {
  const resolved = typeof value === "string" ? value : value?.[localeCode];
  if (typeof resolved !== "string" || !resolved.trim()) {
    throw new Error(`Missing ${localeCode} value for ${label}.`);
  }
  return resolved;
}

function safeExternalUrl(value, label) {
  if (typeof value !== "string" || !value.startsWith("https://")) {
    throw new Error(`Invalid external URL for ${label}.`);
  }
  return escapeHtml(value);
}

function renderPublications(publications) {
  return requiredArray(publications, "publications")
    .map((group) => {
      if (!Number.isInteger(group.year) || !Number.isInteger(group.start)) {
        throw new Error("Publication years and list starts must be integers.");
      }
      const entries = requiredArray(group.entries, `publications for ${group.year}`);
      const listAttributes = `${group.reversed ? " reversed" : ""}${group.start > 1 ? ` start="${group.start}"` : ""}`;
      return `<details class="publication-year wp-block-details" name="publication-years"${group.open ? " open" : ""}><summary>${group.year}</summary><ol${listAttributes} class="wp-block-list">
${entries.map((entry) => `<li>${entry}</li>`).join("\n")}
</ol></details>`;
    })
    .join("\n\n");
}

function renderCourses(courses, localeCode) {
  return requiredArray(courses, "courses")
    .map(
      (course) =>
        `    <li><strong>${escapeHtml(localized(course.title, localeCode, "course title"))}</strong><span>${escapeHtml(localized(course.details, localeCode, "course details"))}</span></li>`,
    )
    .join("\n");
}

function renderTheses(entries, localeCode) {
  return requiredArray(entries, "theses")
    .map((entry) => {
      if (!Number.isInteger(entry.year) || typeof entry.titleHtml !== "string") {
        throw new Error("Invalid thesis entry.");
      }
      return `      <li><span class="supervision-year">${entry.year}</span><div><strong><a href="${safeExternalUrl(entry.url, "thesis")}">${entry.titleHtml}</a></strong><p>${escapeHtml(localized(entry.metadata, localeCode, "thesis metadata"))}</p></div></li>`;
    })
    .join("\n");
}

function renderBook(book, localeCode) {
  if (!book || typeof book.title !== "string" || !book.cover?.startsWith(`${SITE_BASE_PATH}/assets/`)) {
    throw new Error("Invalid teaching book data.");
  }
  const url = safeExternalUrl(book.url, "teaching book");
  return `  <article class="book-resource">
    <a class="book-cover" href="${url}">
      <img loading="lazy" decoding="async" width="700" height="1024" src="${escapeHtml(book.cover)}" alt="${escapeHtml(localized(book.coverAlt, localeCode, "book cover alt"))}">
    </a>
    <div class="book-resource-copy">
      <p class="eyebrow">${escapeHtml(localized(book.eyebrow, localeCode, "book eyebrow"))}</p>
      <h3 id="teoria-de-circuitos-electricos-problemas-resueltos"><a href="${url}">${escapeHtml(book.title)}</a></h3>
      <p class="book-authors">${escapeHtml(localized(book.authors, localeCode, "book authors"))}</p>
      <p>${escapeHtml(localized(book.description, localeCode, "book description"))}</p>
      <p class="resource-meta">${escapeHtml(book.metadata)}</p>
      <a class="button" href="${url}">${escapeHtml(localized(book.action, localeCode, "book action"))}</a>
    </div>
  </article>`;
}

function renderOnlineTools(tools, localeCode) {
  return requiredArray(tools, "online tools")
    .map(
      (tool) => `  <a class="online-tool-card" href="${safeExternalUrl(tool.url, "online tool")}">
    <span class="online-tool-number">${escapeHtml(tool.number)}</span>
    <strong>${escapeHtml(localized(tool.title, localeCode, "tool title"))}</strong>
    <span>${escapeHtml(localized(tool.description, localeCode, "tool description"))}</span>
    <span class="online-tool-action">${escapeHtml(localized(tool.action, localeCode, "tool action"))}</span>
  </a>`,
    )
    .join("\n");
}

function renderResourceGroups(groups, localeCode, resourceCountLabel) {
  return requiredArray(groups, "resource groups")
    .map((group) => {
      if (!/^[a-z-]+$/.test(group.id)) throw new Error("Invalid resource group id.");
      const items = requiredArray(group.items, `${group.id} resources`);
      const count = String(items.length).padStart(2, "0");
      const itemHtml = items
        .map(
          (item) =>
            `      <li><a href="${safeExternalUrl(item.url, "resource")}">${localized(item.labelHtml, localeCode, "resource label")}</a>. ${localized(item.descriptionHtml, localeCode, "resource description")}</li>`,
        )
        .join("\n");
      return `  <section class="resource-group resource-${group.id}" aria-labelledby="resources-${group.id}">
    <header class="resource-group-heading">
      <h3 id="resources-${group.id}">${escapeHtml(localized(group.title, localeCode, "resource group title"))}</h3>
      <span aria-label="${items.length} ${escapeHtml(resourceCountLabel)}">${count}</span>
    </header>
    <ul>
${itemHtml}
    </ul>
  </section>`;
    })
    .join("\n\n");
}

function renderSharedContent(pageId, content, localeCode, strings, sharedData) {
  let replacements;
  if (pageId === "research") {
    replacements = [["{{PUBLICATIONS}}", renderPublications(sharedData.publications)]];
  } else if (pageId === "teaching") {
    const thesisGroups = new Map(
      requiredArray(sharedData.teaching.thesisGroups, "thesis groups").map((group) => [group.id, group.entries]),
    );
    replacements = [
      ["{{CURRENT_COURSES}}", renderCourses(sharedData.teaching.currentCourses, localeCode)],
      ["{{PREVIOUS_COURSES}}", renderCourses(sharedData.teaching.previousCourses, localeCode)],
      ["{{BOOK_RESOURCE}}", renderBook(sharedData.teaching.book, localeCode)],
      ["{{MASTER_THESES}}", renderTheses(thesisGroups.get("masters"), localeCode)],
      ["{{BACHELOR_THESES}}", renderTheses(thesisGroups.get("bachelors"), localeCode)],
    ];
  } else if (pageId === "resources") {
    replacements = [
      ["{{ONLINE_TOOLS}}", renderOnlineTools(sharedData.resources.tools, localeCode)],
      [
        "{{RESOURCE_GROUPS}}",
        renderResourceGroups(sharedData.resources.groups, localeCode, strings.resourceCountLabel),
      ],
    ];
  } else {
    return content;
  }

  let rendered = content;
  for (const [marker, html] of replacements) {
    if (!rendered.includes(marker)) throw new Error(`Missing ${marker} in ${localeCode}/${pageId}.`);
    rendered = rendered.replace(marker, html);
  }
  if (/\{\{[A-Z_]+\}\}/.test(rendered)) throw new Error(`Unresolved content marker in ${localeCode}/${pageId}.`);
  return rendered;
}

async function loadSharedData() {
  const [publications, teaching, resources] = await Promise.all(
    ["publications", "teaching", "resources"].map((name) =>
      readFile(path.join(CONTENT_ROOT, "data", `${name}.json`), "utf8").then(JSON.parse),
    ),
  );
  requiredArray(publications, "publications");
  requiredArray(teaching.currentCourses, "current courses");
  requiredArray(teaching.previousCourses, "previous courses");
  requiredArray(teaching.thesisGroups, "thesis groups");
  if (!teaching.book) throw new Error("Missing teaching book.");
  requiredArray(resources.tools, "online tools");
  requiredArray(resources.groups, "resource groups");
  return { publications, teaching, resources };
}

function pageShell({ page, content, locale, strings, localeBundles }) {
  const isHome = page.id === "home";
  const pageTitle = page.seoTitle || `${page.title} | Dr. Jorge Parra`;
  const description = conciseDescription(page.description);
  const mainContent = isHome
    ? content
    : `<article class="page-layout page-${page.id}">
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
  ${isHome ? '<meta name="google-site-verification" content="s-CARN0HZd9E6lBDvB6sLS076HB8eLKs8p6fHRFt-Xo">' : ""}
  <meta name="robots" content="${IS_PREVIEW ? "noindex, nofollow, noarchive" : "index, follow, max-image-preview:large"}">
  <link rel="canonical" href="${canonicalUrl(page.slug, locale)}">
${alternateLinks(page.id, localeBundles)}
  <link rel="icon" href="${LOGO_PATH}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&amp;family=Space+Grotesk:wght@400;500;600;700&amp;display=swap">
  <link rel="stylesheet" href="${SITE_BASE_PATH}/assets/style.css?v=54">
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
  <meta name="twitter:image:alt" content="${escapeHtml(strings.socialImageAlt)}">
  ${structuredData(page, pageTitle, description, locale, strings)}
</head>
<body data-carousel-previous="${escapeHtml(strings.carousel.previous)}" data-carousel-next="${escapeHtml(strings.carousel.next)}" data-carousel-slide="${escapeHtml(strings.carousel.slide)}" data-carousel-show="${escapeHtml(strings.carousel.show)}" data-carousel-status="${escapeHtml(strings.carousel.status)}" class="relative m-0 min-h-dvh w-full overflow-x-hidden bg-ui-canvas font-ui-body text-base leading-[1.65] text-ui-ink">
  <a class="skip-link" href="#main-content">${escapeHtml(strings.skipLink)}</a>
  <header class="site-header relative z-20 bg-transparent">
    <div class="header-inner mx-auto flex min-h-[5.25rem] w-[calc(100%-5rem)] max-w-[1160px] items-center justify-between gap-8 border-b border-ui max-[820px]:min-h-28 max-[560px]:min-h-0 max-[560px]:w-[calc(100%-2rem)] max-[560px]:gap-3 max-[560px]:py-3">
      <a class="identity inline-flex shrink-0 items-center gap-4 text-ui-ink no-underline max-[560px]:min-w-0 max-[560px]:flex-1 max-[560px]:gap-2.5" href="${route("", locale)}" aria-label="${escapeHtml(strings.homepageLabel)}">
        <img class="size-12 rounded-full border border-ui object-cover max-[820px]:size-14 max-[560px]:size-10" src="${PROFILE_IMAGE_PATH}" alt="" width="52" height="52">
        <span class="identity-copy"><strong>Jorge Parra</strong><small>${escapeHtml(strings.identitySubtitle)}</small></span>
      </a>
      <button class="menu-toggle hidden min-h-11 rounded-full border border-ui bg-ui-surface px-3.5 py-2 text-xs font-bold text-ui-ink max-[820px]:block" type="button" aria-expanded="false" aria-controls="primary-navigation">${escapeHtml(strings.menu)}</button>
      <nav class="primary-nav flex items-center gap-1 max-[820px]:absolute max-[820px]:top-full max-[820px]:right-4 max-[820px]:left-4 max-[820px]:hidden max-[820px]:rounded-ui-panel max-[820px]:border max-[820px]:border-ui max-[820px]:bg-ui-surface max-[820px]:p-3 max-[820px]:shadow-ui-raised" id="primary-navigation" aria-label="${escapeHtml(strings.primaryNavigation)}">
          ${navigationHtml(page.id, localeBundles.find(({ locale: option }) => option.code === locale.code))}
          ${languageSwitcherHtml(page.id, locale, strings, localeBundles)}
      </nav>
    </div>
  </header>
  <main class="relative z-1 min-h-[70vh]" id="main-content">
    ${mainContent}
  </main>
  <footer class="site-footer relative z-1 border-t border-ui py-6 text-sm text-ui-muted">
    <div class="mx-auto flex w-[calc(100%-5rem)] max-w-[1160px] items-end justify-between gap-8 max-[820px]:block max-[560px]:w-[calc(100%-2rem)]">
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
  <script src="${SITE_BASE_PATH}/assets/site.js?v=6" defer></script>
</body>
</html>
`);
}

function notFoundPage(locale, strings, localeBundles) {
  const page = {
    id: "404",
    slug: "404",
    title: strings.notFound.title,
    description: strings.notFound.description,
  };
  const content = `<p>${escapeHtml(strings.notFound.message)}</p>
<p><a class="button primary" href="${route("", locale)}">${escapeHtml(strings.notFound.action)}</a></p>`;
  return pageShell({ page, content, locale, strings, localeBundles });
}

function redirectPage(page, destination, bundle) {
  const targetPage = bundle.pagesById.get(destination.target);
  if (!targetPage) throw new Error(`Missing redirect target in ${bundle.locale.code}: ${destination.target}`);
  const target = `${route(targetPage.slug, bundle.locale)}#${destination.anchor}`;
  return `<!doctype html>
<html lang="${bundle.locale.code}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)} | Dr. Jorge Parra</title>
  <meta name="description" content="${escapeHtml(conciseDescription(page.description))}">
  <link rel="canonical" href="${canonicalUrl(targetPage.slug, bundle.locale)}">
  <meta http-equiv="refresh" content="0; url=${target}">
</head>
<body><p>${escapeHtml(bundle.strings.redirectMessage)} <a href="${target}">${escapeHtml(page.title)}</a>.</p></body>
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
      if (!strings.navigation || navigationIds.some((id) => !strings.navigation[id])) {
        throw new Error(`Missing navigation strings for locale: ${locale.code}`);
      }
      if (!strings.carousel || !Array.isArray(strings.person?.knowsAbout)) {
        throw new Error(`Incomplete shared strings for locale: ${locale.code}`);
      }
      if (!Array.isArray(pages)) throw new Error(`Invalid page list for locale: ${locale.code}`);

      const pagesBySlug = new Map();
      const pagesById = new Map();
      for (const page of pages) {
        if (
          !/^[a-z0-9-]+$/.test(page.id) ||
          !/^[a-z0-9-]*$/.test(page.slug) ||
          !page.title ||
          !page.description ||
          !page.modified
        ) {
          throw new Error(`Invalid page metadata in locale: ${locale.code}`);
        }
        if (pagesById.has(page.id)) {
          throw new Error(`Duplicate page id in ${locale.code}: ${page.id}`);
        }
        if (pagesBySlug.has(page.slug)) {
          throw new Error(`Duplicate page slug in ${locale.code}: ${page.slug}`);
        }
        pagesById.set(page.id, page);
        pagesBySlug.set(page.slug, page);
      }
      return { locale, localeRoot, strings, pages, pagesById, pagesBySlug };
    }),
  );
}

async function main() {
  const [localeBundles, sharedData] = await Promise.all([loadLocaleBundles(), loadSharedData()]);
  const socialImagePath = path.join(CONTENT_ROOT, "og.png");

  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_ROOT, "assets"), { recursive: true });
  await cp(path.join(CONTENT_ROOT, "media"), path.join(OUTPUT_ROOT, "assets", "media"), {
    recursive: true,
  });
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
      const redirect = mergedRoutes[page.id];
      const fragmentName = page.id;
      const fragment = redirect
        ? ""
        : await readFile(path.join(bundle.localeRoot, `${fragmentName}.html`), "utf8");
      const content = redirect
        ? ""
        : renderSharedContent(page.id, fragment, bundle.locale.code, bundle.strings, sharedData);
      await writeFile(
        path.join(outputDirectory, "index.html"),
        redirect
          ? redirectPage(page, redirect, bundle)
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
      { id: "theases", slug: "theases", title: "Theses", description: "Supervised theses." },
      mergedRoutes.theses,
      defaultBundle,
    ),
    "utf8",
  );

  await execFileAsync(process.execPath, [
    tailwindCli,
    "-i",
    path.resolve("src", "tailwind.css"),
    "-o",
    path.join(OUTPUT_ROOT, "assets", "style.css"),
    "--minify",
  ]);

  const sitemap = localeBundles
    .flatMap((bundle) =>
      bundle.pages
        .filter((page) => !mergedRoutes[page.id])
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
    (count, bundle) => count + bundle.pages.filter((page) => !mergedRoutes[page.id]).length,
    0,
  );
  const redirectCount = localeBundles.reduce(
    (count, bundle) => count + bundle.pages.filter((page) => mergedRoutes[page.id]).length,
    1,
  );
  console.log(`Built ${pageCount} pages and ${redirectCount} redirects in ${OUTPUT_ROOT}.`);
}

await main();
