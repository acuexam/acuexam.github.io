#!/usr/bin/env python3
"""
Builds a single-page preview of the whole site (catalogue + working exam)
for publishing as an Artifact. Same CSS, same engine, same pack as the real
site — only the page scaffolding is bespoke, because an Artifact is one file
and cannot fetch the pack over the network.

    python3 build_preview.py   ->  dist/preview.html
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).parent
SITE = ROOT / "site"
DIST = ROOT / "dist"

css = (SITE / "assets" / "styles.css").read_text(encoding="utf-8")
engine = (SITE / "assets" / "engine.js").read_text(encoding="utf-8")
manifest = json.loads((SITE / "packs" / "manifest.json").read_text(encoding="utf-8"))
pack_text = (SITE / "packs" / "ab900.json").read_text(encoding="utf-8")

index_html = (SITE / "index.html").read_text(encoding="utf-8")
landing = index_html.split("<main class=\"wrap\">", 1)[1].split("</main>", 1)[0]
# the preview routes in-page, so the catalogue links become hash routes
landing = landing.replace('href="#catalogue"', 'href="#catalogue"')

safe_pack = pack_text.replace("</", "<\\/")
safe_manifest = json.dumps(manifest, ensure_ascii=False).replace("</", "<\\/")

html = f"""<title>Cutscore</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&amp;family=Newsreader:ital,wght@0,400;0,500;0,600;1,500&amp;family=JetBrains+Mono:wght@400;600&amp;display=swap">
<style>
{css}
</style>

<div id="viewHome">
  <header class="masthead">
    <div class="inner">
      <a class="brand" href="#/">
        <span class="mark">Cut<span>score</span></span>
        <span class="tagline">practice that explains itself</span>
      </a>
      <nav>
        <a href="#catalogue">Exams</a>
        <a href="#how">How it works</a>
        <a href="#honest">What this isn't</a>
      </nav>
    </div>
  </header>
  <main class="wrap">
{landing}
  </main>
  <footer class="foot">
    <div class="wrap">
      <div><strong>Cutscore</strong> — free certification practice that explains itself.</div>
      <div>Independent and unaffiliated. Exam codes and product names are the property of their respective owners. Questions are original, written from published skills outlines; they are not real exam questions.</div>
    </div>
  </footer>
</div>

<div id="viewExam" class="hidden">
  <header class="exam-bar">
    <div class="inner">
      <a class="back" href="#/">← All exams</a>
      <span class="code-badge" id="barCode"></span>
      <span class="title" id="barName"></span>
      <span class="right"><a class="back" id="officialLink" target="_blank" rel="noopener noreferrer">Official study guide ↗</a></span>
    </div>
  </header>
  <main class="wrap narrow app">
    <div id="app"></div>
    <p class="prose" style="font-size:13.5px;margin-top:38px" id="packFoot"></p>
  </main>
</div>

<script>
{engine}
</script>
<script>
(function () {{
  const MANIFEST = JSON.parse({json.dumps(safe_manifest)});
  const PACK = JSON.parse({json.dumps(safe_pack)});
  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, {{day:'numeric', month:'short', year:'numeric'}});

  /* --- catalogue --- */
  const box = document.getElementById('examList');
  document.getElementById('catCount').textContent =
    MANIFEST.exams.filter(e => e.status === 'live').length + ' live · more in progress';
  box.innerHTML = MANIFEST.exams.map(x => {{
    const live = x.status === 'live';
    const rail = x.domains.map(d => '<i style="flex:' + d.weight + ';background:' + d.color + '" title="' + d.name + ' — ' + d.official + '"></i>').join('');
    const key  = x.domains.map(d => '<span><b style="background:' + d.color + '"></b>' + d.official + '</span>').join('');
    return '<a class="exam-row' + (live ? '' : ' disabled') + '"' + (live ? ' href="#/exam/' + x.id + '"' : '') + '>' +
      '<div><div class="exam-id"><span class="code-badge">' + x.code + '</span>' +
      '<span class="tag ' + (live ? 'live' : 'soon') + '">' + (live ? 'ready' : 'in progress') + '</span>' +
      '<span class="verified"><i></i>checked ' + fmt(x.verified) + '</span></div>' +
      '<div class="exam-name">' + x.name + '</div>' +
      '<div class="exam-meta">' + x.provider + ' ' + x.level + '<span class="dot">·</span>' + x.minutes + ' min' +
      '<span class="dot">·</span>' + x.examQuestions + ' questions on the day<span class="dot">·</span>outline of ' + fmt(x.outlineDate) + '</div></div>' +
      '<div><div class="rail">' + rail + '</div><div class="rail-key">' + key + '</div></div>' +
      '<div class="counts"><b>' + x.questions + '</b>questions<br>' + x.drills + ' menu drills</div></a>';
  }}).join('');

  /* --- in-page routing --- */
  let mounted = false;
  function route() {{
    const onExam = location.hash.indexOf('#/exam/') === 0;
    document.getElementById('viewHome').classList.toggle('hidden', onExam);
    document.getElementById('viewExam').classList.toggle('hidden', !onExam);
    if (onExam && !mounted) {{
      mounted = true;
      document.getElementById('barCode').textContent = PACK.code;
      document.getElementById('barName').textContent = PACK.name;
      document.getElementById('officialLink').href = PACK.studyGuideUrl || PACK.officialUrl;
      document.getElementById('packFoot').innerHTML =
        'Pack built from the skills outline published ' + fmt(PACK.outlineDate) +
        ', last checked against ' + PACK.provider + '\\u2019s documentation on ' + fmt(PACK.verified) + '. ' +
        'Original questions, not real exam content. Independent and unaffiliated with ' + PACK.provider + '.';
      Cutscore.mount(PACK, document.getElementById('app'));
    }}
    if (onExam) window.scrollTo(0, 0);
  }}
  window.addEventListener('hashchange', route);
  route();
}})();
</script>
"""

DIST.mkdir(exist_ok=True)
out = DIST / "preview.html"
out.write_text(html, encoding="utf-8")
print(f"dist/preview.html  ({out.stat().st_size/1024:.0f} KB)")
