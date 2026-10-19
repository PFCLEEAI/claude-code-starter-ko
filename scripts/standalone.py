"""docs/index.html + style.css + app.js -> dist/claude-code-starter-ko.html (단일 파일, 이메일 첨부용)"""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "docs/index.html").read_text(encoding="utf-8")
css = (root / "docs/style.css").read_text(encoding="utf-8")
js = (root / "docs/app.js").read_text(encoding="utf-8")
html, n1 = re.subn(r'<link rel="stylesheet" href="style\.css">', lambda m: "<style>\n" + css + "\n</style>", html)
html, n2 = re.subn(r'<script[^>]*src="app\.js"[^>]*></script>', lambda m: "<script>\n" + js.replace("</script", "<\\/script") + "\n</script>", html)
assert n1 == 1 and n2 == 1, (n1, n2)
out = root / "dist/claude-code-starter-ko.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size // 1024} KiB)")
