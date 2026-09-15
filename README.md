# mooseenergy.ai — Moose AI website

Public marketing site and staff portal for **Moose AI**, the solar O&M platform
by JAZZ Solar Solutions. Static HTML, hosted on **GitHub Pages** with the custom
domain `mooseenergy.ai` (see `CNAME`).

## How deploys work

**Pushing to `main` = live.** GitHub Pages builds and deploys the static files
automatically after a push. There is no separate local production compilation.
Before publishing, run the portal checks below; after pushing, verify the
**pages build and deployment** workflow succeeds for the new `main` commit and
check <https://mooseenergy.ai/admin/>. Keep `CNAME` unchanged.

The sibling `../deploy/release.sh` releases the backend repositories and excludes
this website. Website releases merge `dev` into `main` and use GitHub Pages.

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
effective assignments, and decision history. On `mooseenergy.ai` and
`www.mooseenergy.ai`, it defaults to **production**; local previews default to
**development**. The environment selector and explicit `?environment=` links
use separate Auth sessions for each environment. Planned
systems never grant site access. Both environments require the matching Moose
backend contract before staff controls are enabled.

Run `npm run dev` and open `http://127.0.0.1:4173/admin/`. Sign in with a development
Moose staff account. Use `npm test` for portal checks and `npm run test:browser`
for desktop/mobile journeys (requires the sibling `Mooose` repo, its dependencies,
and `npx playwright install chromium`). The backend implementation and rollout
requirements are documented in `../Mooose/docs/site-access/README.md`.

**Verify the matching production backend before publishing portal changes.** The
original preflight found missing onboarding migrations. A read-only production
check on September 15, 2026 found those migrations, the workspace/review-v2/FIT-rate
RPCs, and active `staff-site-access`, `connection-review`, and `admin-stats`
functions. Staff sign-in and the intended workflows still need verification for
each rollout. The mobile staff link checks `admin/portal-contract.json` before
opening the environment-aware portal.

The current production backend does not supply the legacy onboarding pipeline or
aggregate HubSpot summary, and `admin-pipeline` returns 404. The portal marks these
as unavailable and disables planned-user editing when `admin-stats` omits
`planned`; Requests, Assignments, FIT rates, and per-feedback delivery status
remain available. Restoring the legacy editor requires a backend release.

## Temporary local production presentation

To use this checkout with production without pushing to GitHub Pages:

```sh
npm run preview:production
```

Open <http://127.0.0.1:4174/admin/?environment=production> and sign in with your
production Moose staff account. Leave the terminal running; Ctrl+C stops it.
Use `npm run preview:production -- --port 4175` if port 4174 is busy. This port has
its own browser storage, so sign in again even if the usual dev preview is open.
Production edits affect real customers, as shown by the portal's environment bar.

This server binds only to loopback and serves the admin assets. It relays the four
admin function routes to the selected, fixed Supabase project, carrying the
signed-in user's JWT and public API key. It requires same-origin requests and
never reads service keys or management credentials. Authentication goes directly
to Supabase, and all backend authorization and readiness checks still apply.
Development also works through this server when selected in the environment menu.

The proxy marker is injected only by this command. Regular `npm run dev` and
GitHub Pages continue to call Supabase directly. The normal local preview cannot
call production functions because production excludes local origins from CORS.

## Backend and publication

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

The `dev` branch carries portal changes; GitHub Pages publishes `main`.
Run `npm run dev` and open `http://127.0.0.1:4173/admin/?environment=development`.
The companion app's `docs/site-access/presentation.md` contains the demo walkthrough.

Company asset of JAZZ Solar Solutions / Moose AI (Jazz-Solar GitHub org).
Related repos: `Jazz-Solar/Mooose` (mobile app), `Jazz-Solar/Inverto`
(interop API), `Jazz-Solar/moose-digital-twin` (pvlib twin).
