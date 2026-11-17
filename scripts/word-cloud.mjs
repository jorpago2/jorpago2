const stopWords = {
  es: `para como pero entre cada desde hasta sobre cuando donde porque mientras también aunque está están este esta estos estas estos otro otra otros otras una unos unas con sin por del las los que quien qué sus más menos muy todo toda todos todas puede pueden podría podrían tiene tienen hacia mediante después antes durante según aquí allí así sea sido ser son hay fue fueron hace hacen hacer hecho esto esa ese esas esos mismo misma mismo misma mismos mismas solo sólo aún todavía desde han había había una unos vez veces autores artículo artículos trabajo trabajos equipo autores colaboradores dispositivo dispositivos material materiales fotónico fotónica circuito circuitos luz memoria sensor sensores`,
  en: `about above after again against also among and any are because been before being below between both but can could did does each every few for from had has have having her here hers him his how into its itself just makes more most much nor not now off once one only other our ours out over own same she should some such than that the their theirs them then there these they this those through too under until very was were what when where which while who why will with would you your yours authors colleagues paper papers study studies work team device devices material materials photonic circuit circuits light memory sensor sensors`,
  ca: `amb sense per del dels als les els que qui què les les seu seus més menys molt tot tota tots totes pot poden podria podrien té tenen cap cal col mitjançant després abans durant segons ací allà així siga són han havia una uns unes vegades això aquesta aquest aquestes aquests mateix mateixa mateixos mateixes només encara com però entre cada des fins sobre quan on perquè mentre també encara està estan altre altra altres autors article articles treball treballs equip col·laboradors dispositiu dispositius material materials fotònic fotònica circuit circuits llum memòria sensor sensors`,
};

// Keep subject words: the list above removes only common function words and
// editorial boilerplate, not scientific terms that readers expect to see.
const keepWords = {
  es: `material materiales fotónico fotónica circuito circuitos luz memoria sensor sensores dispositivo dispositivos`,
  en: `material materials photonic circuit circuits light memory sensor sensors device devices`,
  ca: `material materials fotònic fotònica circuit circuits llum memòria sensor sensors dispositiu dispositius`,
};

function plainText(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, " ");
}

export function countBlogWords(fragments, locale) {
  const excluded = new Set(stopWords[locale].split(/\s+/));
  for (const word of keepWords[locale].split(/\s+/)) excluded.delete(word);
  const counts = new Map();
  for (const fragment of fragments) {
    // Count the prose and section titles; omit figures, captions, links and metadata.
    const clean = fragment.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, " ")
      .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " ")
      .replace(/<p\b[^>]*class="[^"]*"[^>]*>[\s\S]*?<\/p>/gi, " ");
    const parts = [...clean.matchAll(/<(?:h3|h4|p)\b[^>]*>([\s\S]*?)<\/(?:h3|h4|p)>/gi)];
    for (const [, part] of parts) {
      const words = plainText(part).toLocaleLowerCase(locale).match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
      for (const word of words) {
        if (word.length < 3 || excluded.has(word)) continue;
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
  }
  return [...counts].filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], locale)).slice(0, 30);
}

export function renderBlogWordCloud(fragments, locale, strings) {
  const counts = countBlogWords(fragments, locale);
  if (!counts.length) return "";
  const max = counts[0][1];
  const min = counts.at(-1)[1];
  const labels = counts.map(([word, count]) => {
    const level = max === min ? 3 : 1 + Math.round(4 * (count - min) / (max - min));
    return `<li class="cloud-level-${level}"><span aria-label="${word}: ${count} ${strings.occurrences}">${word}</span></li>`;
  }).join("\n");
  return `<section class="blog-word-cloud" aria-labelledby="word-cloud-title"><h3 id="word-cloud-title">${strings.title}</h3><p>${strings.description}</p><ul class="word-cloud">${labels}</ul></section>`;
}
