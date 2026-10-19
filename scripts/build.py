#!/usr/bin/env python3
"""Build docs/index.html from src/shell.html + src/sections/*.html + src/data/*.json.

Usage:
    python3 scripts/build.py [--root DIR] [--strict]

--root   project root (default: parent of this script's folder)
--strict treat warnings as failures (exit 1)

Stdlib only. Errors (exit 1) stop the build; warnings are printed and the build continues.
"""
import argparse
import datetime
import html
import json
import re
import sys
from pathlib import Path

EXPECTED_SECTIONS = [
    "start", "landscape", "basics", "components", "prompt", "prompt-eng",
    "commands", "agents", "github", "glossary", "next",
]
CMD_CATS = {"slash", "cli", "key", "prefix"}

ATTR_RE = re.compile(r'([\w:-]+)\s*=\s*"([^"]*)"')
SECTION_OPEN_RE = re.compile(r"<section\b([^>]*)>", re.I)
H3_RE = re.compile(r"<h3\b([^>]*)>(.*?)</h3>", re.I | re.S)
ID_RE = re.compile(r'\bid\s*=\s*"([^"]+)"', re.I)
TAG_RE = re.compile(r"<[^>]+>")
MERMAID_RE = re.compile(r'<pre\b[^>]*class="[^"]*\bmermaid\b[^"]*"[^>]*>(.*?)</pre>', re.I | re.S)
# node id immediately followed by a bracket/paren/brace that does not start with a quote
UNQUOTED_LABEL_RE = re.compile(r"""(?<![\w"'])[A-Za-z_][\w-]*\s*(?:\[\[|\[\(|\(\(|\[|\(|\{)(?!\s*["'])""")


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def err(self, msg):
        self.errors.append(msg)
        print(f"ERROR   {msg}", file=sys.stderr)

    def warn(self, msg):
        self.warnings.append(msg)
        print(f"WARNING {msg}", file=sys.stderr)


def attrs_of(s):
    return dict(ATTR_RE.findall(s))


def plain(s):
    return html.unescape(TAG_RE.sub("", s)).strip()


def mermaid_source_warnings(src, sec_id, rep):
    raw = src
    if re.search(r"<(?!br\s*/?>)", raw, re.I):
        rep.warn(f"[{sec_id}] mermaid block has an unescaped '<' (use &lt;)")
    if re.search(r"&(?!#?\w+;)", raw):
        rep.warn(f"[{sec_id}] mermaid block has an unescaped '&' (use &amp;)")
    text = html.unescape(raw)
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        rep.warn(f"[{sec_id}] empty mermaid block")
        return
    first = lines[0].strip().lower()
    if re.search(r"%%\{\s*init", text, re.I):
        rep.warn(f"[{sec_id}] mermaid block contains an %%{{init}}%% theme block (the shell sets the theme)")
    if first.startswith(("flowchart", "graph")):
        for ln in lines[1:]:
            s = ln.strip()
            if s.startswith(("%%", "classDef", "class ", "style ", "linkStyle", "click ")):
                continue
            if UNQUOTED_LABEL_RE.search(s):
                rep.warn(f"[{sec_id}] mermaid label may be unquoted: {s[:80]}")
                break
    n_nodes = len(re.findall(r"(?<![\w\"'])[A-Za-z_][\w-]*\s*(?:\[|\(|\{)\s*\"", text))
    if n_nodes > 12:
        rep.warn(f"[{sec_id}] mermaid block has ~{n_nodes} nodes (contract: <= 12)")


def load_sections(sec_dir, rep):
    files = sorted(p for p in sec_dir.glob("*.html") if p.is_file())
    if not files:
        rep.err(f"no section fragments found in {sec_dir}")
    sections = []
    all_ids = {}
    for f in files:
        text = f.read_text(encoding="utf-8").strip()
        name = f.name
        opens = SECTION_OPEN_RE.findall(text)
        if len(opens) != 1 or text.lower().count("</section>") != 1:
            rep.err(f"{name}: must contain exactly one <section> root (found {len(opens)} open / {text.lower().count('</section>')} close)")
            continue
        if not text.lower().startswith("<section") or not text.lower().endswith("</section>"):
            rep.warn(f"{name}: fragment should start with <section> and end with </section> (text outside the root)")
        a = attrs_of(opens[0])
        sid = a.get("id", "")
        if not sid:
            rep.err(f"{name}: <section> has no id")
            continue
        title = a.get("data-title") or sid
        if "data-title" not in a:
            rep.warn(f"{name}: <section> has no data-title (using id)")
        emoji = a.get("data-emoji", "")
        if "chapter" not in a.get("class", "").split():
            rep.warn(f"{name}: <section> should have class=\"chapter\"")
        n_h2 = len(re.findall(r"<h2\b", text, re.I))
        if n_h2 != 1:
            rep.warn(f"{name}: expected exactly one <h2> (found {n_h2})")
        if re.search(r"<script\b", text, re.I):
            rep.warn(f"{name}: contains <script> (not allowed)")
        if re.search(r"<style\b", text, re.I):
            rep.warn(f"{name}: contains <style> (not allowed)")
        if re.search(r"\sstyle\s*=", text, re.I):
            rep.warn(f"{name}: contains inline style= (not allowed)")
        if re.search(r"<img\b[^>]*\bsrc\s*=\s*\"https?:", text, re.I):
            rep.warn(f"{name}: external image (not allowed)")
        for m in re.finditer(r"<a\b[^>]*\bclass=\"[^\"]*\bref\b[^\"]*\"[^>]*>", text, re.I):
            if "noopener" not in m.group(0):
                rep.warn(f"{name}: a.ref link without rel=\"noopener\"")
                break

        h3s = []
        for m in H3_RE.finditer(text):
            im = ID_RE.search(m.group(1))
            t = plain(m.group(2))
            if not im:
                rep.warn(f"{name}: <h3> without id: {t[:40]}")
                continue
            h3s.append((im.group(1), t))

        for i in ID_RE.findall(text):
            if i in all_ids:
                rep.warn(f"duplicate id \"{i}\" ({name} and {all_ids[i]})")
            else:
                all_ids[i] = name
        for m in MERMAID_RE.finditer(text):
            mermaid_source_warnings(m.group(1), sid, rep)
        sections.append({"file": name, "id": sid, "title": title, "emoji": emoji, "h3": h3s, "html": text})
    return sections, all_ids


def build_toc(sections):
    out = ['    <ul class="toc-list">']
    for s in sections:
        emoji = f'<span class="toc-emoji" aria-hidden="true">{html.escape(s["emoji"])}</span>' if s["emoji"] else ""
        out.append(f'      <li class="toc-ch"><a class="toc-h2" href="#{html.escape(s["id"], quote=True)}">{emoji}{html.escape(s["title"])}</a>')
        if s["h3"]:
            out.append("        <ul>")
            for hid, t in s["h3"]:
                out.append(f'          <li><a class="toc-h3" href="#{html.escape(hid, quote=True)}">{html.escape(t)}</a></li>')
            out.append("        </ul>")
        out.append("      </li>")
    out.append("    </ul>")
    return "\n".join(out)


def load_json(path, kind, rep):
    if not path.is_file():
        rep.err(f"missing data file: {path}")
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        rep.err(f"{path.name}: invalid JSON ({e})")
        return []
    if not isinstance(data, list):
        rep.err(f"{path.name}: top level must be an array")
        return []
    for i, row in enumerate(data):
        where = f"{path.name}[{i}]"
        if not isinstance(row, dict):
            rep.err(f"{where}: row must be an object")
            continue
        if kind == "commands":
            for k in ("cat", "cmd", "desc", "level"):
                if k not in row or row[k] in ("", None):
                    rep.err(f"{where}: missing '{k}'")
            if row.get("cat") not in CMD_CATS:
                rep.err(f"{where}: cat must be one of {sorted(CMD_CATS)} (got {row.get('cat')!r})")
            if row.get("level") not in (1, 2, 3):
                rep.err(f"{where}: level must be 1, 2 or 3 (got {row.get('level')!r})")
            if "tags" in row and not isinstance(row["tags"], list):
                rep.err(f"{where}: tags must be an array")
        else:
            for k in ("term", "def"):
                if k not in row or not str(row[k]).strip():
                    rep.err(f"{where}: missing '{k}'")
    return data


def json_script(script_id, data):
    s = json.dumps(data, ensure_ascii=False, indent=None, separators=(",", ":"))
    s = s.replace("</", "<\\/").replace("<!--", "<\\!--").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return f'<script type="application/json" id="{script_id}">{s}</script>'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--strict", action="store_true", help="warnings fail the build")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    shell_path = root / "src" / "shell.html"
    rep = Report()
    if not shell_path.is_file():
        print(f"ERROR   missing {shell_path}", file=sys.stderr)
        return 1
    shell = shell_path.read_text(encoding="utf-8")
    for ph in ("{{TOC}}", "{{SECTIONS}}", "{{DATA}}", "{{BUILD_DATE}}"):
        if ph not in shell:
            rep.err(f"shell.html is missing placeholder {ph}")

    sections, all_ids = load_sections(root / "src" / "sections", rep)

    present = {s["id"] for s in sections}
    for need in EXPECTED_SECTIONS:
        if need not in present:
            rep.warn(f"expected section '{need}' not found")
    by_id = {s["id"]: s for s in sections}
    if "commands" in by_id and 'id="cmd-app"' not in by_id["commands"]["html"]:
        rep.warn('section "commands" has no <div id="cmd-app">')
    if "glossary" in by_id and 'id="glossary-app"' not in by_id["glossary"]["html"]:
        rep.warn('section "glossary" has no <div id="glossary-app">')

    commands = load_json(root / "src" / "data" / "commands.json", "commands", rep)
    glossary = load_json(root / "src" / "data" / "glossary.json", "glossary", rep)

    seen = set()
    for i, row in enumerate(commands):
        if isinstance(row, dict):
            key = (row.get("cat"), row.get("cmd"))
            if key in seen:
                rep.warn(f"commands.json[{i}]: duplicate {key}")
            seen.add(key)
    for i, row in enumerate(glossary):
        if isinstance(row, dict):
            see = row.get("see")
            if see and see not in all_ids:
                rep.warn(f"glossary.json[{i}] '{row.get('term')}': see=\"{see}\" does not exist in any section")
            elif not see:
                rep.warn(f"glossary.json[{i}] '{row.get('term')}': no 'see' id")

    if rep.errors:
        print(f"\nBuild failed: {len(rep.errors)} error(s), {len(rep.warnings)} warning(s).", file=sys.stderr)
        return 1

    today = datetime.date.today().isoformat()
    data_html = "\n".join([json_script("data-commands", commands), json_script("data-glossary", glossary)])
    sections_html = "\n\n".join(s["html"] for s in sections)
    page = (shell.replace("{{TOC}}", build_toc(sections))
                 .replace("{{SECTIONS}}", sections_html)
                 .replace("{{DATA}}", data_html)
                 .replace("{{BUILD_DATE}}", today))

    docs = root / "docs"
    docs.mkdir(exist_ok=True)
    (docs / "index.html").write_text(page, encoding="utf-8")
    (docs / ".nojekyll").write_text("", encoding="utf-8")

    n_mm = sum(len(MERMAID_RE.findall(s["html"])) for s in sections)
    print(f"Built {docs / 'index.html'}: {len(sections)} sections, {n_mm} mermaid blocks, "
          f"{len(commands)} commands, {len(glossary)} glossary terms, {len(page) // 1024} KiB, {len(rep.warnings)} warning(s).")
    if args.strict and rep.warnings:
        print("--strict: failing because of warnings.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
