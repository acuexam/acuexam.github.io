# Cutscore

Free certification practice that explains itself. Original questions written from
published skills outlines, with a plain-English explanation on every one — including
a line on each answer you *didn't* pick, saying what that thing actually does.

> **The name is a placeholder.** "Cutscore" is the assessment term for a pass
> threshold. Check the domain and trademark are free before you commit to it — it
> appears in exactly two places: `site.name` in `packs/manifest.json` and the
> `.brand` markup in `index.html` / `build_preview.py`.

---

## Layout

```
site/                     ← this folder is the whole website
  index.html                catalogue + landing page
  exam.html                 the practice app shell (?exam=<id>)
  assets/
    styles.css              design system, shared by both pages
    engine.js               the quiz engine — knows nothing about any exam
  packs/
    manifest.json           site name + the list of exams
    ab900.json              one exam: metadata, domains, terms, screens, questions
build.py                  → dist/cutscore-<code>-offline.html  (single file, no server)
build_preview.py          → dist/preview.html  (whole site as one page, for sharing)
```

The rule that keeps this cheap: **`engine.js` and `styles.css` never mention a
specific exam.** Everything exam-shaped lives in a pack. Adding an exam is writing
one JSON file.

---

## Running it

The site needs to be served over HTTP — browsers refuse to let a page opened from
disk read local JSON, so `index.html` opened by double-click will show an error.

```bash
cd site && python3 -m http.server 8000
# then open http://localhost:8000
```

To publish, upload the contents of `site/` to any static host. All of these are free
and need no server code:

| Host | How |
| --- | --- |
| GitHub Pages | push the repo, Settings → Pages → deploy from `/site` |
| Cloudflare Pages | connect the repo, build command none, output directory `site` |
| Netlify | drag the `site` folder onto the dashboard |

There is no backend, no database and no account system. Progress lives in each
visitor's own browser under `localStorage['cutscore-progress-v1']`, namespaced by
exam id, and never leaves their machine. That is a deliberate limit: it means no
sign-up and nothing to breach, but also no sync across devices. The Export/Import
buttons on the progress page are the manual version of sync.

### Offline builds

```bash
python3 build.py           # every live exam
python3 build.py ab900     # just one
```

Produces a self-contained HTML per exam in `dist/` — stylesheet, engine and pack all
inlined. Download it, double-click it, works with no network. (Web fonts still come
from Google, so offline it falls back to system faces; everything else is local.)

---

## Adding an exam

1. **Research first.** Find the vendor's published outline — the objectives and their
   percentage weightings. Write questions from that and the vendor's own
   documentation. Never copy questions from an exam or from a dump site: it breaks
   the candidate agreement, it gets certifications revoked, and it teaches worse.
2. **Write `site/packs/<id>.json`** to the shape below.
3. **Add an entry to `packs/manifest.json`.** The catalogue reads only the manifest,
   so a pack that isn't listed there is invisible.
4. **Run `python3 build.py <id>`** if you want the offline edition too.

### Pack shape

```jsonc
{
  "id": "ab900",                    // url-safe; also the progress storage key
  "code": "AB-900",
  "name": "Copilot and Agent Administration Fundamentals",
  "provider": "Microsoft",
  "level": "Fundamentals",
  "status": "live",                 // "live" | anything else = shown greyed out
  "minutes": 45,                    // real exam length, drives the timer
  "examQuestions": 40,              // real question count, drives the mock length
  "passScaled": 700,                // real pass mark
  "scaleMax": 1000,
  "officialUrl": "https://…",
  "studyGuideUrl": "https://…",
  "outlineDate": "2026-07-22",      // when the vendor published the outline
  "verified": "2026-08-31",         // when a human last checked this pack
  "blurb": "One sentence for the catalogue.",

  "domains": [                      // weights must sum to 1
    { "name": "…", "weight": 0.325, "official": "30–35%", "color": "#0B6B63" }
  ],

  "terms": ["conditional access", "…"],   // highlight dictionary, longest wins

  "screens": {                      // optional — only if the pack has menu drills
    "m365": {
      "name": "Microsoft 365 admin center",
      "url": "admin.microsoft.com",
      "hue": "#2f6feb",
      "nav": [
        { "id": "m.settings", "label": "Settings", "desc": "What this area is for.",
          "children": [
            { "id": "m.settings.domains", "label": "Domains", "desc": "What this page is for." }
          ]}
      ]
    }
  },

  "questions": [
    { "id": 1, "type": "mc", "domain": "…", "topic": "…",
      "q": "…",
      "options": ["…","…","…","…"],
      "answer": 2,                            // index into options
      "explain": "Why the right answer is right.",
      "wrong": { "0": "What that one actually is.", "1": "…", "3": "…" },
      "cues": ["scenario phrase to highlight"] // optional
    },
    { "id": 101, "type": "click", "domain": "…", "topic": "…",
      "q": "…",
      "screen": "m365",
      "answer": "m.settings.domains",         // a node id from that screen
      "explain": "…"
    }
  ]
}
```

Notes that will save you an hour:

- **Every nav node needs a `desc`.** A wrong click is explained using the description
  of the node the person clicked, so a missing one makes the drill useless.
- **`wrong` must have a key for every option except the answer.** The validator below
  checks this.
- **`cues` are exact substrings of `q`.** They're highlighted as scenario clues; the
  `terms` list covers feature names automatically, so only add a cue where the tell is
  a described situation rather than a product name.
- **Answer positions should be shuffled in the source**, not all left at index 0 —
  the app shuffles at runtime, but a pack that is all-A is obvious if anyone reads the
  JSON.

### Validate a pack

```bash
python3 - <<'EOF'
import json, sys
p = json.load(open('site/packs/ab900.json'))
names = {d['name'] for d in p['domains']}
assert abs(sum(d['weight'] for d in p['domains']) - 1) < 1e-9, 'weights must sum to 1'
nodes = {}
for sid, sc in p.get('screens', {}).items():
    for t in sc['nav']:
        nodes[t['id']] = sid
        for c in t.get('children', []): nodes[c['id']] = sid
        assert t.get('desc'), f"no desc: {t['id']}"
        for c in t.get('children', []): assert c.get('desc'), f"no desc: {c['id']}"
seen = set()
for q in p['questions']:
    assert q['id'] not in seen, f"duplicate id {q['id']}"; seen.add(q['id'])
    assert q['domain'] in names, f"{q['id']}: unknown domain"
    if q.get('type') == 'click':
        assert nodes.get(q['answer']) == q['screen'], f"{q['id']}: bad node"
    else:
        assert 0 <= q['answer'] < len(q['options']), f"{q['id']}: bad answer index"
        need = {str(i) for i in range(len(q['options']))} - {str(q['answer'])}
        assert set(q['wrong']) == need, f"{q['id']}: wrong[] keys don't match options"
    for c in q.get('cues', []):
        assert c in q['q'], f"{q['id']}: cue not found in question text"
print(f"OK — {len(p['questions'])} questions, {len(nodes)} nav nodes")
EOF
```

---

## Keeping packs honest

This is the part that decides whether the site is worth using in a year.

- **`verified` is a promise.** It's shown on the catalogue row. Only move it forward
  after actually re-reading the vendor's outline and spot-checking the pack against
  current docs.
- **Watch `outlineDate`.** When the vendor republishes an outline, diff it against the
  pack's domains and weightings first — those changing is the loudest signal that
  questions need revisiting.
- **Console menus drift faster than concepts.** When a vendor moves a menu item, fix
  the `screens` nav; the underlying question usually still stands.
- **Overlap is an asset.** Fundamentals exams share a lot of ground. When a second
  Microsoft pack arrives, consider a shared question file with an `exams: ["ab900",
  "sc900"]` tag rather than duplicating — one fix then corrects every pack at once.

## Legal footing

- Questions are original, written from public outlines. Do not accept contributions
  sourced from real exams or dump sites.
- Exam codes and product names are the vendors'. Using them to say *which exam a pack
  covers* is normal descriptive use; presenting the site as official, or using vendor
  logos and branding, is not. Keep the "independent and unaffiliated" line visible.
- Console screens are drawn recreations built from public documentation, not
  screenshots. Keep it that way — screenshots carry the vendor's copyright.
