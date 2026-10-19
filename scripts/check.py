#!/usr/bin/env python3
"""Headless render check for docs/index.html (python playwright, one browser).

Usage:
    python3 scripts/check.py [--page PATH] [--out DIR] [--timeout SECONDS]

Exit codes: 0 = all good, 1 = at least one check failed, 2 = no usable browser.
Screenshots go to <project>/.check/ (gitignored) by default, never to /tmp.
Needs internet for the Mermaid CDN script (cdn.jsdelivr.net).
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

OVERFLOW_JS = """
() => {
  const vw = document.documentElement.clientWidth;
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
    }
    return false;
  };
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= vw + 1) continue;
    if (clipped(el)) continue;
    offenders.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + ' right=' + Math.round(r.right));
    if (offenders.length >= 6) break;
  }
  return { vw, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth, offenders };
}
"""

MERMAID_JS = """
() => {
  const pres = Array.from(document.querySelectorAll('pre.mermaid'));
  const svgs = pres.filter(p => p.getAttribute('data-state') === 'done' && p.querySelector('svg')).length;
  const errors = pres.filter(p => p.getAttribute('data-state') === 'error' || p.querySelector('.mermaid-error'))
                     .map(p => (p.closest('section[id]') || {}).id || '(no-section)');
  const pending = pres.filter(p => !p.getAttribute('data-state')).length;
  return { total: pres.length, svgs, errors, pending };
}
"""


def launch(p):
    """Try bundled chromium first, then system Chrome. Returns (browser, label) or (None, msg)."""
    problems = []
    for label, kwargs in (("bundled chromium", {}), ("system chrome", {"channel": "chrome"})):
        try:
            return p.chromium.launch(headless=True, **kwargs), label
        except Exception as e:  # noqa: BLE001
            problems.append(f"{label}: {str(e).splitlines()[0][:140]}")
    return None, "; ".join(problems)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--page", default=str(ROOT / "docs" / "index.html"))
    ap.add_argument("--out", default=str(ROOT / ".check"))
    ap.add_argument("--timeout", type=int, default=60, help="seconds to wait for Mermaid")
    args = ap.parse_args()

    page_path = Path(args.page).resolve()
    out_dir = Path(args.out).resolve()
    if not page_path.is_file():
        print(f"FAIL  {page_path} not found. Run python3 scripts/build.py first.")
        return 1
    out_dir.mkdir(parents=True, exist_ok=True)
    url = page_path.as_uri()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("No browser available: python 'playwright' package is not installed (pip install playwright).")
        return 2

    failures = []
    notes = []

    def fail(msg):
        failures.append(msg)
        print(f"FAIL  {msg}")

    def ok(msg):
        print(f"ok    {msg}")

    with sync_playwright() as p:
        browser, label = launch(p)
        if browser is None:
            print("No usable browser. Tried bundled chromium and system Chrome.")
            print(f"  {label}")
            print("  Fix: run `python3 -m playwright install chromium` or install Google Chrome.")
            return 2
        print(f"browser: {label}")
        try:
            console_errors = []
            failed_reqs = []

            def new_page(width, height, scheme="light"):
                ctx = browser.new_context(viewport={"width": width, "height": height}, color_scheme=scheme)
                pg = ctx.new_page()
                pg.on("console", lambda m: console_errors.append(f"[{width}px] {m.text}") if m.type == "error" else None)
                pg.on("pageerror", lambda e: console_errors.append(f"[{width}px] pageerror: {e}"))
                pg.on("requestfailed", lambda r: failed_reqs.append(f"[{width}px] {r.url[:90]} ({(r.failure or '')})")
                      if "fonts" not in r.url and "pretendard" not in r.url.lower() else None)
                return ctx, pg

            # ---- desktop pass: render, data apps, search --------------------
            ctx, pg = new_page(1280, 900)
            pg.goto(url, wait_until="load")
            try:
                pg.wait_for_function("window.__mermaidDone === true", timeout=args.timeout * 1000)
            except Exception:  # noqa: BLE001
                fail(f"Mermaid did not finish within {args.timeout}s (offline? cdn.jsdelivr.net blocked?)")
            mm = pg.evaluate(MERMAID_JS)
            if mm["total"] == 0:
                notes.append("no pre.mermaid blocks on the page")
            elif mm["svgs"] == mm["total"] and not mm["errors"]:
                ok(f"mermaid: {mm['svgs']}/{mm['total']} diagrams rendered")
            else:
                fail(f"mermaid: {mm['svgs']}/{mm['total']} rendered, {len(mm['errors'])} error box(es) in sections {sorted(set(mm['errors']))}, {mm['pending']} still pending")

            cmd_rows = pg.evaluate("document.querySelectorAll('#cmd-app tbody tr').length")
            gl_rows = pg.evaluate("document.querySelectorAll('#glossary-app .gl-item').length")
            if cmd_rows:
                ok(f"#cmd-app rendered {cmd_rows} row(s)")
            else:
                fail("#cmd-app has no rendered rows")
            if gl_rows:
                ok(f"#glossary-app rendered {gl_rows} item(s)")
            else:
                fail("#glossary-app has no rendered items")

            # command filter should reduce rows to a subset
            if cmd_rows:
                pg.fill("#cmd-app .filter-input", "zzzz-no-such-command")
                visible = pg.evaluate("Array.from(document.querySelectorAll('#cmd-app tbody tr')).filter(r => !r.hidden).length")
                pg.fill("#cmd-app .filter-input", "")
                (ok if visible == 0 else fail)(f"command filter hides non-matching rows (visible={visible})")

            # header search: first h2 title must be findable, "/" focuses the box
            title = pg.evaluate("(() => { const s = document.querySelector('main section.chapter'); return s ? (s.getAttribute('data-title') || '') : ''; })()")
            if title:
                pg.evaluate("document.activeElement && document.activeElement.blur()")
                pg.keyboard.press("/")
                focused = pg.evaluate("document.activeElement && document.activeElement.id")
                if focused != "search-input":
                    fail(f"'/' did not focus the search box (active={focused!r})")
                pg.fill("#search-input", title)
                n = pg.evaluate("document.querySelectorAll('#search-results li[role=option]').length")
                (ok if n else fail)(f"search for {title!r} -> {n} result(s)")
                pg.keyboard.press("Escape")
            pg.screenshot(path=str(out_dir / "desktop-1280.png"), full_page=False)
            ov = pg.evaluate(OVERFLOW_JS)
            if ov["scrollWidth"] > ov["vw"] + 1 or ov["offenders"]:
                fail(f"horizontal overflow at 1280px: scrollWidth={ov['scrollWidth']} vw={ov['vw']} offenders={ov['offenders']}")
            else:
                ok("no horizontal overflow at 1280px")
            pg.screenshot(path=str(out_dir / "desktop-1280-full.png"), full_page=True)
            ctx.close()

            # ---- phone pass: overflow + drawer + stacked table ---------------
            ctx, pg = new_page(375, 800)
            pg.goto(url, wait_until="load")
            try:
                pg.wait_for_function("window.__mermaidDone === true", timeout=args.timeout * 1000)
            except Exception:  # noqa: BLE001
                fail(f"Mermaid did not finish at 375px within {args.timeout}s")
            ov = pg.evaluate(OVERFLOW_JS)
            if ov["scrollWidth"] > ov["vw"] + 1 or ov["offenders"]:
                fail(f"horizontal overflow at 375px: scrollWidth={ov['scrollWidth']} vw={ov['vw']} offenders={ov['offenders']}")
            else:
                ok("no horizontal overflow at 375px")
            pg.click("#toc-toggle")
            pg.wait_for_timeout(350)
            drawer = pg.evaluate("(() => { const t = document.querySelector('#toc'); const r = t.getBoundingClientRect(); return { open: document.body.classList.contains('toc-open'), vis: getComputedStyle(t).visibility, top: Math.round(r.top), h: Math.round(r.height) }; })()")
            if drawer["open"] and drawer["vis"] == "visible" and drawer["h"] > 40:
                ok("mobile TOC drawer opens")
            else:
                fail(f"mobile TOC drawer did not open: {drawer}")
            pg.screenshot(path=str(out_dir / "mobile-375-drawer.png"), full_page=False)
            pg.keyboard.press("Escape")
            pg.screenshot(path=str(out_dir / "mobile-375-full.png"), full_page=True)
            ctx.close()

            # ---- dark pass: theme applies, mermaid still renders -------------
            ctx, pg = new_page(1280, 900, scheme="dark")
            pg.goto(url, wait_until="load")
            try:
                pg.wait_for_function("window.__mermaidDone === true", timeout=args.timeout * 1000)
            except Exception:  # noqa: BLE001
                fail("Mermaid did not finish in dark mode")
            bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
            mm = pg.evaluate(MERMAID_JS)
            if bg in ("rgb(255, 255, 255)", "rgba(0, 0, 0, 0)"):
                fail(f"dark scheme did not change body background ({bg})")
            elif mm["errors"]:
                fail(f"dark mode mermaid errors in sections {sorted(set(mm['errors']))}")
            else:
                ok(f"dark mode ok (body {bg}, {mm['svgs']}/{mm['total']} diagrams)")
            pg.screenshot(path=str(out_dir / "desktop-1280-dark.png"), full_page=False)
            ctx.close()

            if console_errors:
                uniq = list(dict.fromkeys(console_errors))
                fail(f"{len(uniq)} console error(s): " + " || ".join(e[:200] for e in uniq[:8]))
            else:
                ok("no console errors")
            if failed_reqs:
                uniq = list(dict.fromkeys(failed_reqs))
                notes.append("failed requests: " + " || ".join(uniq[:5]))
        finally:
            browser.close()

    for n in notes:
        print(f"note  {n}")
    print(f"screenshots: {out_dir}")
    if failures:
        print(f"\n{len(failures)} check(s) FAILED")
        return 1
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
