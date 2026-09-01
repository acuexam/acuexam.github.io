#!/usr/bin/env python3
"""
acuExam build script.

The hosted site in site/ already works as-is: serve that folder and you're done.
This script produces the *offline* single-file builds — one self-contained HTML
per exam, with the stylesheet, engine and pack all inlined, so the file can be
downloaded and opened straight from disk with no server.

    python3 build.py            # build every live exam
    python3 build.py ab900      # build one

Output lands in dist/.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
SITE = ROOT / "site"
DIST = ROOT / "dist"

ENGINE_TAG = '<script src="/assets/engine.js"></script>'
CSS_TAG = '<link rel="stylesheet" href="/assets/styles.css">'


def build_offline(exam_id: str) -> pathlib.Path:
    manifest = json.loads((SITE / "packs" / "manifest.json").read_text(encoding="utf-8"))
    entry = next((e for e in manifest["exams"] if e["id"] == exam_id), None)
    if entry is None:
        raise SystemExit(f"No exam '{exam_id}' in packs/manifest.json")

    pack_text = (SITE / entry["file"]).read_text(encoding="utf-8")
    pack = json.loads(pack_text)
    css = (SITE / "assets" / "styles.css").read_text(encoding="utf-8")
    engine = (SITE / "assets" / "engine.js").read_text(encoding="utf-8")
    shell = (SITE / "exam" / "index.html").read_text(encoding="utf-8")

    if ENGINE_TAG not in shell or CSS_TAG not in shell:
        raise SystemExit("exam/index.html no longer matches the tags build.py rewrites — update build.py")

    head, _ = shell.split(ENGINE_TAG, 1)

    # inline the stylesheet
    head = head.replace(CSS_TAG, "<style>\n" + css + "\n</style>")
    # no catalogue to go back to in a single-file build
    head = head.replace('<a class="back" href="/">← All exams</a>', "")
    # a stray </script> inside pack text would break the inline script tag
    safe_pack = pack_text.replace("</", "<\\/")

    fmt = (
        "const fmt = d => new Date(d + 'T00:00:00')"
        ".toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'});"
    )
    boot = f"""<script>
{engine}
</script>
<script>
(function () {{
  const pack = JSON.parse({json.dumps(safe_pack)});
  const app = document.getElementById('app');
  document.title = pack.code + ' practice · acuExam';
  document.getElementById('barCode').textContent = pack.code;
  document.getElementById('barName').textContent = pack.name;
  const link = document.getElementById('officialLink');
  link.href = pack.studyGuideUrl || pack.officialUrl;
  {fmt}
  document.getElementById('packFoot').innerHTML =
    'Pack built from the skills outline published ' + fmt(pack.outlineDate) +
    ', last checked against ' + pack.provider + '\\u2019s documentation on ' + fmt(pack.verified) + '. ' +
    'Original questions, not real exam content. Independent and unaffiliated with ' + pack.provider + '. ' +
    'Offline single-file build \\u2014 your progress is saved in this browser, for this file.';
  acuExam.mount(pack, app);
}})();
</script>
</body>
</html>
"""
    out_html = head + boot
    # collapse the blank line the removed back-link leaves behind
    out_html = re.sub(r"\n[ \t]*\n[ \t]*(<span class=\"code-badge\")", r"\n    \1", out_html)

    DIST.mkdir(exist_ok=True)
    out = DIST / f"acuexam-{pack['code'].lower().replace(' ', '-')}-offline.html"
    out.write_text(out_html, encoding="utf-8")
    return out


def main() -> None:
    manifest = json.loads((SITE / "packs" / "manifest.json").read_text(encoding="utf-8"))
    wanted = sys.argv[1:] or [e["id"] for e in manifest["exams"] if e.get("status") == "live"]
    for exam_id in wanted:
        out = build_offline(exam_id)
        print(f"  {out.relative_to(ROOT)}  ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    print("Building offline single-file editions:")
    main()
