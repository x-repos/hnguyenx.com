# hnguyenx.com Portfolio Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a single-page academic portfolio at https://hnguyenx.com.

**Architecture:** One hand-written `index.html` styled by one `style.css`, self-hosted Crimson Pro variable font, zero JavaScript, zero build step. Deployed as a public GitHub repo served by GitHub Pages with Namecheap DNS pointing the apex and `www` at it.

**Tech Stack:** HTML5, CSS3, git, GitHub Pages, curl (font download), python3 (local preview server), npx html-validate (validation).

**Spec:** `docs/superpowers/specs/2026-06-09-portfolio-site-design.md`

**Repo root:** `/home/x/hnguyenx.com/` (already a git repo on branch `main`; spec committed)

---

### Task 1: Gather real content (MAIN SESSION ONLY — requires the user)

This task cannot be delegated to a subagent: it collects content from Hoang interactively. Everything later tasks call "content from Task 1" is produced here.

**Files:**
- Create: `assets/photo.jpg` (copied from wherever Hoang's headshot lives)
- Create: `assets/cv.pdf` (copied from wherever Hoang's CV lives)
- Create: `content-notes.md` (temporary scratch file, deleted in Task 4)

- [ ] **Step 1: Ask Hoang for the following, all at once**

  1. GitHub username (needed for the repo and the `www` DNS record)
  2. Exact tagline (mockups guessed "Geophysics · Scientific Machine Learning")
  3. 2–3 sentence bio including current affiliation
  4. Research interests (one short paragraph or `·`-separated list)
  5. Publication list: for each — authors, year, title, venue, links (arXiv/DOI/PDF URLs)
  6. Project list: for each — name, one-line description, GitHub URL
  7. Public email address, Google Scholar URL, LinkedIn URL
  8. Filesystem paths to headshot photo and CV PDF

- [ ] **Step 2: Save answers to `content-notes.md`**

Write the answers verbatim into `/home/x/hnguyenx.com/content-notes.md` so later tasks (possibly executed by fresh subagents) can read them without conversation context. Do NOT commit this file; add it to `.gitignore`:

```bash
cd /home/x/hnguyenx.com && echo "content-notes.md" >> .gitignore
```

- [ ] **Step 3: Copy assets into the repo**

```bash
cd /home/x/hnguyenx.com
mkdir -p assets
cp "<path-from-step-1>" assets/photo.jpg
cp "<path-from-step-1>" assets/cv.pdf
ls -la assets/
```

If the photo is larger than ~500 KB, resize it (target ~400 px wide, web quality):

```bash
python3 -c "
from PIL import Image
img = Image.open('assets/photo.jpg')
img.thumbnail((400, 400))
img.save('assets/photo.jpg', quality=85)
"
```

(If PIL is missing, `python3 -m pip install pillow` first. If the headshot is PNG, keep `assets/photo.jpg` as the target name anyway — convert with the same PIL snippet by opening the PNG and saving as JPG with `img.convert('RGB')`.)

- [ ] **Step 4: Commit**

```bash
cd /home/x/hnguyenx.com
git add assets/ .gitignore
git commit -m "Add headshot and CV assets"
```

---

### Task 2: Self-host the Crimson Pro font

**Files:**
- Create: `assets/fonts/crimson-pro.woff2`
- Create: `assets/fonts/crimson-pro-italic.woff2`

- [ ] **Step 1: Fetch the Google Fonts CSS to discover the woff2 URLs**

The css2 API returns variable-font woff2 URLs only when the client looks like a modern browser, hence the User-Agent header:

```bash
cd /home/x/hnguyenx.com
mkdir -p assets/fonts
curl -sL -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Crimson+Pro:ital@0;1&display=swap" -o /tmp/crimson.css
grep -o 'https://[^)]*\.woff2' /tmp/crimson.css | sort -u
```

Expected: two URLs on `fonts.gstatic.com` — one in a `font-style: normal` block, one in a `font-style: italic` block (check which is which by reading `/tmp/crimson.css`).

- [ ] **Step 2: Download both woff2 files**

```bash
cd /home/x/hnguyenx.com
curl -sL "<normal-url-from-step-1>" -o assets/fonts/crimson-pro.woff2
curl -sL "<italic-url-from-step-1>" -o assets/fonts/crimson-pro-italic.woff2
file assets/fonts/*.woff2
```

Expected: both files reported as `Web Open Font Format (Version 2)`, each roughly 50–200 KB. If `file` reports HTML or the size is under 1 KB, the download failed — re-check the URLs.

- [ ] **Step 3: Commit**

```bash
cd /home/x/hnguyenx.com
git add assets/fonts/
git commit -m "Self-host Crimson Pro variable font (regular + italic)"
```

---

### Task 3: Write style.css

**Files:**
- Create: `style.css`

- [ ] **Step 1: Write the complete stylesheet**

Create `/home/x/hnguyenx.com/style.css` with exactly this content:

```css
@font-face {
  font-family: "Crimson Pro";
  src: url("assets/fonts/crimson-pro.woff2") format("woff2");
  font-weight: 200 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Crimson Pro";
  src: url("assets/fonts/crimson-pro-italic.woff2") format("woff2");
  font-weight: 200 900;
  font-style: italic;
  font-display: swap;
}

:root {
  --bg: #fffefb;
  --text: #1a1a1a;
  --muted: #555;
  --accent: #8a6d3b;
  --hairline: #e0d8c8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0 auto;
  padding: 2.5rem 1.25rem 4rem;
  max-width: 45rem;
  background: var(--bg);
  color: var(--text);
  font-family: "Crimson Pro", Georgia, serif;
  font-size: 1.125rem;
  line-height: 1.65;
}

a {
  color: var(--accent);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  border-bottom: 1px solid var(--hairline);
  padding-bottom: 0.75rem;
  margin-bottom: 2rem;
}

.site-name {
  font-weight: 600;
}

nav {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 1rem;
}

.about {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.about img {
  width: 7rem;
  height: 7rem;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.about .intro {
  flex: 1;
  min-width: 16rem;
}

.about h1 {
  margin: 0 0 0.25rem;
  font-size: 1.75rem;
  font-weight: 600;
}

.tagline {
  color: var(--muted);
  margin: 0 0 0.6rem;
}

.about p {
  margin: 0;
}

h2 {
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 600;
  border-bottom: 1px solid var(--hairline);
  padding-bottom: 0.3rem;
  margin: 2.25rem 0 0.9rem;
}

section p {
  margin: 0 0 0.8rem;
}

ul.entries {
  list-style: none;
  padding: 0;
  margin: 0;
}

ul.entries li {
  margin-bottom: 0.8rem;
}

.project-name {
  font-weight: 600;
  color: var(--accent);
}

.contact-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  align-items: center;
}

.cv-button {
  display: inline-block;
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 0.25rem 0.9rem;
}

.cv-button:hover {
  background: #f7f2e7;
  text-decoration: none;
}

footer {
  margin-top: 3rem;
  border-top: 1px solid var(--hairline);
  padding-top: 0.75rem;
  font-size: 0.9rem;
  color: #999;
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/x/hnguyenx.com
git add style.css
git commit -m "Add stylesheet: classic serif, single column, no JS"
```

---

### Task 4: Write index.html with real content

**Files:**
- Create: `index.html`
- Read: `content-notes.md` (from Task 1)
- Delete: `content-notes.md` (after content is merged in)

- [ ] **Step 1: Write index.html**

Create `/home/x/hnguyenx.com/index.html` with the structure below. Every `⟦…⟧` marker MUST be replaced with the corresponding real content from `content-notes.md` — no marker may survive into the committed file. Repeat the `<li>` blocks once per publication/project from the notes (the two shown are shape examples).

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hoang Anh Nguyen</title>
  <meta name="description" content="⟦tagline⟧ — personal academic site of Hoang Anh Nguyen.">
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <header>
    <span class="site-name">Hoang Anh Nguyen</span>
    <nav>
      <a href="#about">About</a>
      <a href="#publications">Publications</a>
      <a href="#projects">Projects</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>

  <section class="about" id="about">
    <img src="assets/photo.jpg" alt="Portrait of Hoang Anh Nguyen">
    <div class="intro">
      <h1>Hoang Anh Nguyen</h1>
      <p class="tagline">⟦tagline⟧</p>
      <p>⟦bio — 2–3 sentences incl. affiliation⟧</p>
    </div>
  </section>

  <section id="interests">
    <h2>Research Interests</h2>
    <p>⟦research interests⟧</p>
  </section>

  <section id="publications">
    <h2>Publications</h2>
    <ul class="entries">
      <li>
        <strong>Nguyen, H. A.</strong>, ⟦co-authors⟧ (⟦year⟧).
        <em>⟦Title of the paper⟧.</em> ⟦Venue⟧.
        <a href="⟦arxiv-url⟧">[arXiv]</a>
        <a href="⟦pdf-url⟧">[PDF]</a>
      </li>
      <li>
        <strong>Nguyen, H. A.</strong> (⟦year⟧).
        <em>⟦Title of the second paper⟧.</em>
        <a href="⟦doi-url⟧">[DOI]</a>
      </li>
    </ul>
  </section>

  <section id="projects">
    <h2>Projects</h2>
    <ul class="entries">
      <li>
        <span class="project-name">⟦project-name⟧</span> —
        ⟦one-line description⟧.
        <a href="⟦github-repo-url⟧">[GitHub]</a>
      </li>
      <li>
        <span class="project-name">⟦second-project-name⟧</span> —
        ⟦one-line description⟧.
        <a href="⟦github-repo-url⟧">[GitHub]</a>
      </li>
    </ul>
  </section>

  <section id="contact">
    <h2>Contact</h2>
    <div class="contact-links">
      <a href="mailto:⟦email⟧">Email</a>
      <a href="https://github.com/⟦github-username⟧">GitHub</a>
      <a href="⟦google-scholar-url⟧">Google Scholar</a>
      <a href="⟦linkedin-url⟧">LinkedIn</a>
      <a class="cv-button" href="assets/cv.pdf">Download CV (PDF)</a>
    </div>
  </section>

  <footer>
    © 2026 Hoang Anh Nguyen · hnguyenx.com
  </footer>

</body>
</html>
```

- [ ] **Step 2: Verify no unreplaced markers remain**

```bash
cd /home/x/hnguyenx.com
grep -c "⟦" index.html
```

Expected: `0` (grep exits 1 with count 0 — that is the pass condition).

- [ ] **Step 3: Validate the HTML**

```bash
cd /home/x/hnguyenx.com
npx --yes html-validate index.html
```

Expected: no output, exit code 0. Fix any reported errors before continuing.

- [ ] **Step 4: Delete the scratch notes and commit**

```bash
cd /home/x/hnguyenx.com
rm content-notes.md
git add index.html
git commit -m "Add single-page site content"
```

---

### Task 5: Local verification

**Files:**
- Possibly modify: `index.html`, `style.css` (fixes only)

- [ ] **Step 1: Serve locally**

```bash
cd /home/x/hnguyenx.com
python3 -m http.server 8123
```

Run in background (Bash tool: `run_in_background: true`).

- [ ] **Step 2: Verify every local resource loads**

```bash
for p in / /style.css /assets/photo.jpg /assets/cv.pdf /assets/fonts/crimson-pro.woff2 /assets/fonts/crimson-pro-italic.woff2; do
  printf "%s -> " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8123$p"
done
```

Expected: six lines, all `200`.

- [ ] **Step 3: Verify every external link resolves**

```bash
cd /home/x/hnguyenx.com
grep -o 'href="https\?://[^"]*"' index.html | sed 's/href="//;s/"$//' | sort -u | while read -r url; do
  printf "%s -> " "$url"; curl -s -o /dev/null -L -w "%{http_code}\n" --max-time 15 "$url"
done
```

Expected: every line ends in `200` (LinkedIn sometimes answers `999` to bots — treat `999` as OK for linkedin.com only).

- [ ] **Step 4: Run Lighthouse (spec target: performance & accessibility ≥ 95)**

```bash
cd /home/x/hnguyenx.com
npx --yes lighthouse http://localhost:8123 --quiet --chrome-flags="--headless" \
  --only-categories=performance,accessibility --output=json --output-path=/tmp/lh.json \
  && python3 -c "
import json
r = json.load(open('/tmp/lh.json'))['categories']
print('performance:', r['performance']['score'], 'accessibility:', r['accessibility']['score'])
"
```

Expected: both scores ≥ 0.95. Lighthouse needs a Chrome/Chromium binary; if none is installed, report that the check was skipped for that reason (do not silently skip) — the page is static HTML, so the remaining checks still stand.

- [ ] **Step 5: Have Hoang eyeball it**

Tell Hoang to open `http://localhost:8123` and check at the spec's three widths — mobile ~360 px, tablet ~768 px, desktop ~1280 px (resize the window or use the browser dev-tools device toolbar). Confirm the photo/bio and nav stack cleanly at 360 px. Fix anything he flags, re-run Step 2, and commit fixes if any:

```bash
cd /home/x/hnguyenx.com
git add -A && git commit -m "Polish from local review"
```

(Skip the commit if nothing changed.)

- [ ] **Step 6: Stop the local server**

Kill the background `http.server` process.

---

### Task 6: Push to GitHub and enable Pages

**Files:**
- Create: `CNAME`

- [ ] **Step 1: Create the CNAME file and commit**

```bash
cd /home/x/hnguyenx.com
echo "hnguyenx.com" > CNAME
git add CNAME
git commit -m "Add CNAME for GitHub Pages custom domain"
```

- [ ] **Step 2: Have Hoang create the GitHub repo**

No `gh` CLI on this machine, so Hoang does this in the browser: go to https://github.com/new, repository name `hnguyenx.com`, Public, NO readme/gitignore/license (the repo must stay empty). Confirm when done.

- [ ] **Step 3: Push**

```bash
cd /home/x/hnguyenx.com
git remote add origin "https://github.com/<github-username-from-task-1>/hnguyenx.com.git"
git push -u origin main
```

If push prompts for credentials in a way the tool can't answer, ask Hoang to run `! git push -u origin main` himself in the session (the `!` prefix), or set up a PAT/SSH remote first.

- [ ] **Step 4: Have Hoang enable GitHub Pages**

In the repo on github.com: Settings → Pages → Source: "Deploy from a branch" → Branch `main`, folder `/ (root)` → Save. Because `CNAME` is in the repo, the "Custom domain" field should auto-fill with `hnguyenx.com`.

- [ ] **Step 5: Verify Pages is serving**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://<github-username>.github.io/hnguyenx.com/"
```

Expected: `301` (redirect to the custom domain — that means Pages is up and has registered the CNAME). A `404` within the first ~2 minutes is normal; retry.

---

### Task 7: Point Namecheap DNS at GitHub Pages and enforce HTTPS

**Files:** none (all changes happen in web dashboards)

- [ ] **Step 1: Have Hoang set DNS records at Namecheap**

Namecheap dashboard → Domain List → hnguyenx.com → Advanced DNS. Delete the default parking records (the `CNAME` on `www` to `parkingpage.namecheap.com` and any URL-redirect record on `@`). Add:

| Type | Host | Value | TTL |
|---|---|---|---|
| A | @ | 185.199.108.153 | Automatic |
| A | @ | 185.199.109.153 | Automatic |
| A | @ | 185.199.110.153 | Automatic |
| A | @ | 185.199.111.153 | Automatic |
| CNAME | www | `<github-username>.github.io.` | Automatic |

- [ ] **Step 2: Verify propagation**

```bash
dig +short hnguyenx.com A
dig +short www.hnguyenx.com CNAME
```

Expected: the four `185.199.x.153` addresses, and `<github-username>.github.io.`. Namecheap TTL "Automatic" is 30 min — if stale values appear, wait and retry (do not loop with sleep; check again on a later turn).

- [ ] **Step 3: Enforce HTTPS**

In repo Settings → Pages: once the custom domain shows a green check and "Enforce HTTPS" becomes clickable (certificate issuance can take up to ~1 hour after DNS verifies), have Hoang tick **Enforce HTTPS**.

- [ ] **Step 4: Final end-to-end verification**

```bash
for u in https://hnguyenx.com http://hnguyenx.com https://www.hnguyenx.com http://www.hnguyenx.com; do
  printf "%s -> " "$u"; curl -s -o /dev/null -L -w "%{http_code} (final: %{url_effective})\n" "$u"
done
curl -s https://hnguyenx.com | grep -c "Hoang Anh Nguyen"
```

Expected: all four URLs end at `200` with final URL `https://hnguyenx.com/` (www redirects to apex), and the grep count is ≥ 3 (title, header, h1).

- [ ] **Step 5: Done — record renewal reminder**

Tell Hoang the site is live. Remind him: domain renews ~June 2027 at ~$15; auto-renew setting is in the Namecheap Domain List.

---

### Task 8: Pro Mode (added 2026-06-10, user request — executes between Tasks 5 and 6)

Port the animated homepage from x-repos.github.io (built output, not Jekyll source) into `pro/`, and link it from a new "Pro Mode" section after Contact.

**Files:**
- Create: `pro/index.html` (built HTML of old homepage, paths rewritten)
- Create: `pro/assets/css/home.css`, `pro/assets/js/home.js`, `pro/assets/js/nav.js` (verbatim copies from the old repo)
- Create: `pro/images/` — favicon.ico, favicon-16x16.png, favicon-32x32.png, apple-touch-icon-180x180.png, profile.jpeg, profile-glasses.jpeg (verbatim copies)
- Modify: `index.html` (add Pro Mode section after Contact)

**Sources:** old repo clone at /tmp/oldsite-repo (assets), built homepage HTML at /tmp/oldsite.html (fetched from the live site).

**Path rewrites in pro/index.html (root-absolute → relative/external):**
- `href="/"` → `href="../"` (header logo exits Pro Mode to the simple page)
- `/assets/css/home.css`, `/assets/js/home.js`, `/assets/js/nav.js` → same path without leading slash
- `/images/<file>` → `images/<file>`
- `/blog/` (2×) → `https://x-repos.github.io/blog/`
- `/files/HoangAnh_CV.pdf` (2×) → `../assets/cv.pdf`
- any canonical/og URLs pointing at x-repos.github.io → https://hnguyenx.com/pro/

**Pro Mode section in index.html, inserted after `</section>` of #contact, inside `<main>`:**

```html
  <section id="pro">
    <h2>Pro Mode</h2>
    <p>
      Prefer the cinematic version? <a href="pro/">Enter Pro Mode →</a>
      — an animated scroll from a single qubit to the whole galaxy.
    </p>
  </section>
```

**Verification:** `npx --yes html-validate index.html` passes (pro/index.html is legacy markup — not gated on the validator); all `pro/` resources return 200 from the local server; headless-Chrome screenshot of `http://localhost:8123/pro/` renders the animated page (non-blank); main page still passes its checks. CDN deps (GSAP, three.js, Google Fonts) and external services (formsubmit.co, ipapi.co, flagcounter) stay as-is.
