"""Import reviewed trilingual weekly drafts into the static site.

The script refuses to modify the site unless every expected draft exists in all
three languages, has no translation-review warning and retains its links.
"""

from __future__ import annotations

import html
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DRAFTS = ROOT.parent / "investigacion_2026"
START = date(2025, 12, 31)
WEEKS = 46
LINK = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
WARNING = re.compile(r"traducci[oó]n autom[aá]tica sin revisar|automatic translation.*not reviewed|traducci[oó] autom[aà]tica sense revisar|no publicar", re.I)
METADATA_PATH = ROOT / "content" / "data" / "weekly-research-2026.json"
DATA = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
WEEKLY_LEADS = json.loads(METADATA_PATH.with_name("weekly-leads-2026.json").read_text(encoding="utf-8"))
WEEKLY_TEASERS = json.loads(METADATA_PATH.with_name("weekly-teasers-2026.json").read_text(encoding="utf-8"))
METADATA = DATA["articles"]
INSTITUTIONS = DATA["institutions"]
COUNTRIES = {
    "AU": ("Australia", "Australia", "Austràlia"), "CN": ("China", "China", "Xina"),
    "BE": ("Bélgica", "Belgium", "Bèlgica"), "CA": ("Canadá", "Canada", "Canadà"),
    "CH": ("Suiza", "Switzerland", "Suïssa"), "GB": ("Reino Unido", "United Kingdom", "Regne Unit"),
    "DE": ("Alemania", "Germany", "Alemanya"), "HK": ("Hong Kong, China", "Hong Kong, China", "Hong Kong, Xina"),
    "JP": ("Japón", "Japan", "Japó"), "NO": ("Noruega", "Norway", "Noruega"),
    "KR": ("Corea del Sur", "South Korea", "Corea del Sud"), "PT": ("Portugal", "Portugal", "Portugal"),
    "SA": ("Arabia Saudí", "Saudi Arabia", "Aràbia Saudita"), "SE": ("Suecia", "Sweden", "Suècia"),
    "SG": ("Singapur", "Singapore", "Singapur"), "TW": ("Taiwán", "Taiwan", "Taiwan"),
    "US": ("Estados Unidos", "United States", "Estats Units"),
}
ARTICLE_DOI = re.compile(r"10\.\d{4,9}/[\w.-]+", re.I)
READING = [
    ("10.1038/s41566-026-02036-5", "https://www.nju.edu.cn/info/1067/486531.htm", {
        "es": "La Universidad de Nankín explica el proceso y sus aplicaciones en emisores infrarrojos (en chino).",
        "en": "Nanjing University explains the process and its applications to infrared emitters (in Chinese).",
        "ca": "La Universitat de Nanjing explica el procés i les seues aplicacions als emissors infrarojos (en xinés)."}),
]
RELATED = [
    ({"10.1038/s41467-025-66810-9", "10.1038/s41467-026-68905-3"},
     "https://www.nature.com/articles/s41578-022-00434-z", {
        "es": "Cómo aprovechar la dinámica de los memristores para calcular (Nature Reviews Materials, en inglés).",
        "en": "How memristor dynamics can be used for computation (Nature Reviews Materials).",
        "ca": "Com aprofitar la dinàmica dels memristors per a calcular (Nature Reviews Materials, en anglés)."}),
    ({"10.1038/s41586-026-11272-2"},
     "https://www.nature.com/articles/s41467-023-41779-5", {
        "es": "Qué dificulta integrar contactos y dieléctricos en transistores 2D (Nature Communications, en inglés).",
        "en": "What makes contacts and dielectrics difficult to integrate in 2D transistors (Nature Communications).",
        "ca": "Què dificulta la integració de contactes i dielèctrics en transistors 2D (Nature Communications, en anglés)."}),
    ({"10.1038/s41467-026-68648-1", "10.1038/s41467-026-71599-2", "10.1038/s41377-026-02325-2"},
     "https://news.mit.edu/2024/photonic-processor-could-enable-ultrafast-ai-computations-1202", {
        "es": "Un procesador fotónico que incorpora operaciones no lineales en el chip (MIT News, en inglés).",
        "en": "A photonic processor that brings nonlinear operations onto the chip (MIT News).",
        "ca": "Un processador fotònic que incorpora operacions no lineals en el xip (MIT News, en anglés)."}),
    ({"10.1038/s41467-026-69880-5", "10.1038/s41467-026-77674-y"},
     "https://www.nature.com/articles/s41377-022-01029-7", {
        "es": "Otro uso de los moduladores de niobato de litio, esta vez con fotones individuales (Light: Science & Applications, en inglés).",
        "en": "Another use of lithium niobate modulators, this time with individual photons (Light: Science & Applications).",
        "ca": "Un altre ús dels moduladors de niobat de liti, ara amb fotons individuals (Light: Science & Applications, en anglés)."}),
    ({"10.1038/s41427-026-00645-8"},
     "https://www.nature.com/articles/s41467-024-47206-7", {
        "es": "Cómo se integran materiales de cambio de fase en circuitos fotónicos fabricados en una fundición (Nature Communications, en inglés).",
        "en": "Integrating phase-change materials into foundry-made photonic circuits (Nature Communications).",
        "ca": "Com integrar materials de canvi de fase en circuits fotònics fabricats en una foneria (Nature Communications, en anglés)."}),
]


def links(text: str) -> set[str]:
    return set(re.findall(r"https?://[^\s)]+", text))


def visible_text(source: str) -> str:
    # The fifth level-two heading, when present, starts internal editorial notes.
    sections = list(re.finditer(r"^## ", source, re.M))
    if len(sections) < 4:
        raise ValueError("Expected three research sections and a highlights section")
    return source[: sections[4].start()] if len(sections) > 4 else source


def inline(source: str) -> str:
    parts = []
    position = 0
    for match in LINK.finditer(source):
        parts.append(html.escape(source[position:match.start()]))
        parts.append(f'<a href="{html.escape(match.group(2), quote=True)}">{html.escape(match.group(1))}</a>')
        position = match.end()
    parts.append(html.escape(source[position:]))
    result = "".join(parts)
    result = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", result)
    return re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", result)


def article_doi(section: str) -> str:
    text = re.sub(r"nature\.com/articles/(s[a-z0-9-]+)", r"doi.org/10.1038/\1", section.replace("%2F", "/"))
    hit = ARTICLE_DOI.search(text)
    return hit.group().lower().rstrip(".") if hit else ""


def reference_html(doi: str, number: int, day: date, *, mention: bool = False) -> str | None:
    ref = METADATA.get(doi, {}).get("reference")
    if not ref or not all(ref.get(key) for key in ("title", "author", "container-title")):
        return None
    if any("," in author.get("given", "") for author in ref["author"]):
        raise ValueError(f"{doi} has an unparsed author name")
    names = []
    for author in ref["author"][:6]:
        initials = " ".join("-".join(part[0] + "." for part in name.split("-") if part)
                            for name in re.findall(r"[\w-]+", author.get("given", "")))
        names.append(" ".join(filter(None, [initials, author.get("family", author.get("name", ""))])))
    if len(ref["author"]) > 6:
        names = [names[0] + " et al."]
    elif len(names) > 1:
        names = [", ".join(names[:-1]) + (", and " if len(names) > 2 else " and ") + names[-1]]
    journal = ref["container-title"][0]
    title = re.sub(r"</?(?:jats:)?(?:i|b)>", "", ref["title"][0])
    title = re.sub(r"</?(?:jats:)?(?:sub|sup)>", "", title)
    details = [f"vol. {ref['volume']}"] if ref.get("volume") else []
    if ref.get("issue"):
        details.append(f"no. {ref['issue']}")
    if ref.get("article-number"):
        details.append(f"Art. no. {ref['article-number']}")
    elif ref.get("page"):
        page = ref["page"]
        details.append(f"{'pp.' if '-' in page else 'p.'} {page.replace('-', '–')}")
    published = date.fromisoformat(METADATA[doi]["versionOfRecordDate"])
    if not day <= published < day + timedelta(days=7):
        raise ValueError(f"{doi} was published outside the week starting {day}")
    months = ("Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec.")
    details.append(f"{months[published.month - 1]} {published.day}, {published.year}")
    css = "mention-reference" if mention else "weekly-reference"
    return (f'<p class="note-meta {css}">[{number}] {html.escape(", ".join(names))}, '
            f'“{html.escape(title)},” <cite>{html.escape(journal)}</cite>, '
            f'{html.escape(", ".join(details))}, doi <a href="https://doi.org/{doi}">{doi}</a>.</p>')


def institutions_html(doi: str, locale: str) -> str:
    institutions = INSTITUTIONS.get(doi, [])
    if not institutions:
        return ""
    translation = ("es", "en", "ca").index(locale)
    label = ("Instituciones participantes", "Participating institutions", "Institucions participants")[translation]
    entries = [f'<a href="{html.escape(url)}">{html.escape(name)}</a> ({COUNTRIES[country][translation]})'
               for url, name, country in institutions if country in COUNTRIES]
    return f'<p class="note-meta institutions">{label}<br>{", ".join(entries)}</p>' if entries else ""


def additional_material(locale: str, doi: str) -> str:
    official = METADATA.get(doi, {}).get("figure")
    if official:
        label = {"es": "Figura", "en": "Figure", "ca": "Figura"}[locale]
        unchanged = {"es": "Sin cambios", "en": "Unmodified", "ca": "Sense canvis"}[locale]
        credit = METADATA[doi].get("reference", {}).get("author", [{}])[0].get("family")
        if not credit:
            credit = {"es": "Autores del artículo", "en": "Article authors", "ca": "Autors de l'article"}[locale]
        license_label = "CC " + official["license"].split("/")[-3].upper() + " 4.0"
        result = {key: html.escape(official[key]) for key in ("source", "url", "number", "license")}
        captions = official.get("localizedCaptions", {})
        title = html.escape(captions.get(locale, official["caption"]))
        caption_language = "" if locale in captions else ' lang="en"'
        figure_html = (
            f'<figure class="paper-figure weekly-figure"><a href="{result["source"]}">'
            f'<img src="{result["url"]}" alt="{title}"{caption_language} loading="lazy"></a>'
            f'<figcaption>{label} {result["number"]}. <span{caption_language}>{title}</span> '
            f'<a href="https://doi.org/{doi}">{html.escape(credit)} et al.</a>, '
            f'<a href="{result["license"]}">{license_label}</a>. {unchanged}.</figcaption></figure>'
        )
    else:
        figure_html = ""
    reading = next(((url, label[locale]) for key, url, label in READING if key == doi), None)
    if not reading:
        reading = next(((url, label[locale]) for dois, url, label in RELATED if doi in dois), None)
    label = {"es": "Lectura relacionada", "ca": "Lectura relacionada", "en": "Related reading"}[locale]
    if reading:
        url, description = reading
        figure_html += f'<aside class="further-reading"><p>{label}. <a href="{html.escape(url, quote=True)}">{html.escape(description)}</a></p></aside>'
    elif background := METADATA.get(doi, {}).get("backgroundReading"):
        url = "https://doi.org/" + html.escape(background["doi"], quote=True)
        title = html.escape(background["title"])
        journal = html.escape(background["journal"])
        figure_html += (f'<aside class="further-reading"><p>{label}. <a href="{url}" lang="en">{title}</a>. '
                        f'<cite>{journal}</cite> ({background["year"]}).</p></aside>')
    return figure_html


def render(source: str, locale: str, day: date) -> tuple[str, str, str]:
    body = visible_text(source).replace(" · ", ", ")
    lines = body.splitlines()
    heading = next((line[2:].strip() for line in lines if line.startswith("# ")), "")
    if not heading:
        raise ValueError("Missing first-level title")
    topic_sections = re.split(r"^## ", body, flags=re.M)[1:4]
    dois = [article_doi(section) for section in topic_sections]
    topics = []
    category = re.compile(r"^(fot[oóò]nica|photonics|electr[oóò]nica|electronics|materials|materiales)$", re.I)
    for section in topic_sections:
        section_lines = section.splitlines()
        label = section_lines[0].strip()
        if category.fullmatch(label):
            label = next((line[4:].strip() for line in section_lines if line.startswith("### ")), label)
        label = re.sub(r"^(?:fot[oóò]nica|photonics|electr[oóò]nica|electronics|materials|materiales)\s*[—–-]\s*", "", label, flags=re.I)
        topics.append(label)
    if len(topics) != 3 or any(not title or category.fullmatch(title) for title in topics):
        raise ValueError("Expected a title for each of the three weekly reviews")
    labels = {
        "es": ("Todas las entradas", "Semana del", ("Fotónica", "Electrónica", "Materiales"), "También me ha llamado la atención"),
        "en": ("All posts", "Week of", ("Photonics", "Electronics", "Materials"), "Also worth a look"),
        "ca": ("Totes les entrades", "Setmana del", ("Fotònica", "Electrònica", "Materials"), "També m’ha cridat l’atenció"),
    }
    back, prefix, category_labels, mentions_label = labels[locale]
    mentions_source = {
        "es": "Estos dos apuntes se basan en los resúmenes públicos de artículos bajo suscripción.",
        "ca": "Aquests dos apunts es basen en els resums públics d’articles sota subscripció.",
        "en": "These two notes draw on the public abstracts of papers published under subscription.",
    }[locale]
    lines = lines[next(i for i, line in enumerate(lines) if line.startswith("# ")) + 1 :]
    blocks = re.split(r"\n\s*\n", "\n".join(lines).strip())
    rendered = []
    section_number = 0
    reference_position = 0
    rendered_references = set()
    lead = ""
    date_line = re.compile(r"\*{0,2}(?:Del? |Semana del |Setmana de[l]? |Week (?:of|from) |From |\d)[^.!?]*\b20\d{2}\.?\*{0,2}")

    def add_missing_reference() -> None:
        if 1 <= section_number <= 3 and section_number not in rendered_references:
            doi = dois[section_number - 1]
            citation = reference_html(doi, section_number, day)
            if citation:
                rendered.insert(reference_position, citation + institutions_html(doi, locale))

    for block in blocks:
        text = " ".join(block.splitlines()).strip()
        if not text or text in {"---", "***"}:
            continue
        # Draft status is project information, not part of the public article.
        if section_number == 0 and re.search(r"\b(?:borrador|esborrany|draft)\b", text, re.I) and len(text) < 220:
            continue
        if text.startswith("### "):
            if 1 <= section_number <= 3 and text[4:] == topics[section_number - 1]:
                continue
            rendered.append(f"<h4>{inline(text[4:])}</h4>")
        elif text.startswith("## "):
            if section_number == 0 and not lead:
                lead = WEEKLY_LEADS.get(day.isoformat(), {}).get(locale)
                if not lead:
                    raise ValueError(f"Missing weekly lead for {day} ({locale})")
                rendered.append(f'<p class="weekly-lead">{html.escape(lead)}</p>')
            if 1 <= section_number <= 3:
                add_missing_reference()
                rendered.append(additional_material(locale, dois[section_number - 1]))
                rendered.append("</article>")
            section_number += 1
            if section_number == 4:
                rendered.append(f'<section class="notes-mention"><h3>{html.escape(mentions_label)}</h3>'
                                f'<p class="note-meta mention-source">{html.escape(mentions_source)}</p>')
            else:
                if section_number > 4:
                    raise ValueError("Unexpected section after the weekly mentions")
                rendered.append('<article class="weekly-review">')
                rendered.append(f'<p class="eyebrow weekly-review-category">{category_labels[section_number - 1]}</p>')
                rendered.append(f'<h3 class="weekly-review-title">{inline(topics[section_number - 1])}</h3>')
                reference_position = len(rendered)
        elif text.startswith("- "):
            items = re.split(r"\s+-\s+", text[2:])
            entries = []
            for index, item in enumerate(items):
                reference = reference_html(article_doi(item), index + 4, day, mention=True) if section_number == 4 else None
                if reference:
                    # The citation already carries the journal and publication date.
                    item = re.sub(r"\s+\*[^*]+\*, [^*\n]+?20\d\d\.$", "", item)
                entries.append(f"<li>{inline(item)}{reference or ''}</li>")
            rendered.append("<ul>" + "".join(entries) + "</ul>")
        elif section_number == 0 and not date_line.fullmatch(text):
            lead_html = inline(text)
            rendered.append(f'<p class="weekly-lead">{lead_html}</p>')
            if not lead:
                lead = html.unescape(re.sub(r"<[^>]+>", "", lead_html))
        else:
            citation = re.match(r'^(?:[A-Z]\.\s?|\[[«“"])', text) or re.search(
                r"\*et al\.\*|publicaci[oó] electr[oò]nica|published online|first published", text, re.I)
            candidate = article_doi(text)
            if citation and 1 <= section_number <= 3 and candidate == dois[section_number - 1] and section_number not in rendered_references:
                citation_html = reference_html(candidate, section_number, day)
                if not citation_html:
                    citation_html = f'<p class="note-meta weekly-reference">[{section_number}] {inline(text)}</p>'
                rendered.insert(reference_position, citation_html + institutions_html(candidate, locale))
                rendered_references.add(section_number)
                continue
            css = ' class="note-meta"' if citation and candidate else ""
            rendered.append(f"<p{css}>{inline(text)}</p>")
    if section_number != 4:
        raise ValueError("Missing weekly mentions")
    rendered.append("</section>")
    description = WEEKLY_TEASERS.get(day.isoformat(), {}).get(locale) or lead
    locale_path = {"es": "/es/lecturas/", "en": "/blog/", "ca": "/va/lectures/"}[locale]
    months = {
        "es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
        "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
        "ca": ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"],
    }
    month = months[locale][day.month - 1]
    date_label = (f"{prefix} {month} {day.day}, {day.year}" if locale == "en" else
                  f"{prefix} {day.day} {'d’' if locale == 'ca' and month[0] in 'aeiou' else 'de '}{month} de {day.year}")
    fragment = (f'<div class="blog-edition"><p class="blog-back"><a href="/jorpago2{locale_path}">← {back}</a></p>'
                f'<section class="notes-issue weekly-copy"><p class="eyebrow">{html.escape(date_label)}</p>'
                f'<h2 class="weekly-issue-title">{html.escape(heading)}</h2>\n' + "\n".join(rendered) + "\n</section></div>\n")
    return heading, description, fragment


def main() -> None:
    prepared = []
    errors = []
    for index in range(WEEKS):
        start = START + timedelta(days=7 * index)
        stem = f"semana_{start.isoformat()}"
        files = {"es": DRAFTS / f"{stem}.md", "en": DRAFTS / f"{stem}_en.md", "ca": DRAFTS / f"{stem}_ca.md"}
        try:
            texts = {locale: path.read_text(encoding="utf-8") for locale, path in files.items()}
            week = []
            for locale, text in texts.items():
                if WARNING.search(text):
                    raise ValueError(f"{locale} contains an unreviewed translation warning")
                if locale != "es" and links(visible_text(text)) != links(visible_text(texts["es"])):
                    raise ValueError(f"{locale} does not retain the source links")
                title, description, fragment = render(text, locale, start)
                first_review = re.split(r"^## ", visible_text(text), flags=re.M)[1]
                week.append((locale, start, title, description, fragment, article_doi(first_review)))
            prepared.extend(week)
        except (OSError, ValueError) as error:
            errors.append(f"{stem}: {error}")
    if errors and "--preview-reviewed" not in sys.argv:
        raise SystemExit("No changes made. Drafts need attention:\n" + "\n".join(errors))
    if errors:
        print(f"Preview only: skipping {len(errors)} incomplete or unreviewed weeks")

    for locale in ("es", "en", "ca"):
        folder = ROOT / "content" / "pages" / locale
        index_path = folder / "pages.json"
        pages = json.loads(index_path.read_text(encoding="utf-8"))
        previous_covers = {page["id"]: page["coverDoi"] for page in pages if page.get("coverDoi")}
        pages = [page for page in pages if not re.fullmatch(r"post-week-\d{4}-\d{2}-\d{2}", page["id"])]
        for code, day, title, description, fragment, cover_doi in prepared:
            if code != locale:
                continue
            page_id = f"post-week-{day.isoformat()}"
            previous_cover = previous_covers.get(page_id)
            if previous_cover and f'href="https://doi.org/{previous_cover}"' in fragment:
                cover_doi = previous_cover
            pages.append({"id": page_id, "slug": f"blog-{day.isoformat()}", "title": title,
                          "description": description, "modified": "2026-11-19T00:00:00",
                          "weekStart": day.isoformat(), "weekEnd": (day + timedelta(days=7)).isoformat(),
                          "coverDoi": cover_doi})
            (folder / f"{page_id}.html").write_text(fragment, encoding="utf-8")
        index_path.write_text(json.dumps(pages, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(prepared) // 3} weeks in three languages")


if __name__ == "__main__":
    main()
