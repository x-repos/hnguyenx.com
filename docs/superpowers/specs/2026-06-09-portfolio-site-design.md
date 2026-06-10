# hnguyenx.com — Personal Academic Portfolio: Design

**Date:** 2026-06-09
**Status:** Approved pending final user review

## Goal

A single-page academic profile at https://hnguyenx.com for Hoang Anh Nguyen.
A visitor (professor, collaborator, hiring committee) should be able to learn
who Hoang is, see his research interests and publications, find his code, and
download his CV — within one scroll.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Purpose | Academic / research profile |
| Sections | About + research interests, Publications, Projects/code, CV + contact |
| Layout | Single page, one long scroll (option A of 3 wireframes) |
| Visual style | Classic academic serif (option A of 3 styles) |
| Font | Crimson Pro (chosen from 4 candidates), Georgia fallback |
| Tech | Hand-written static HTML + CSS, no JavaScript, no build step |
| Hosting | GitHub Pages, free tier, custom domain |
| DNS | Stays at Namecheap, records point to GitHub Pages |

## Page structure (top to bottom)

1. **Header** — name on the left; anchor nav on the right:
   About · Publications · Projects · Contact. On mobile the nav wraps below
   the name.
2. **About** — circular headshot beside name, one-line tagline, and a 2–3
   sentence bio including current affiliation.
3. **Research Interests** — one short paragraph or inline list.
4. **Publications** — reverse-chronological list. Each entry: authors (Hoang's
   name bold), year, italic title, venue if applicable, and bracketed links
   such as [arXiv], [DOI], [PDF].
5. **Projects** — each entry: project name (accent color, bold), one-line
   description, [GitHub] link.
6. **Contact** — email, GitHub, Google Scholar, LinkedIn as text links, plus
   a bordered "Download CV (PDF)" button.
7. **Footer** — copyright line, hairline rule above.

## Visual design

- **Font:** Crimson Pro, self-hosted as woff2 (regular, semibold, italic) in
  `assets/fonts/` with `@font-face`; fallback stack `Georgia, serif`.
  Self-hosting avoids a third-party request to Google Fonts.
- **Colors:** warm off-white background `#fffefb`; body text `#1a1a1a`;
  secondary text `#555`; accent (links, section labels, rules) gold-brown
  `#8a6d3b`; hairlines `#e0d8c8`.
- **Section labels:** small caps style — uppercase, letter-spaced, accent
  color, hairline rule underneath.
- **Layout:** single centered column, `max-width: 45rem`, generous vertical
  rhythm. Responsive via plain CSS (flex + wrap); photo and bio stack on
  narrow screens. No breakpoint framework.
- **No JavaScript.** Anchor links and `:hover` styles only.

## Repository layout

```
/home/x/hnguyenx.com/        (git repo, pushed to GitHub)
├── index.html               entire site content
├── style.css                all styling incl. @font-face
├── CNAME                    contains "hnguyenx.com"
├── assets/
│   ├── photo.jpg            headshot (web-resized, ~400px)
│   ├── cv.pdf               downloadable CV
│   └── fonts/               Crimson Pro woff2 files
├── docs/superpowers/specs/  this spec
└── .gitignore               ignores .superpowers/
```

## Deployment

1. Push the repo to GitHub (public repo, e.g. `hnguyenx.com`).
2. Enable GitHub Pages: deploy from `main` branch, root directory.
3. Namecheap DNS (Advanced DNS for hnguyenx.com):
   - Four `A` records on `@`: 185.199.108.153, 185.199.109.153,
     185.199.110.153, 185.199.111.153
   - One `CNAME` record on `www` → `<github-username>.github.io`
   - Remove the default Namecheap parking records.
4. In GitHub Pages settings set custom domain `hnguyenx.com`, then enable
   **Enforce HTTPS** once the certificate is issued (can take up to an hour
   after DNS propagates).

Ongoing cost: $0 beyond the ~$15/yr domain renewal.

## Inputs needed at implementation time (from Hoang)

- GitHub username (for the repo and the `www` CNAME record)
- Headshot photo file
- CV PDF
- Publication list with links
- Project list (repos + one-liners)
- Exact tagline/affiliation wording — "Geophysics · Scientific Machine
  Learning" was a placeholder guess during mockups
- Email address to display publicly (note: displaying an address invites
  scraping; plain text chosen for simplicity unless Hoang objects)

## Testing / verification

- HTML passes W3C validation (`html5validator` or validator.w3.org).
- Visual check at 360px, 768px, and 1280px widths.
- All external links resolve (papers, repos, CV download).
- Lighthouse: performance and accessibility ≥ 95 (should be trivial for a
  static page).
- After DNS cutover: `https://hnguyenx.com`, `https://www.hnguyenx.com`,
  and the `http://` variants all resolve to the HTTPS apex.

## Maintenance model

Adding a publication or project = copying an existing `<li>` block in
`index.html` and editing the text. No build step, no dependencies to update.

## Out of scope (deliberately)

- Blog / news section (can be added later; single-page design doesn't block it)
- Custom email at the domain (separate task; Namecheap free email forwarding
  or Cloudflare Email Routing are options later)
- Analytics, comments, dark mode, JavaScript of any kind
- Static site generator migration (revisit only if a blog is added)
