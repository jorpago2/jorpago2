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
FIGURES = [
    ("s41467-026-79595-2", "Tang", "41467_2026_79595_Fig1_HTML.png", {
        "es": "Detector de diseleniuro de tungsteno integrado en una guía de niobato de litio.",
        "en": "Tungsten diselenide detector integrated into a lithium niobate waveguide.",
        "ca": "Detector de diseleniur de tungsté integrat en una guia de niobat de liti."}),
    ("s41586-026-11272-2", "Yang", "41586_2026_11272_Fig1_HTML.png", {
        "es": "Preparación y transferencia de una membrana de dióxido de titanio monocristalino.",
        "en": "Preparation and transfer of a single-crystal titanium dioxide membrane.",
        "ca": "Preparació i transferència d'una membrana de diòxid de titani monocristal·lí."}),
    ("s41467-026-79139-8", "Li", "41467_2026_79139_Fig1_HTML.png", {
        "es": "Comparación entre el procesado convencional y el depósito acuoso de montmorillonita.",
        "en": "Comparison of conventional processing with aqueous montmorillonite deposition.",
        "ca": "Comparació entre el processament convencional i el dipòsit aquós de montmoril·lonita."}),
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


def figure(index: int, locale: str) -> str:
    identifier, author, filename, captions = FIGURES[index]
    doi = f"10.1038/{identifier}"
    media = f"https://media.springernature.com/full/springer-static/image/art%3A10.1038%2F{identifier}/MediaObjects/{filename}"
    article_figure = f"https://www.nature.com/articles/{identifier}/figures/1"
    unchanged = {"es": "Sin cambios", "en": "Unmodified", "ca": "Sense canvis"}[locale]
    caption = html.escape(captions[locale])
    return (f'<figure class="paper-figure weekly-figure"><a href="{article_figure}">'
            f'<img src="{media}" alt="{caption}" loading="lazy"></a>'
            f'<figcaption>{caption} <a href="https://doi.org/{doi}">{author} et al.</a> · '
            f'<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · {unchanged}.</figcaption></figure>')


def render(source: str, locale: str, day: date) -> tuple[str, str, str]:
    body = visible_text(source)
    lines = body.splitlines()
    heading = next((line[2:].strip() for line in lines if line.startswith("# ")), "")
    if not heading:
        raise ValueError("Missing first-level title")
    topic_sections = re.split(r"^## ", body, flags=re.M)[1:4]
    topics = []
    category = re.compile(r"^(fot[oóò]nica|photonics|electr[oóò]nica|electronics|materials|materiales)$", re.I)
    for section in topic_sections:
        section_lines = section.splitlines()
        label = section_lines[0].strip()
        if category.fullmatch(label):
            label = next((line[4:].strip() for line in section_lines if line.startswith("### ")), label)
        label = re.sub(r"^(?:fot[oóò]nica|photonics|electr[oóò]nica|electronics|materials|materiales)\s*[—–-]\s*", "", label, flags=re.I)
        topics.append(label)
    if re.match(r"^(?:semana|setmana|week|del\s+\d|from\s+)", heading, re.I) and topics:
        heading = topics[0]
    lines = lines[next(i for i, line in enumerate(lines) if line.startswith("# ")) + 1 :]
    blocks = re.split(r"\n\s*\n", "\n".join(lines).strip())
    rendered = []
    section_number = 0
    for block in blocks:
        text = " ".join(block.splitlines()).strip()
        if not text or text in {"---", "***"}:
            continue
        # Draft status is project information, not part of the public article.
        if re.search(r"\b(?:borrador|esborrany|draft)\b", text, re.I) and len(text) < 220:
            continue
        if text.startswith("### "):
            if section_number == 1 and text[4:].strip() == heading:
                continue
            rendered.append(f"<h4>{inline(text[4:])}</h4>")
        elif text.startswith("## "):
            if day == date(2026, 11, 11) and 1 <= section_number <= 3:
                rendered.append(figure(section_number - 1, locale))
            section_number += 1
            if section_number == 4:
                rendered.append(f'<section class="notes-mention"><h4>{inline(text[3:])}</h4>')
            elif section_number == 1 and text[3:].strip() == heading:
                continue
            else:
                rendered.append(f"<h3>{inline(text[3:])}</h3>")
        elif text.startswith("- "):
            items = re.split(r"\s+-\s+", text[2:])
            rendered.append("<ul>" + "".join(f"<li>{inline(item)}</li>" for item in items) + "</ul>")
        else:
            citation = re.search(r"\*et al\.\*|\*Nature|\*Advanced|\*ACS|publicaci[oó] electr[oò]nica|published online|first published", text, re.I)
            css = ' class="note-meta"' if citation else ""
            rendered.append(f"<p{css}>{inline(text)}</p>")
    if section_number == 4:
        rendered.append("</section>")
    labels = {
        "es": ("Todas las entradas", "Semana del"),
        "en": ("All posts", "Week of"),
        "ca": ("Totes les entrades", "Setmana ·"),
    }
    back, prefix = labels[locale]
    description = " · ".join(topics)
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
                f'<h3>{html.escape(heading)}</h3>\n' + "\n".join(rendered) + "\n</section></div>\n")
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
                week.append((locale, start, title, description, fragment))
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
        pages = [page for page in pages if not re.fullmatch(r"post-week-\d{4}-\d{2}-\d{2}", page["id"])]
        for code, day, title, description, fragment in prepared:
            if code != locale:
                continue
            page_id = f"post-week-{day.isoformat()}"
            pages.append({"id": page_id, "slug": f"blog-{day.isoformat()}", "title": title,
                          "description": description, "modified": "2026-11-18T00:00:00",
                          "weekStart": day.isoformat(), "weekEnd": (day + timedelta(days=7)).isoformat()})
            (folder / f"{page_id}.html").write_text(fragment, encoding="utf-8")
        index_path.write_text(json.dumps(pages, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(prepared) // 3} weeks in three languages")


if __name__ == "__main__":
    main()
