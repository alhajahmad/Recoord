# Recoord

Turn ideas into work you can return to. Recoord is an MIT-licensed AI workspace with projects, persistent conversations, and editable documents. It is an application, not a trained model, and is not affiliated with Anthropic.

## What works

- Private account-owned projects with a goal and reusable text context.
- Three starting points: plan a project, draft a document, compare options.
- Streaming chat with an OpenAI-compatible HTTPS model provider.
- Save replies as independent editable documents, with conflict detection and Markdown export.
- Saved composer drafts, project/workspace JSON exports, and deletion controls.
- Responsive interface, a clearly labeled sample, and optional WebMCP prompt staging.
- Server-side credentials, ownership checks, same-origin write checks, user/site daily limits, bounded history and output.

No model provider is connected by default. Documents and projects work without one; AI answers need provider configuration. The source archive is available from the app. Source repository: https://github.com/alhajahmad/Recoord.

## Local development

Requires Node.js 22.13+ and npm.

```sh
npm ci
cp .env.example .env
npm run build
node scripts/migrate-local.mjs
npm run dev
```

Open the printed local URL. Local sign-in uses a simulated development account, not a real ChatGPT session. Never use that development server as a public deployment.

## Model configuration

Set server runtime values and redeploy: `AI_BASE_URL` (HTTPS compatible API base), `AI_MODEL` (provider's model ID), `AI_API_KEY` (secret), and optionally `AI_PROVIDER_LABEL` (display name). The adapter requests `/chat/completions` with streaming enabled. Open-weight models can be used through compatible providers; model licenses and provider charges are separate from this application's license.

Optional limits: `AI_DAILY_REQUEST_LIMIT` defaults to 50 per account, `AI_DAILY_SITE_REQUEST_LIMIT` to 200 across the installation, and `AI_MAX_OUTPUT_TOKENS` to 2048. Failed attempts may consume allowances. These safeguards do not replace a provider spending limit.

## Hosting

The hosted edition uses OpenAI Sites authentication and Cloudflare D1. A fork must register its own Site and `project_id`; the downloadable archive omits the original Site identity. Keep checked-in migrations and apply new migrations during publication.

For independent deployment, see [self-hosting](docs/self-host.md). That edition verifies Cloudflare Access signed identity tokens before forwarding requests to the app. Do not publish the unwrapped Sites worker on an unrestricted host: it trusts identity headers supplied by the Sites dispatcher.

## Data

Projects, conversations, documents, and drafts are stored under your account ID. Sending chat shares the project goal/context and bounded recent messages with the configured model provider. Text attachments become prompt/context text; there is no PDF or image processing. Saved documents are sent only if you explicitly add their content to a prompt/context. The app adds no analytics.

Drafts are also temporarily cached in the browser session and cleared on sign-out. Deletion removes selected stored work; it does not erase the provider's retained data or delete your sign-in account. Daily quota counters remain until administratively cleared. Operators should publish their own retention and contact information.

## Checks and contributions

```sh
npm test
npx tsc --noEmit
npm run build
```

Generate schema changes with `npm run db:generate`; do not edit already-applied migrations. Tests cover streaming parsing and signed self-host identity validation. Local API checks also verified saved work, edit conflicts, draft persistence, exports, deletion cascades, and isolation between accounts. Live model generation and deployment to an independent Cloudflare account still require end-to-end verification.

See [contributing](CONTRIBUTING.md), [security](SECURITY.md), and the [pilot guide](docs/pilot.md). Dependencies retain their own licenses.
