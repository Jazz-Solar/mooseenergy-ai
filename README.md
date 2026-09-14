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

The staff portal now includes connection reviews, customer/site mappings,
effective assignments, and decision history. It defaults to **development**;
production is selected explicitly and uses a separate Auth session. Planned
systems never grant site access. Both environments require the matching Moose
backend contract before staff controls are enabled.

Run `npm run dev` and open `http://127.0.0.1:4173/admin/`. Sign in with a development
Moose staff account. Use `npm test` for portal checks and `npm run test:browser`
for desktop/mobile journeys (requires the sibling `Mooose` repo, its dependencies,
and `npx playwright install chromium`). The backend implementation and rollout
requirements are documented in `../Mooose/docs/site-access/README.md`.

**Do not publish these portal changes before the matching production backend is
ready.** Production is missing prerequisite onboarding migrations at this
implementation's preflight. The new mobile staff link checks
`admin/portal-contract.json` before opening the environment-aware portal.

- **`CNAME` must survive every commit** — Pages reads the custom domain from it.
- The admin portal calls the `admin-stats` / `admin-pipeline` Supabase edge
  functions in the Moose app project (`Jazz-Solar/Mooose` repo). Changing those
  APIs means updating `admin/` here too.
- No secrets belong in this repo, ever — it is public and serves as-is.

## Ownership

Customer/site mapping includes registered-user and known-site dropdowns, search,
Show all and Load more. Selecting a user fills their verified account binding when
eligible; unverified users and customers before signup stay pending. Both directories
are protected backend operations, independent of telemetry access.

The `dev` branch carries the development portal; GitHub Pages still publishes `main`.
Run `npm run dev` and open `http://127.0.0.1:4173/admin/?environment=development`.
The companion app's `docs/site-access/presentation.md` contains the demo walkthrough.

Company asset of JAZZ Solar Solutions / Moose AI (Jazz-Solar GitHub org).
Related repos: `Jazz-Solar/Mooose` (mobile app), `Jazz-Solar/Inverto`
(interop API), `Jazz-Solar/moose-digital-twin` (pvlib twin).
