# hnguyenx.com

Personal academic site of Hoang Anh (Benjamin) Nguyen — [hnguyenx.com](https://hnguyenx.com).

Hand-written static HTML/CSS, no build step, hosted on GitHub Pages.

## Structure

- `index.html` — the whole main page (about, publications, projects, contact)
- `style.css` — all styling (Crimson Pro, self-hosted in `assets/fonts/`)
- `pro/` — animated "Pro Mode" homepage (three.js/GSAP, ported from the old site)
- `blog/` — blog index and posts
- `files/` — public PDFs (CV, etc.)
- `assets/` — photo, CV, favicon, fonts
- `CNAME` — custom domain for GitHub Pages

## Updating

Edit the files, then:

```bash
git add -A && git commit -m "..." && git push
```

Changes deploy automatically in about a minute. Adding a publication = copying
one `<li>` block in `index.html`. Preview locally with:

```bash
python3 -m http.server 8123   # http://localhost:8123
```
