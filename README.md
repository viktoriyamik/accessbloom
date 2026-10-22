# AccessBloom

**AI-assisted accessibility insights for inclusive design · An independent product by Viktoriya Mikhaylova**

AccessBloom is a working full-stack portfolio application that brings together browser-based accessibility analysis, evidence-grounded multimodal AI suggestions, human review, and before/after comparisons. It includes a fully explorable synthetic sample report so portfolio visitors can try the experience without credentials.

**Intended public URLs after operator deployment**

- Interactive application: `https://vik.ooo/accessbloom/`
- Product design case study: `https://vik.ooo/case-studies/accessbloom/`
- GitHub repository (original URL retained): `https://github.com/viktoriyamik/accessbloom`

The vik.ooo links above are deployment targets, **not assertions that they are currently live**. The source remains under its existing GitHub repository slug until separately renamed or transferred.

## Current verified status

The source code, public interactive demonstration, SQLite persistence layer, review workflow, comparison model and export UI are implemented and covered by runnable tests. Real browser scans require installing npm dependencies and Playwright Chromium and permitting a domain. AI-generated content requires a valid API key; its live-provider behavior is not verified until configured. This source has been published to GitHub, but VPS deployment has not been verified.

## Features

| Feature | Public demo | Owner mode |
|---|:---:|:---:|
| Responsive dashboard and navigation | ✓ | ✓ |
| Clearly labelled five-issue illustrative report | ✓ | ✓ |
| Explain issue evidence, source selector, HTML, relevant rules | ✓ | ✓ |
| Compare two sample assessment states | ✓ | — |
| Live permitted-domain audit via Chromium + axe-core | — | ✓ |
| Optional screenshot-guided OpenAI explanations | — | ✓ |
| Human review statuses: Open, In progress, Fixed, Accepted risk | Session | Persistent |
| Scan history and difference comparison | Sample | Persistent |
| JSON/CSV export and print-to-PDF | ✓ | ✓ |
| Sensitive audit data not exposed to visitors | n/a | ✓ |

The application uses **axe-core's evidence** as the source of detected violations. AI does not create new verified violations or make WCAG compliance claims. The heuristic priority score is not a WCAG compliance score.

## Stack

- Client: semantic HTML, responsive CSS, vanilla modern JS (no client dependency or build step).
- Backend: Node.js 22+ native HTTP server.
- Database: Node.js `node:sqlite` (experimental on Node 22; production Node 24+ recommended).
- Scanner: `playwright` Chromium and `@axe-core/playwright`.
- AI: opt-in OpenAI Responses API (`OPENAI_MODEL=gpt-4.1-mini` by default) using structured JSON-style prompt guidance and a reduced page screenshot.
- Ubuntu: `systemd` on loopback + an Nginx location mounted in the existing portfolio vhost.

## Run locally

1. Install Node.js 22.13+ and npm, then from this directory run `npm install`.
2. Install browser dependencies: `npx playwright install chromium` (on minimal Ubuntu also `sudo npx playwright install-deps chromium`).
3. Copy `.env.example` to `.env`, choose a random owner token and your permitted scanning hosts, set `DATA_DIR=./data` for local development.
4. In a shell, `set -a; source .env; set +a; npm start`.
5. Visit `http://127.0.0.1:4117/accessbloom/`. Public demo works even without configured OpenAI access.
6. Run `npm test` to execute the core + HTTP smoke tests.

The `.env` file is excluded from Git. Do not paste your secret key into the web application or commit it to source control. Owner mode is intended for a single operator, not a production multi-tenant identity solution.

## Install on your Ubuntu VPS

Existing portfolio context: React/Vite source at `/home/lihvool/viki`, built static files under `/home/lihvool/viki/dist`, and an existing PM2 `portfolio-ai` backend. AccessBloom uses an independent service on loopback port `4117` so it does not change the running portfolio backend or existing portfolio content.

Transfer/unzip this project to your VPS, then in its root:

```bash
sudo bash scripts/deploy-ubuntu.sh
```

The script installs to `/opt/accessbloom`, creates a limited-privilege `accessbloom` service account, configures `/etc/accessbloom/accessbloom.env`, downloads Playwright Chromium, enables `systemd` service `accessbloom`, and writes `/etc/nginx/snippets/accessbloom.conf`. **It does not edit your existing Nginx site configuration.** Inspect the generated files before deploying on a production VPS. `rsync`, `openssl`, Node/npm, and Chromium system dependencies are required.

Add this line **inside the existing `vik.ooo` HTTPS `server {}` block** before the SPA fallback in the appropriate Nginx vhost (often `/etc/nginx/sites-available/viki`):

```nginx
include /etc/nginx/snippets/accessbloom.conf;
```

Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status accessbloom --no-pager
curl -f https://vik.ooo/accessbloom/api/health
```

Check the site on both mobile and desktop. If your server currently uses a different vhost or frontend directory, adjust only the relevant path. Take a snapshot/backup before site edits. The service secret is in `/etc/accessbloom/accessbloom.env` (permissions `0600`), not the public code.

**Security prerequisite before running real scans:** browser automation that fetches user-provided URLs is an SSRF-sensitive workload. The code includes application-layer restrictions, but these do **not** eliminate DNS rebinding. Keep real scans owner-only and host-allowlisted, and enforce a container/network namespace or outbound firewall that blocks loopback, private networks, link-local metadata, etc. See [SECURITY.md](SECURITY.md). For full isolation, deploy the scanning worker in a separate network-restricted container; the provided single-service installer is a portfolio/single-operator starting point, not hardened SaaS multi-tenancy.

### Enable live AI

Edit `/etc/accessbloom/accessbloom.env` and set `OPENAI_API_KEY` on the server. The API key never needs to be configured in React, JavaScript, Nginx, GitHub, or your visitor-facing portfolio. Then restart the service:

```bash
sudo systemctl restart accessbloom
```

OpenAI is used only when owner scanning is invoked; public sample reports contain authored illustrative explanations and do not call a live AI provider.

### Add the case page into the current portfolio

```bash
bash scripts/install-portfolio-case.sh /home/lihvool/viki
```

This copies a **standalone case page** to the Vite `public/case-studies/accessbloom/` folder, builds the existing portfolio, and leaves its app routing and PM2 assistant unchanged. The case page then lives at `/case-studies/accessbloom/`, provided Nginx serves the Vite build from its configured location.

To feature AccessBloom on the existing React homepage, add the `accessBloomProject` object from `portfolio-integration/featured-card.jsx` to **the actual featured-project array or grid in your current App.jsx**. This is intentionally not automated: the active portfolio component structure was not available in this session, and a blind rewrite could damage existing projects. Keep HaeSiivooja, Aura, CleanPeer and the portfolio AI assistant intact.

### Publish to the existing GitHub repository

Once GitHub CLI (`gh`) is authenticated with permission to write to `oleglihvoinen/accesslens-ai`:

```bash
bash scripts/publish-to-github.sh
```

The script pushes to **`oleglihvoinen/accesslens-ai`**, with no force pushes. If the repository already contains divergent commits, it stops rather than overwriting history; reconcile before pushing. It never includes `.env`, `data/` or `node_modules/`.

This script targets only the `oleglihvoinen` repository.

## API overview

| Method | Path | Access |
|---|---|---|
| GET | `/api/health` | Public |
| GET | `/api/config` | Public |
| GET | `/api/demo` | Public |
| POST | `/api/scans` | Owner |
| GET | `/api/reports` | Owner |
| GET/DELETE | `/api/reports/:id` | Owner |
| PATCH | `/api/reports/:id/issues/:issueId` | Owner |
| GET | `/api/reports/:id/screenshot` | Owner |
| GET | `/api/reports/:id/export/json` or `/csv` | Owner |

Each API path is prefixed with `/accessbloom` behind Nginx. Owner calls use `Authorization: Bearer <SCAN_ACCESS_TOKEN>`.

## Evidence and AI limitations

- Automated testing detects a subset of WCAG problems; keyboard testing, assistive technology, contrast context and real user testing remain essential.
- AI can hallucinate or suggest an incomplete fix; verify remediation in the real page context.
- The sample screenshot is intentionally an illustration and is labelled as such. The sample five issues are plausible fixtures, **not measured performance of Northstar or any real site**.
- Real scans analyze a single public page with an approved host, not logged-in workflows or a complete website crawler.
- Report history is private to one shared operator key. Team access, encryption at rest, retention controls, job queues, worker isolation, tenant separation, evaluation metrics and managed deployments require additional engineering for commercial SaaS use.

See [AI evaluation plan](docs/AI-EVALUATION.md), [architecture](docs/ARCHITECTURE.md), [security](SECURITY.md), and [accessibility statement](ACCESSIBILITY.md).

## Portfolio story and authorship

This project showcases **AI-driven product design and implementation**, not simply code generated by AI. Document the problem framing, UX flows, evidence hierarchy, human-AI control boundaries, implementation decisions, evaluation results and improvements over time. The separate portfolio case page is a polished starting artifact; update it with actual participant findings, real production audit screenshots and deployment URLs once validated.

MIT-licensed example project. The trademarks of axe-core, Playwright and OpenAI belong to their respective owners. Not affiliated with Deque, W3C or OpenAI.
