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
- `counter-worker/` — Cloudflare Worker that tallies visits by country (KV-backed)
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

## Reproduce this site from scratch

Two pieces deploy independently: the **static site** (GitHub Pages) and an
optional **visitor counter** (Cloudflare Worker). You can ship the site without
the counter.

### 1. Static site on GitHub Pages

1. Create a GitHub repo. The name is arbitrary — this one is `x-repos/hnguyenx.com`.
   You do **not** need a `<user>.github.io` repo; the custom domain is served
   straight from this project repo.
2. Add the static files (`index.html`, `style.css`, `assets/`, `pro/`, `blog/`,
   `files/`). There is no build step.
3. Push to `main`.
4. **Settings → Pages → Build and deployment** → Source: **Deploy from a branch**,
   Branch: `main`, folder: `/` (root).

The site builds in about a minute at `https://<user>.github.io/<repo>/`.

### 2. Custom domain

1. Add a `CNAME` file at the repo root containing the bare domain (`hnguyenx.com`).
2. At your DNS provider:
   - **Apex** (`@`): four A records → `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153` (GitHub Pages IPs).
   - **`www`**: a CNAME record → `<user>.github.io`.
     This is GitHub's hostname, not a repo you have to create.
3. **Settings → Pages → Custom domain** → enter the domain, wait for the DNS
   check to pass, then tick **Enforce HTTPS** (GitHub auto-provisions the TLS
   cert for both apex and `www`).

Verify the live config any time with:

```bash
gh api repos/<user>/<repo>/pages
```

### 3. Visitor counter (optional)

`counter-worker/` is a standalone Cloudflare Worker. It counts visits by country
(from Cloudflare's `CF-IPCountry` header) into a KV namespace; `index.html` POSTs
to it on load and renders the totals.

```bash
cd counter-worker
npm i -g wrangler                      # or use: npx wrangler
wrangler login
wrangler kv namespace create VISITS    # paste the returned id into wrangler.toml
wrangler deploy
```

The worker publishes to `https://hnguyenx-visits.<your-subdomain>.workers.dev`.
Point the `api` URL near the top of the counter `<script>` in `index.html` at
your own Worker URL, and add your domain to `ALLOWED_ORIGINS` in
`counter-worker/worker.js`.
