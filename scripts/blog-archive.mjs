function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function parseDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label} for weekly blog post.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ${label} for weekly blog post.`);
  }
  return date;
}

// weekStart is inclusive and weekEnd is the following Wednesday, exclusive.
export function weeklyPosts(pages) {
  const seen = new Set();
  const posts = [];
  for (const page of pages) {
    const hasStart = page.weekStart != null;
    const hasEnd = page.weekEnd != null;
    if (!hasStart && !hasEnd) continue;
    if (!page.id.startsWith("post-") || !hasStart || !hasEnd) {
      throw new Error("Weekly dates require a blog post with both weekStart and weekEnd.");
    }
    const start = parseDate(page.weekStart, "weekStart");
    const end = parseDate(page.weekEnd, "weekEnd");
    if (start.getUTCDay() !== 3 || end - start !== 7 * 24 * 60 * 60 * 1000) {
      throw new Error(`Invalid Wednesday-to-Wednesday interval for ${page.id}.`);
    }
    if (seen.has(page.weekStart)) throw new Error(`Duplicate blog week ${page.weekStart}.`);
    seen.add(page.weekStart);
    posts.push(page);
  }
  return posts.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

function cardCover(post, locale, strings, articles, url, featured) {
  const article = articles[post.coverDoi];
  const figure = article?.figure;
  if (!figure) throw new Error(`Missing cover figure for ${post.id}`);
  const caption = figure.localizedCaptions?.[locale.code] ?? figure.caption;
  const author = article.reference.author[0].family;
  const licenseType = new URL(figure.license).pathname.split("/")[2].toUpperCase();
  const fullFigure = featured || licenseType.endsWith("-ND");
  return `
    <figure class="blog-card-figure"${fullFigure ? ' data-framing="full"' : ""}>
      <a href="${url}" aria-label="${escapeHtml(post.title)}"><img src="${escapeHtml(figure.url)}" alt="${escapeHtml(caption)}"${figure.localizedCaptions?.[locale.code] ? "" : ' lang="en"'}${featured ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></a>
      <figcaption><a href="${escapeHtml(figure.source)}">${escapeHtml(fullFigure ? strings.fullFigure : strings.figure)} ${escapeHtml(figure.number)}, ${escapeHtml(author)} et al.</a>, <a href="${escapeHtml(figure.license)}">CC ${escapeHtml(licenseType)} 4.0</a></figcaption>
    </figure>`;
}

function weeklyCard(post, locale, strings, pageRoute, { articles, featured = false, heading = "h4" }) {
  const url = escapeHtml(pageRoute(post.slug, locale));
  const dateFormat = new Intl.DateTimeFormat(locale.code, { dateStyle: "long", timeZone: "UTC" });
  const date = dateFormat.formatRange(parseDate(post.weekStart, "weekStart"), new Date(
    parseDate(post.weekEnd, "weekEnd").getTime() - 24 * 60 * 60 * 1000,
  ));
  const cover = articles ? cardCover(post, locale, strings, articles, url, featured) : "";
  return `<article class="blog-card${featured ? " blog-card-feature" : ""}">${cover}
    <div class="blog-card-copy">
      <p class="note-meta"><time datetime="${post.weekStart}">${escapeHtml(date)}</time></p>
      <${heading}><a href="${url}">${escapeHtml(post.title)}</a></${heading}>
      <p>${escapeHtml(post.description)}</p>
      <a class="${featured ? "button primary" : "blog-card-read"}" href="${url}">${escapeHtml(strings.read)} →</a>
    </div>
  </article>`;
}

export function renderHomeBlogCard(pages, locale, strings, pageRoute) {
  const [latest] = weeklyPosts(pages);
  return latest ? weeklyCard(latest, locale, strings, pageRoute, { heading: "h3" }) : "";
}

export function renderBlogFrontPage(pages, locale, strings, pageRoute, articles) {
  const [latest, ...posts] = weeklyPosts(pages);
  if (!latest) return { featured: "", archive: "" };
  if (!strings?.title || !strings?.latest || !strings?.figure || !strings?.read) {
    throw new Error(`Missing blog archive strings for ${locale.code}.`);
  }
  const featured = `<h3 id="blog-latest">${escapeHtml(strings.latest)}</h3>
  <div class="blog-cards">${weeklyCard(latest, locale, strings, pageRoute, { articles, featured: true })}</div>`;
  if (!posts.length) return { featured, archive: "" };
  const monthFormat = new Intl.DateTimeFormat(locale.code, {
    month: "long", year: "numeric", timeZone: "UTC",
  });
  // File each completed edition under the month of its last publication day.
  const months = new Map();
  for (const post of posts) {
    const lastDay = new Date(parseDate(post.weekEnd, "weekEnd").getTime() - 86_400_000);
    const key = lastDay.toISOString().slice(0, 7);
    if (!months.has(key)) months.set(key, { label: monthFormat.format(lastDay), posts: [] });
    months.get(key).posts.push(post);
  }
  const shortMonth = new Intl.DateTimeFormat(locale.code, { month: "long", timeZone: "UTC" });
  const sameYear = new Set([...months.keys()].map((key) => key.slice(0, 4))).size === 1;
  const links = [];
  const sections = [];
  for (const [key, month] of months) {
    const id = `archive-${key}`;
    const label = escapeHtml(month.label);
    const linkLabel = sameYear ? escapeHtml(shortMonth.format(parseDate(`${key}-01`, "month"))) : label;
    links.push(`<a href="#${id}">${linkLabel}</a>`);
    const cards = month.posts.map((post) =>
      weeklyCard(post, locale, strings, pageRoute, { articles, heading: "h5" })).join("\n");
    sections.push(`<section class="archive-month" aria-labelledby="${id}">
      <h4 id="${id}" tabindex="-1">${label}</h4><div class="blog-cards">${cards}</div>
    </section>`);
  }
  const archive = `<section class="blog-archive" aria-labelledby="blog-archive-title">
    <h3 id="blog-archive-title">${escapeHtml(strings.title)}</h3>
    <nav class="archive-month-links" aria-label="${escapeHtml(strings.months)}">${links.join(" ")}</nav>
    ${sections.join("\n")}
  </section>`;
  return { featured, archive };
}
