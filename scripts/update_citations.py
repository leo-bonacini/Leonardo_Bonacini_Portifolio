#!/usr/bin/env python3
"""Check (and optionally apply) citation count updates from Google Scholar.

Run on demand — not scheduled. Fetches the public Scholar profile, matches
each paper to a <article class="pub-card"> block in index.html by title,
and reports any citation counts that changed.

Usage:
    python3 scripts/update_citations.py            # dry run, prints a report
    python3 scripts/update_citations.py --apply     # also rewrites index.html
"""
import argparse
import difflib
import re
import sys
import unicodedata
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SCHOLAR_USER = "VT5a9SMAAAAJ"
SCHOLAR_URL = f"https://scholar.google.com.br/citations?user={SCHOLAR_USER}&hl=en&cstart=0&pagesize=100"
INDEX_HTML = Path(__file__).resolve().parent.parent / "index.html"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

ARTICLE_RE = re.compile(r'<article class="pub-card[^"]*">.*?</article>', re.DOTALL)
TITLE_RE = re.compile(r'<h3 class="pub-title">(.*?)</h3>', re.DOTALL)
NUM_RE = re.compile(r'(<span class="pub-cite-num">)(.*?)(</span>)', re.DOTALL)
LABEL_RE = re.compile(r'(<span class="pub-cite-label">)(.*?)(</span>)', re.DOTALL)
# Matches the "<!-- N citations -->" marker comment just above an <article>,
# capturing the number so it can be kept in sync too.
PRECEDING_COMMENT_RE = re.compile(r'<!--\s*(\d+)( citations?)([^>]*?)-->\s*$', re.DOTALL)


def normalize(title: str) -> str:
    title = unicodedata.normalize("NFKD", title)
    title = "".join(c for c in title if not unicodedata.combining(c))
    title = re.sub(r"[^a-z0-9 ]", " ", title.lower())
    return re.sub(r"\s+", " ", title).strip()


def fetch_scholar_papers() -> list[dict]:
    resp = requests.get(SCHOLAR_URL, headers={"User-Agent": USER_AGENT}, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    rows = soup.select("tr.gsc_a_tr")
    if not rows:
        raise RuntimeError(
            "No publication rows found — Scholar may have served a CAPTCHA "
            "or changed its page layout. Try again later or check manually."
        )
    papers = []
    for row in rows:
        title_el = row.select_one(".gsc_a_at")
        cites_el = row.select_one(".gsc_a_c a")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        cites_text = cites_el.get_text(strip=True) if cites_el else ""
        cites = int(cites_text) if cites_text.isdigit() else 0
        papers.append({"title": title, "citations": cites, "norm": normalize(title)})
    return papers


def parse_index_articles(html: str) -> list[dict]:
    """Extract one entry per <article class="pub-card">, with absolute file
    offsets for its citation-number span so edits can be applied precisely."""
    articles = []
    for art_match in ARTICLE_RE.finditer(html):
        block = art_match.group(0)
        title_m = TITLE_RE.search(block)
        num_m = NUM_RE.search(block)
        label_m = LABEL_RE.search(block)
        if not (title_m and num_m and label_m):
            continue
        title = title_m.group(1).strip()
        raw_num = num_m.group(2).strip()
        current = 0 if raw_num in ("—", "-") else int(raw_num)
        base = art_match.start()

        comment_m = PRECEDING_COMMENT_RE.search(html, 0, base)
        comment_num_start = comment_num_end = None
        comment_label_start = comment_label_end = None
        if comment_m:
            comment_num_start, comment_num_end = comment_m.start(1), comment_m.end(1)
            comment_label_start, comment_label_end = comment_m.start(2), comment_m.end(2)

        articles.append(
            {
                "title": title,
                "norm": normalize(title),
                "current": current,
                "raw_num": raw_num,
                "num_start": base + num_m.start(2),
                "num_end": base + num_m.end(2),
                "label_start": base + label_m.start(2),
                "label_end": base + label_m.end(2),
                "comment_num_start": comment_num_start,
                "comment_num_end": comment_num_end,
                "comment_label_start": comment_label_start,
                "comment_label_end": comment_label_end,
            }
        )
    return articles


def best_match(norm_title: str, papers: list[dict]) -> dict | None:
    # Prefer an exact normalized match; among duplicates (Scholar sometimes
    # lists the same paper twice under different venues) take the highest count.
    exact = [p for p in papers if p["norm"] == norm_title]
    if exact:
        return max(exact, key=lambda p: p["citations"])
    close = difflib.get_close_matches(
        norm_title, [p["norm"] for p in papers], n=1, cutoff=0.75
    )
    if close:
        candidates = [p for p in papers if p["norm"] == close[0]]
        return max(candidates, key=lambda p: p["citations"])
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="rewrite index.html in place")
    args = parser.parse_args()

    html = INDEX_HTML.read_text(encoding="utf-8")
    articles = parse_index_articles(html)
    print(f"Fetching {SCHOLAR_URL} ...")
    papers = fetch_scholar_papers()

    changes = []
    unmatched = []
    for art in articles:
        match = best_match(art["norm"], papers)
        if match is None:
            unmatched.append(art["title"])
            continue
        if match["citations"] != art["current"]:
            changes.append((art, match))

    if unmatched:
        print("\nCould not match on Scholar (left as-is):")
        for t in unmatched:
            print(f"  - {t}")

    if not changes:
        print("\nAll citation counts already match Google Scholar. Nothing to do.")
        return

    print("\nCitation count changes:")
    for art, match in changes:
        print(f"  {art['current']:>3} -> {match['citations']:<3}  {art['title']}")

    if not args.apply:
        print("\nDry run only. Re-run with --apply to write these into index.html.")
        return

    # Apply edits back-to-front so earlier offsets stay valid as the string shifts.
    edits = []
    for art, match in changes:
        new_num = str(match["citations"])
        new_label = "citation" if match["citations"] == 1 else "citations"
        edits.append((art["num_start"], art["num_end"], new_num))
        edits.append((art["label_start"], art["label_end"], new_label))
        if art["comment_num_start"] is not None:
            edits.append((art["comment_num_start"], art["comment_num_end"], new_num))
            edits.append(
                (art["comment_label_start"], art["comment_label_end"], f" {new_label}")
            )
    edits.sort(key=lambda e: e[0], reverse=True)

    for start, end, new_text in edits:
        html = html[:start] + new_text + html[end:]

    INDEX_HTML.write_text(html, encoding="utf-8")
    print(f"\nUpdated {len(changes)} citation count(s) in index.html.")
    print("Note: the 'new' badge (pub-citations-new class / em-dash) for previously")
    print("uncited papers was not auto-changed — check the diff and adjust by hand.")


if __name__ == "__main__":
    sys.exit(main())
