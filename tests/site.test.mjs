import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const SITE_BASE_PATH = "/jorpago2";
const SITE_ORIGIN = "https://www.uv.es";
const IS_PREVIEW = process.env.SITE_PREVIEW === "true";
const OUTPUT_ROOT = path.resolve("publish", "jorpago2");
const localeConfig = JSON.parse(await readFile(path.resolve("content", "locales.json"), "utf8"));
const defaultLocale = localeConfig.locales.find(
  (locale) => locale.code === localeConfig.defaultLocale,
);
const DEFAULT_CONTENT_ROOT = path.resolve("content", "pages", defaultLocale.code);
const pages = JSON.parse(await readFile(path.join(DEFAULT_CONTENT_ROOT, "pages.json"), "utf8"));
const localizedPages = new Map(
  await Promise.all(
    localeConfig.locales.map(async (locale) => [
      locale.code,
      JSON.parse(
        await readFile(path.resolve("content", "pages", locale.code, "pages.json"), "utf8"),
      ),
    ]),
  ),
);
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

function outputFileForPage(page, locale) {
  return path.join(OUTPUT_ROOT, locale.path, page.slug, "index.html");
}

test("all imported pages are built with metadata", async () => {
  assert.equal(pages.length, 12);

  for (const page of pages) {
    const outputFile = path.join(OUTPUT_ROOT, page.slug, "index.html");
    const html = await readFile(outputFile, "utf8");
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE_ORIGIN}/jorpago2/`));
    assert.doesNotMatch(html, /jorpago2\.blogs\.uv\.es/);
    assert.doesNotMatch(html, /<script[^>]+src="https?:/i);
    if (mergedRoutes[page.id]) {
      assert.match(html, new RegExp(`http-equiv="refresh" content="0; url=${mergedRoutes[page.id]}`));
      assert.doesNotMatch(html, /assets\/site\.js/);
      continue;
    }
    assert.match(html, /<script src="\/jorpago2\/assets\/site\.js\?v=6" defer><\/script>/);
    assert.doesNotMatch(html, /Last update:|Last updated|class="last-updated"/);
  }
});

test("locale sources keep shared strings separate from page content", async () => {
  assert.equal(localeConfig.defaultLocale, "en");
  assert.equal(defaultLocale.path, "");

  for (const locale of localeConfig.locales) {
    const strings = JSON.parse(
      await readFile(path.resolve("content", "i18n", `${locale.code}.json`), "utf8"),
    );
    const localePages = JSON.parse(
      await readFile(path.resolve("content", "pages", locale.code, "pages.json"), "utf8"),
    );
    assert.ok(strings.navigation.research);
    assert.ok(strings.carousel.previous);
    assert.ok(localePages.some((page) => page.slug === ""));
  }

  const home = await readFile(path.join(OUTPUT_ROOT, "index.html"), "utf8");
  assert.match(home, /<html lang="en">/);
  assert.match(home, /<body data-carousel-previous="Previous image"/);
  assert.doesNotMatch(home, /data-carousel-(?:pause|play)=/);
});

test("shared records live in JSON and render in every language", async () => {
  const dataRoot = path.resolve("content", "data");
  const publications = JSON.parse(await readFile(path.join(dataRoot, "publications.json"), "utf8"));
  const teaching = JSON.parse(await readFile(path.join(dataRoot, "teaching.json"), "utf8"));
  const resources = JSON.parse(await readFile(path.join(dataRoot, "resources.json"), "utf8"));

  assert.equal(publications.reduce((count, group) => count + group.entries.length, 0), 27);
  assert.equal(teaching.currentCourses.length, 7);
  assert.equal(teaching.previousCourses.length, 4);
  assert.equal(teaching.thesisGroups.reduce((count, group) => count + group.entries.length, 0), 10);
  assert.equal(teaching.book.title, "Teoría de circuitos eléctricos. Problemas resueltos");
  assert.equal(resources.tools.length, 2);
  assert.equal(resources.groups.length, 5);
  assert.equal(resources.groups.reduce((count, group) => count + group.items.length, 0), 26);
  assert.ok(teaching.currentCourses.every((course) => course.details.en && course.details.es && course.details.ca));
  assert.ok(
    [...teaching.currentCourses, ...teaching.previousCourses].every(
      (course) => course.title.en !== course.title.es,
    ),
  );
  assert.ok(resources.groups.every((group) => group.title.en && group.title.es && group.title.ca));

  for (const locale of localeConfig.locales) {
    const pageRoot = path.resolve("content", "pages", locale.code);
    const researchSource = await readFile(path.join(pageRoot, "research.html"), "utf8");
    const teachingSource = await readFile(path.join(pageRoot, "teaching.html"), "utf8");
    const resourcesSource = await readFile(path.join(pageRoot, "resources.html"), "utf8");
    assert.match(researchSource, /\{\{PUBLICATIONS\}\}/);
    assert.match(teachingSource, /\{\{CURRENT_COURSES\}\}[\s\S]*\{\{BOOK_RESOURCE\}\}[\s\S]*\{\{MASTER_THESES\}\}/);
    assert.match(resourcesSource, /\{\{ONLINE_TOOLS\}\}[\s\S]*\{\{RESOURCE_GROUPS\}\}/);
    assert.doesNotMatch(researchSource, /href="https:\/\/doi\.org\//);
    assert.doesNotMatch(teachingSource, /href="https:\/\/riunet\.upv\.es\//);
    assert.doesNotMatch(resourcesSource, /href="https:\/\/www\.youtube\.com\/@BranchEducation/);
  }

  const spanishResearch = await readFile(path.join(OUTPUT_ROOT, "es", "investigacion", "index.html"), "utf8");
  const spanishTeaching = await readFile(path.join(OUTPUT_ROOT, "es", "docencia", "index.html"), "utf8");
  const spanishResources = await readFile(path.join(OUTPUT_ROOT, "es", "recursos", "index.html"), "utf8");
  assert.equal((spanishResearch.match(/href="https:\/\/doi\.org\//g) ?? []).length, 27);
  assert.equal((spanishTeaching.match(/class="supervision-year"/g) ?? []).length, 10);
  assert.match(spanishTeaching, /Sistemas electrónicos digitales I/);
  assert.equal((spanishResources.match(/class="resource-group /g) ?? []).length, 5);
});

test("Spanish pages use localized routes, interface text and SEO alternates", async () => {
  const spanishLocale = localeConfig.locales.find((locale) => locale.code === "es");
  const spanishPages = localizedPages.get("es");
  const byId = new Map(spanishPages.map((page) => [page.id, page]));
  const home = await readFile(outputFileForPage(byId.get("home"), spanishLocale), "utf8");
  const about = await readFile(outputFileForPage(byId.get("about-me"), spanishLocale), "utf8");
  const research = await readFile(outputFileForPage(byId.get("research"), spanishLocale), "utf8");
  const teaching = await readFile(outputFileForPage(byId.get("teaching"), spanishLocale), "utf8");
  const resources = await readFile(outputFileForPage(byId.get("resources"), spanishLocale), "utf8");
  const contact = await readFile(outputFileForPage(byId.get("contact"), spanishLocale), "utf8");
  const students = await readFile(outputFileForPage(byId.get("new-students"), spanishLocale), "utf8");
  const faq = await readFile(outputFileForPage(byId.get("faq"), spanishLocale), "utf8");
  const career = await readFile(outputFileForPage(byId.get("career-strategy"), spanishLocale), "utf8");

  assert.deepEqual([...byId.keys()].sort(), [
    "about-me",
    "career-strategy",
    "contact",
    "faq",
    "home",
    "new-students",
    "research",
    "resources",
    "teaching",
  ]);
  assert.match(home, /<html lang="es">/);
  assert.match(home, /<link rel="canonical" href="https:\/\/www\.uv\.es\/jorpago2\/es\/">/);
  assert.match(home, /hreflang="en" href="https:\/\/www\.uv\.es\/jorpago2\/">/);
  assert.match(home, /hreflang="es" href="https:\/\/www\.uv\.es\/jorpago2\/es\/">/);
  assert.match(home, /hreflang="ca" href="https:\/\/www\.uv\.es\/jorpago2\/va\/">/);
  assert.match(home, /hreflang="x-default" href="https:\/\/www\.uv\.es\/jorpago2\/">/);
  assert.match(home, /href="\/jorpago2\/es\/investigacion\/">Investigación<\/a>/);
  assert.match(home, /href="\/jorpago2\/es\/docencia\/">Docencia<\/a>/);
  assert.match(home, /class="page-actions">[\s\S]*?Investigación[\s\S]*?Docencia/);
  assert.match(home, /class="language-nav[^"]*"[\s\S]*?href="\/jorpago2\/" lang="en">EN<\/a>[\s\S]*?lang="es" aria-current="page">ES<\/a>/);
  assert.match(home, /href="\/jorpago2\/es\/estudiantes\/">¿Podría encajar contigo la investigación\?/);
  assert.match(home, /href="\/jorpago2\/es\/doctorado\/">Consulta las preguntas frecuentes sobre el doctorado/);
  assert.match(home, /href="\/jorpago2\/es\/carrera-investigadora\/">Cinco principios para construir una carrera investigadora/);
  assert.match(about, /hreflang="en" href="https:\/\/www\.uv\.es\/jorpago2\/about-me\/">/);
  assert.match(about, /hreflang="es" href="https:\/\/www\.uv\.es\/jorpago2\/es\/sobre-mi\/">/);
  assert.match(about, /Investigador y docente en fotónica integrada/);
  assert.equal((about.match(/aria-roledescription="slide"/g) ?? []).length, 7);
  assert.match(research, /Fotónica integrada reconfigurable con materiales funcionales/);
  assert.equal((research.match(/href="https:\/\/doi\.org\//g) ?? []).length, 27);
  assert.equal((teaching.match(/· Codirector/g) ?? []).length, 10);
  assert.match(resources, /Simuladores y herramientas en línea/);
  assert.match(resources, /Diseño, simulación y medida/);
  assert.match(contact, /Estudiantes de grado y máster/);
  assert.equal((students.match(/<li>\s*<strong>[^<]+<\/strong>/g) ?? []).length, 4);
  assert.match(students, /href="\/jorpago2\/es\/contacto\/#student-projects-title"/);
  assert.equal((faq.match(/<details class="faq-item" name="phd-faq"/g) ?? []).length, 5);
  assert.match(faq, /hreflang="en" href="https:\/\/www\.uv\.es\/jorpago2\/faq\/">/);
  assert.match(faq, /hreflang="es" href="https:\/\/www\.uv\.es\/jorpago2\/es\/doctorado\/">/);
  assert.match(faq, /Ley de la Ciencia — artículo 21/);
  assert.match(faq, /href="\/jorpago2\/es\/estudiantes\/"/);
  assert.equal((career.match(/<p class="career-question">/g) ?? []).length, 5);
  assert.match(career, /hreflang="en" href="https:\/\/www\.uv\.es\/jorpago2\/career-strategy\/">/);
  assert.match(career, /hreflang="es" href="https:\/\/www\.uv\.es\/jorpago2\/es\/carrera-investigadora\/">/);
  assert.match(career, /aneca\.es\/web\/guest\/criterios-de-evaluaci/);
  assert.match(career, /erc\.europa\.eu\/news-events\/events\/erc-grants-what-expect-2026-calls/);
  assert.match(career, /href="\/jorpago2\/es\/investigacion\/"/);
});

test("Valencian pages use translated routes, content and SEO alternates", async () => {
  const valencianLocale = localeConfig.locales.find((locale) => locale.code === "ca");
  const valencianPages = localizedPages.get("ca");
  const byId = new Map(valencianPages.map((page) => [page.id, page]));
  const readPage = (id) => readFile(outputFileForPage(byId.get(id), valencianLocale), "utf8");
  const [home, about, research, teaching, resources, contact, students, faq, career] = await Promise.all([
    "home", "about-me", "research", "teaching", "resources", "contact", "new-students", "faq", "career-strategy",
  ].map(readPage));

  assert.match(home, /<html lang="ca">/);
  assert.match(home, /<link rel="canonical" href="https:\/\/www\.uv\.es\/jorpago2\/va\/">/);
  assert.match(home, /hreflang="ca" href="https:\/\/www\.uv\.es\/jorpago2\/va\/">/);
  assert.match(home, /href="\/jorpago2\/va\/investigacio\/">Investigació<\/a>/);
  assert.match(home, /class="page-actions">[\s\S]*?Investigació[\s\S]*?Docència/);
  assert.match(home, /lang="ca" aria-current="page">VAL<\/a>/);
  assert.match(home, /Cinc principis per a construir una carrera investigadora/);
  assert.match(about, /Investigador i docent en fotònica integrada/);
  assert.match(research, /Fotònica integrada reconfigurable amb materials funcionals/);
  assert.equal((research.match(/href="https:\/\/doi\.org\//g) ?? []).length, 27);
  assert.match(teaching, /Sistemes electrònics digitals I/);
  assert.equal((teaching.match(/· Codirector/g) ?? []).length, 10);
  assert.match(resources, /Disseny, simulació i mesura/);
  assert.match(contact, /Estudiants de grau i màster/);
  assert.match(students, /Quatre hàbits útils per a investigar/);
  assert.equal((faq.match(/<details class="faq-item" name="phd-faq"/g) ?? []).length, 5);
  assert.match(career, /Criteris vigents i normes de finançament/);
  const mainContent = [home, about, research, teaching, resources, contact, students, faq, career]
    .map((html) => html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? "")
    .join("");
  assert.doesNotMatch(mainContent, /\/jorpago2\/es\//);
});

test("SEO metadata identifies the site and academic profile", async () => {
  const home = await readFile(path.join(OUTPUT_ROOT, "index.html"), "utf8");
  const about = await readFile(path.join(OUTPUT_ROOT, "about-me", "index.html"), "utf8");

  assert.match(home, /"@type": "WebSite"/);
  assert.match(home, /"@type": "Person"/);
  assert.match(about, /"@type": "ProfilePage"/);
  assert.match(about, /https:\/\/orcid\.org\/0000-0003-4610-3411/);
  assert.match(about, /https:\/\/scholar\.google\.es\/citations\?user=5kYBpXIAAAAJ&hl=en/);
  assert.match(home, /<meta name="google-site-verification" content="s-CARN0HZd9E6lBDvB6sLS076HB8eLKs8p6fHRFt-Xo">/);
  assert.ok(
    home.includes(
      `<meta name="robots" content="${IS_PREVIEW ? "noindex, nofollow, noarchive" : "index, follow, max-image-preview:large"}">`,
    ),
  );
  assert.match(home, /<meta name="twitter:title" content="[^"]+">/);
  assert.match(home, /<meta name="twitter:image:alt" content="[^"]+">/);
  assert.match(home, new RegExp(`${SITE_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/jorpago2/assets/og\\.png`));
});

test("homepage has the personal academic layout and keeps the five-image carousel", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "index.html"), "utf8");

  assert.match(html, /<article class="home-layout">/);
  assert.match(html, /class="hero-carousel"/);
  assert.doesNotMatch(html, /class="home-gallery"/);
  assert.match(html, /family=IBM\+Plex\+Sans[^\"]+family=Space\+Grotesk/);
  assert.match(html, /assets\/style\.css\?v=53/);
  assert.match(html, /class="page-actions">[\s\S]*?Research[\s\S]*?Teaching/);
  assert.match(html, /<a\b[^>]*href="\/jorpago2\/research\/"[^>]*>Research<\/a>/);
  assert.match(html, /<a\b[^>]*href="\/jorpago2\/teaching\/"[^>]*>Teaching<\/a>/);
  assert.match(html, /<a\b[^>]*href="\/jorpago2\/resources\/"[^>]*>Resources<\/a>/);
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
  assert.match(html, /<img\b[^>]*src="\/jorpago2\/assets\/github-profile\.jpg"[^>]*alt=""[^>]*width="52" height="52">/);
  assert.equal((html.match(/aria-roledescription="slide"/g) ?? []).length, 5);
  assert.match(html, /<img decoding="async" fetchpriority="high" src="\/jorpago2\/assets\/media\/2025\/08\/1750954398339\.jpg"/);
  assert.doesNotMatch(html, /1750954398339\.jpg"[^>]*loading="lazy"/);
  assert.equal((html.match(/data-src="/g) ?? []).length, 4);
  assert.match(html, /Imagen1\.webp/);
  assert.match(html, /Imagen2\.webp/);
  assert.doesNotMatch(html, /Imagen[12]\.png/);
  assert.ok((await stat(path.join(OUTPUT_ROOT, "assets", "media", "2025", "08", "Imagen1.webp"))).size < 250_000);
  assert.ok((await stat(path.join(OUTPUT_ROOT, "assets", "media", "2025", "08", "Imagen2.webp"))).size < 250_000);
  assert.doesNotMatch(html, /class="nav-group"|class="nav-submenu"/);
});

test("contact page highlights email, student projects and office location", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "contact", "index.html"), "utf8");
  const script = await readFile(path.join(OUTPUT_ROOT, "assets", "site.js"), "utf8");

  assert.match(html, /class="contact-lead"/);
  assert.match(html, /class="contact-email">jorge \[dot\] parra \[at\] uv \[dot\] es/);
  assert.doesNotMatch(html, /jorge\.parra@uv\.es/);
  assert.match(html, /class="button copy-email"[^>]+data-email-local="jorge\.parra"[^>]+data-email-domain="uv\.es"/);
  assert.match(html, /class="visually-hidden email-copy-status" aria-live="polite"/);
  assert.match(script, /navigator\.clipboard\.writeText\(`\$\{localPart\}@\$\{domain\}`\)/);
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
  assert.ok(html.indexOf('id="online-tools"') < html.indexOf('id="links"'));
  assert.match(html, /href="https:\/\/jorpago2\.github\.io\/fdtd-2d-simulator\/"/);
  assert.match(html, /href="https:\/\/jorpago2\.github\.io\/drift-difussion-simulator\/"/);
});

test("research and teaching consolidate their former child pages", async () => {
  const research = await readFile(path.join(OUTPUT_ROOT, "research", "index.html"), "utf8");
  const teaching = await readFile(path.join(OUTPUT_ROOT, "teaching", "index.html"), "utf8");
  const css = await readFile(path.resolve("src", "style.css"), "utf8");

  assert.match(research, /id="overview"[\s\S]*?id="publications"/);
  assert.equal((research.match(/class="research-area"/g) ?? []).length, 3);
  assert.match(research, /Functional materials for integrated photonics/);
  assert.match(research, /class="section-intro research-intro"[\s\S]*?research-integrated-photonics\.webp\?v=2/);
  assert.match(research, /Reconfigurable and non-volatile photonic devices/);
  assert.match(research, /Neuromorphic photonic hardware/);
  assert.doesNotMatch(research, /Emerging optoelectronic devices and characterization/);
  assert.match(research, /class="research-profile-links"[\s\S]*?Google Scholar[\s\S]*?ORCID/);
  assert.doesNotMatch(research, /Collaborations|Participation in projects|Research visuals|metaslider/);
  assert.equal((research.match(/<details class="publication-year wp-block-details" name="publication-years"/g) ?? []).length, 9);
  assert.equal((research.match(/name="publication-years" open/g) ?? []).length, 1);
  assert.equal((research.match(/href="https:\/\/doi\.org\//g) ?? []).length, 27);
  assert.match(research, /10\.1088\/2515-7647\/ae6004/);
  assert.match(research, /Photonics<\/em>, vol\. 12, no\. 5, Art\. no\. 428, 2025/);
  assert.match(research, /VO<sub>2<\/sub>-integrated photonics/);
  assert.doesNotMatch(research, /<em>(?:J\. Phys\. Photonics|Sci Rep|npj Nanophoton\.|Opt\. Express|Opt\. Mater\. Express|Opt\. Lett\.)<\/em>/);
  assert.match(css, /\.publication-year > ol > li::marker \{[\s\S]*?color: var\(--accent\);/);
  assert.match(css, /\.publication-year a\[href\^="https:\/\/doi\.org\/"\] \{[\s\S]*?border-radius: 999px;/);
  assert.match(teaching, /id="courses"[\s\S]*?id="books"[\s\S]*?id="theses"/);
  assert.equal((teaching.match(/class="course-list current-course-list"[\s\S]*?<\/ul>/)?.[0].match(/<li>/g) ?? []).length, 7);
  assert.equal((teaching.match(/class="course-list previous-course-list"[\s\S]*?<\/ul>/)?.[0].match(/<li>/g) ?? []).length, 4);
  assert.equal((teaching.match(/class="supervision-year"/g) ?? []).length, 10);
  assert.equal((teaching.match(/· Co-supervisor/g) ?? []).length, 10);
  assert.doesNotMatch(teaching, /· Supervisor/);
  assert.match(teaching, /Co-supervised theses/);
  assert.match(teaching, /Electronics and photonics education/);
  assert.match(teaching, /class="section-intro teaching-intro"[\s\S]*?teaching-electronics-photonics\.webp\?v=2/);
  assert.match(teaching, /Teoría de circuitos eléctricos/);
  assert.match(teaching, /href="\/jorpago2\/resources\/#online-tools"/);
  assert.match(teaching, /href="\/jorpago2\/contact\/#student-projects-title"/);
  assert.match(teaching, /Energy-efficient ITO microheaters/);
  assert.doesNotMatch(teaching, /metaslider|<table|Teaching in practice|>TBC</);
});

test("about page presents a curated carousel and compact academic trajectory", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "about-me", "index.html"), "utf8");
  const css = await readFile(path.resolve("src", "style.css"), "utf8");
  const carousel = html.match(/<div class="wp-block-media-text__media about-carousel">[\s\S]*?<\/ul>/)?.[0] ?? "";

  assert.match(carousel, /class="slide-profile ms-image"/);
  assert.match(carousel, /src="\/jorpago2\/assets\/media\/2025\/08\/Imagen1\.jpg"[^>]*alt="Jorge Parra"/);
  assert.equal((carousel.match(/aria-roledescription="slide"/g) ?? []).length, 7);
  assert.match(html, /Researcher and educator in integrated photonics/);
  assert.equal((html.match(/class="trajectory-date"/g) ?? []).length, 9);
  assert.match(html, /COIT-AEIT National Award for Best Academic Record · 2021/);
  assert.doesNotMatch(html, /Polytechnical|Telecomunnication|next-gen|disruptive communications|memdevices/);
  assert.match(css, /\.about-biography \.wp-block-media-text \{[\s\S]*?grid-template-columns: minmax\(20rem/);
  assert.match(css, /\.about-carousel \.carousel-controls \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;/);
  assert.doesNotMatch(html, /carousel-toggle|Pause slideshow|Play slideshow/);
  assert.match(css, /\.about-carousel \.carousel-dots \{\s*display: none;/);
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
  assert.match(script, /event\.key === "Escape"/);
  assert.doesNotMatch(script, /pauseButton|carouselLabels\.(?:pause|play)|setInterval/);
  assert.match(script, /img\[data-src\]/);
  assert.match(css, /aspect-ratio: var\(--carousel-aspect/);
  assert.match(css, /\.metaslider\.carousel-ready \.slides li \{[\s\S]*?opacity: 0;[\s\S]*?transition: opacity 0\.8s ease/);
  assert.match(css, /\.hero-carousel \.carousel-controls \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;/);
  assert.match(css, /\.carousel-dots \{\s*display: none;/);
  assert.match(css, /\.carousel-status \{[\s\S]*position: static;/);
  assert.match(css, /\.carousel-dots button \{[\s\S]*?width: 1\.5rem;[\s\S]*?height: 1\.5rem;/);
  assert.match(css, /\.carousel-arrow \{[\s\S]*?width: 2\.75rem;[\s\S]*?height: 2\.75rem;/);
  assert.match(css, /\.site-footer nav a \{[\s\S]*?min-height: 2\.75rem;/);
  assert.doesNotMatch(css, /width: 100vw/);
});

test("header and page content share the same horizontal alignment", async () => {
  const html = await readFile(path.join(OUTPUT_ROOT, "index.html"), "utf8");
  const css = await readFile(path.resolve("src", "style.css"), "utf8");

  assert.match(html, /class="header-inner[^"]*w-\[calc\(100%-5rem\)\][^"]*max-w-\[1160px\]/);
  assert.match(html, /class="block min-h-11[^"]*" href="\/jorpago2\/about-me\/"/);
  assert.match(html, /class="grid min-h-11 min-w-11[^"]*" href="\/jorpago2\/" lang="en"/);
  assert.match(css, /\.home-layout,[\s\S]*?width: min\(calc\(100% - 5rem\), var\(--max-width\)\);/);
  assert.match(css, /\.home-intro \{[\s\S]*?padding: clamp\([^;]+\) 0;/);
});

test("Tailwind compiles semantic utilities without Preflight", async () => {
  const source = await readFile(path.resolve("src", "tailwind.css"), "utf8");
  const css = await readFile(path.join(OUTPUT_ROOT, "assets", "style.css"), "utf8");

  assert.match(source, /tailwindcss\/theme\.css/);
  assert.match(source, /tailwindcss\/utilities\.css/);
  assert.doesNotMatch(source, /tailwindcss\/preflight\.css|@import\s+["']tailwindcss["']/);
  assert.match(source, /--color-ui-canvas:/);
  assert.match(css, /\.bg-ui-canvas\{/);
  assert.match(css, /\.min-h-11\{/);
});

test("local links and assets resolve", async () => {
  for (const locale of localeConfig.locales) {
    for (const page of localizedPages.get(locale.code)) {
      const html = await readFile(outputFileForPage(page, locale), "utf8");
      const urls = [
        ...html.matchAll(/(?:href|src|data-src)="(\/jorpago2(?:\/[^"#?]*)?)/g),
      ].map((match) => match[1]);

      for (const url of new Set(urls)) {
        assert.equal(await exists(outputFileForUrl(url)), true, `Missing target for ${url}`);
      }
    }
  }
});

test("external links open safely in a new tab", async () => {
  let externalLinkCount = 0;

  for (const locale of localeConfig.locales) {
    for (const page of localizedPages.get(locale.code).filter((item) => !mergedRoutes[item.id])) {
      const html = await readFile(outputFileForPage(page, locale), "utf8");
      for (const match of html.matchAll(/<a\b(?=[^>]*\bhref="https?:\/\/)[^>]*>/gi)) {
        externalLinkCount += 1;
        assert.match(match[0], /\starget="_blank"/i);
        assert.match(match[0], /\bnoopener\b/i);
        assert.match(match[0], /\bnoreferrer\b/i);
      }
    }
  }

  assert.ok(externalLinkCount > 0);
});

test("migrated content images have alternative text", async () => {
  for (const locale of localeConfig.locales) {
    const contentRoot = path.resolve("content", "pages", locale.code);
    const fragments = await readdir(contentRoot);

    for (const fragment of fragments.filter((name) => name.endsWith(".html"))) {
      const html = await readFile(path.join(contentRoot, fragment), "utf8");
      for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
        assert.match(image[0], /\salt="[^"]+"/i, `${locale.code}/${fragment} contains an image without alt text`);
      }
    }
  }
});

test("legacy route redirects and sitemap lists every page", async () => {
  const oldThesesRedirect = await readFile(path.join(OUTPUT_ROOT, "theases", "index.html"), "utf8");
  const publicationsRedirect = await readFile(path.join(OUTPUT_ROOT, "publications", "index.html"), "utf8");
  const booksRedirect = await readFile(path.join(OUTPUT_ROOT, "books", "index.html"), "utf8");
  const thesesRedirect = await readFile(path.join(OUTPUT_ROOT, "theses", "index.html"), "utf8");
  const sitemap = await readFile(path.join(OUTPUT_ROOT, "sitemap.xml"), "utf8");
  const robots = await readFile(path.join(OUTPUT_ROOT, "robots.txt"), "utf8");
  const mediaFiles = await readdir(path.join(OUTPUT_ROOT, "assets", "media"), {
    recursive: true,
  });

  assert.match(publicationsRedirect, /url=\/jorpago2\/research\/#publications/);
  assert.match(booksRedirect, /url=\/jorpago2\/teaching\/#books/);
  assert.match(thesesRedirect, /url=\/jorpago2\/teaching\/#theses/);
  assert.match(oldThesesRedirect, /url=\/jorpago2\/teaching\/#theses/);
  const sitemapPageCount = localeConfig.locales.reduce(
    (count, locale) => count + localizedPages.get(locale.code).filter((page) => !mergedRoutes[page.id]).length,
    0,
  );
  assert.equal((sitemap.match(/<url>/g) ?? []).length, sitemapPageCount);
  assert.match(sitemap, /<loc>https:\/\/www\.uv\.es\/jorpago2\//);
  assert.match(sitemap, /<loc>https:\/\/www\.uv\.es\/jorpago2\/es\/investigacion\/<\/loc>/);
  assert.equal(
    robots,
    IS_PREVIEW
      ? "User-agent: *\nDisallow: /\n"
      : "User-agent: *\nAllow: /\nSitemap: https://www.uv.es/jorpago2/sitemap.xml\n",
  );
  assert.doesNotMatch(sitemap, /<loc>[^<]+\/(?:publications|books|theses)\/<\/loc>/);
  assert.equal(mediaFiles.filter((file) => /\.(?:png|jpe?g|webp)$/i.test(file)).length, 17);
});
