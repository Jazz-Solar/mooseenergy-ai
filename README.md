# mooseenergy.ai — Moose AI website

Public marketing site and staff portal for **Moose AI**, the solar O&M platform
by JAZZ Solar Solutions. Static HTML, hosted on **GitHub Pages** with the custom
domain `mooseenergy.ai` (see `CNAME`).

## How deploys work

**Pushing to `main` = live.** GitHub Pages rebuilds automatically within ~1 minute
of any push. There is no build step, no framework — edit the HTML, push, done.

## What's in here

| Path | What it is |
|---|---|
| `index.html` | The main site (product, team, First Nations partnerships) |
| `admin.html` + `admin/` | **Staff admin portal** — user roster, login activity, feedback feed, onboarding pipeline. Sign-in gated server-side to Moose staff accounts; safe to be in a public repo because all data access happens through an authenticated Supabase edge function |
| `app/` | Redirect page for the Android APK download (`mooseenergy.ai/app`) |
| `news.html` | News/announcements |
| `register.html` | Interest / registration page |
| `privacy-policy.html` | Privacy policy |
| `robots.txt`, `sitemap.xml` | SEO plumbing |
| `CNAME` | Custom-domain binding for GitHub Pages — **do not delete** (removing it takes the site off mooseenergy.ai) |
| logos / `Showcase photos/` / `assets/` | Images used by the pages |

## Things to know before editing

- **`CNAME` must survive every commit** — Pages reads the custom domain from it.
- The admin portal calls the `admin-stats` / `admin-pipeline` Supabase edge
  functions in the Moose app project (`Jazz-Solar/Mooose` repo). Changing those
  APIs means updating `admin/` here too.
- No secrets belong in this repo, ever — it is public and serves as-is.

## Ownership

Company asset of JAZZ Solar Solutions / Moose AI (Jazz-Solar GitHub org).
Related repos: `Jazz-Solar/Mooose` (mobile app), `Jazz-Solar/Inverto`
(interop API), `Jazz-Solar/moose-digital-twin` (pvlib twin).
