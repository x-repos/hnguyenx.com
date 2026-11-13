# hnguyenx.com

Personal academic site of Hoang Anh (Ben) Nguyen — [hnguyenx.com](https://hnguyenx.com).

Hand-written static HTML/CSS, no build step, hosted on GitHub Pages.

## License

All rights reserved. This site, its design, code and games may not be copied,
reused, redistributed or used commercially without written permission. See
[LICENSE](LICENSE).

## Structure

- `index.html` — the whole main page (about, publications, projects, contact)
- `style.css` — all styling (Crimson Pro, self-hosted in `assets/fonts/`)
- `pro/` — animated "Pro Mode" homepage (three.js/GSAP, ported from the old site)
- `blog/` — blog index and posts
- `play/` — games: a chooser page and one folder per game (`pi/` Pi Flight, `chess/` Chess, `caro/` Caro, `cotuong/` Chinese Chess, `qubit/` Qubit, `blocks/` Lattice, `orbit/` Orbit Sling, `run/` Pi Run, `link/` Pair Path); no assets, no build step
- `files/` — public PDFs (CV, etc.)
- `assets/` — photo, CV, favicon, fonts
- `counter-worker/` — Cloudflare Worker that tallies visits by country (KV-backed)
- `chess-worker/` — Cloudflare Worker that pairs two players for online chess, caro and Chinese chess and passes their moves along (Durable Objects, WebSockets)
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

## How this site is deployed

Notes for my own use, in case the site ever has to be set up again.

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

### 4. Online game relay (optional)

`chess-worker/` is a second small Worker. It pairs two players who press
"Play a friend online" in chess, caro or Chinese chess and passes their moves back and forth.
Each game has its own Durable Object, so players of different games are never
paired, and it fits in the free plan. Without it the games still work; only the
online button cannot connect.

```bash
cd chess-worker
npx wrangler login     # once
npx wrangler deploy
```

It publishes to `https://hnguyenx-chess.<your-subdomain>.workers.dev`; opening
that address in a browser should say the relay is running. The game connects to
`wss://…/ws` (chess), `wss://…/ws?g=caro` (caro) or `wss://…/ws?g=cotuong`
(Chinese chess). That address is the `RELAY` constant near the top of each game's script. The pages
allowed to connect are `ALLOWED_ORIGIN` and the games are `GAMES` in
`chess-worker/worker.js`. The pairing rules are in `chess-worker/hub.js`.
