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

export function renderBlogArchive(pages, locale, strings, pageRoute) {
  const posts = weeklyPosts(pages);
  if (!posts.length) return "";
  if (!strings?.title || !strings?.weekOf) throw new Error(`Missing blog archive strings for ${locale.code}.`);
  const dateFormat = new Intl.DateTimeFormat(locale.code, { dateStyle: "long", timeZone: "UTC" });
  const monthFormat = new Intl.DateTimeFormat(locale.code, { month: "long", year: "numeric", timeZone: "UTC" });
  const groups = new Map();
  for (const post of posts) {
    // Group by the month in which the interval closes, including New Year weeks.
    const month = post.weekEnd.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(post);
  }
  const groupHtml = [...groups.entries()].map(([month, entries], index) => {
    const title = monthFormat.format(parseDate(`${month}-01`, "archive month"));
    const rows = entries.map((post) => {
      const date = dateFormat.format(parseDate(post.weekStart, "weekStart"));
      return `<li><p class="note-meta">${escapeHtml(strings.weekOf)} <time datetime="${post.weekStart}">${escapeHtml(date)}</time></p><h4><a href="${escapeHtml(pageRoute(post.slug, locale))}">${escapeHtml(post.title)}</a></h4><p>${escapeHtml(post.description)}</p></li>`;
    }).join("\n");
    return `<details${index === 0 ? " open" : ""}><summary>${escapeHtml(title)}</summary><ol>\n${rows}\n</ol></details>`;
  }).join("\n");
  return `<section class="blog-archive" aria-labelledby="blog-archive-title"><h3 id="blog-archive-title">${escapeHtml(strings.title)}</h3>\n${groupHtml}\n</section>`;
}
