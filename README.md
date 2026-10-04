# Recoord

Turn ideas into work you can return to. Recoord is an MIT-licensed AI workspace with projects, persistent conversations, and editable documents. It is an application, not a trained model, and is not affiliated with Anthropic.

## What works

- Shared projects with owner, editor, and viewer roles; private personal AI conversations.
- Three starting points: plan a project, draft a document, compare options.
- Streaming chat with an OpenAI-compatible HTTPS model provider.
- Save replies as independent editable documents, with conflict detection and Markdown export.
- Saved composer drafts, project/workspace JSON exports, and deletion controls.
- Refined responsive workspace, keyboard project/chat search (Command/Ctrl + K), accessible mobile navigation, and optional WebMCP prompt staging.
- Integrations: one-time public GitHub README import into project documents and calendar (.ics) export of open task deadlines. No external account connection or live sync is implied. Imports require editor/owner access; exports respect project read access.
- Shared task boards, member invitations, discussions, decisions, and reviewed AI progress summaries.
- Server-side credentials, ownership checks, same-origin write checks, user/site daily limits, bounded history and output.

No model provider is connected by default. Documents and projects work without one; AI answers need provider configuration. The source archive is available from the app. Public repository: https://github.com/alhajahmad/Recoord.

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


## Team coordination

Open a project and select **Team board**. Owners invite people by exact sign-in email, choose editor/viewer access, and copy the invitation link. No email is sent. Invitations appear in the invited account's sidebar, require explicit acceptance, and expire after seven days. Owners can revoke invitations and remove or change members. The creator remains the owner.

Members share project goals, context, documents, tasks, comments, decisions, and updates. Personal AI conversations and drafts remain private. Editors can assign tasks, set dates and statuses, edit documents, and post comments or decisions. Viewers can read and export shared work. Comments can be attached to a document and mention current members; mentions appear inside the project discussion, without email or push notifications.

The board refreshes every 20 seconds. Document and task versions prevent silent overwrites; this is not simultaneous text editing. AI summaries use bounded shared project data, never private conversations. Review the summary before sharing it, and approve individual suggestions before they become unassigned tasks.

Deleting a project removes its work for every member. Deleting an account's Recoord data deletes owned projects, private conversations and drafts, and memberships. Contributions to projects owned by others remain with a former-member attribution. This action does not delete the external sign-in account or provider records.

Collaboration tests exercise real SQLite migrations and API handlers with simulated identities, including invited-email matching, viewer/editor/owner permissions, task and document conflicts, revoked access, exports, and cascade deletion. Provider responses in those tests are mocked; live AI is checked separately on the deployment.


## Finding your way around

Your workspace opens with project cards. Selecting a project opens its overview, with assigned work, overdue tasks, progress, and the next task due. Use Project board, Private chat, and Documents to switch views; project/view URLs survive reloads and can be bookmarked. Task search and filters help narrow the board, status can be changed from a card, and New task or Edit details opens a focused dialog. AI responses render standard Markdown lists, links, code, and tables. The interface adapts to mobile screens and reduced-motion preferences.

### Project read API

Owners can create a read-only project key from **Administration → API keys**. Keys expire after 30 days, are shown once, and can be revoked immediately. Recoord stores a SHA-256 hash, not the credential. Treat a key as access to that project's shared data.

Send `Authorization: Bearer <your-key>` to `GET /api/v1/project` on your Recoord host. The endpoint returns the scoped project's title, goal, up to 100 recent tasks, and 20 recent shared documents. The response includes `truncated` flags and limits; it is not a complete backup. It excludes private AI conversations, messages, member email addresses, and project context. Each key allows 60 reads per minute. Browser sign-in endpoints do not accept these keys.

Administration shows personal usage, accessible project membership, project activity, and current configuration. It is not an organization-wide admin role. Billing, unrestricted admin keys, private tunnels, outbound webhook delivery, comprehensive audit logging, configurable API-body logging, and automatic retention policies are not implemented. Project activity and key last-use timestamps are narrower records, not a compliance audit trail.

### Project data and security policies

Administration → Data controls lets project owners save per-project policies with revision conflict checks. Project AI controls apply to project chat and summaries; GitHub import controls apply to README imports; document search uses literal keywords in shared documents; developer API controls apply to `/api/v1/project`. These policies do not disable ordinary document editing or standalone private AI chats.

Owners can restrict project API-read counts to themselves, hide project activity/metadata logs or limit them to owners, and restrict new invitations and pending invitation acceptance to exact email domains. Existing members are unchanged. Metadata logging is optional: policy-change logging records changed field names; API logging records successful project reads and key IDs, never credentials, prompts, or document bodies. `X-Recoord-Log: 1` requests logging in per-call mode. These logs are not a complete or immutable compliance audit trail.

Provider training-data sharing, provider-managed MCP/web/image/code tools, workload identity, IP filtering, and mutual TLS are unavailable in this deployment. The invitation domain policy is not a network egress allowlist. No free provider credits are promised.

The private runtime setting `RECOORD_NOTIFICATION_EMAIL` stores the operator's destination for future operational notifications. No delivery service is configured, and this setting does not forward user content or send mail.

### People and request controls

Administration → People & permissions includes per-project member search and CSV export, in-app invitations, fixed owner/editor/viewer access, and organizational groups. Only owners manage members and groups. Groups do not grant access. Non-owner members can leave; the sole owner cannot leave or demote themselves. Removing or leaving clears project task assignments and group membership. Invitations do not send email.

Administration → Limits saves a personal monthly AI request-attempt cap (default 1,000) and an in-app threshold alert. Chat and project summaries enforce the cap on the server, alongside existing daily caps. Counts begin when this feature is deployed, use UTC calendar months, include reserved attempts that fail later, and are not token usage or billing totals. Changing a cap does not reset usage. Provider TPM/RPM/batch limits, spend, paid tiers, automatic payments, and emailed alerts are unavailable until connected to verified provider and billing services.

### Operational administration

Usage and Service health show 7/30/90-day personal request observations with source, project, and key filters and CSV exports. Recorded metadata is limited to account/project/key identifiers, source, HTTP status, elapsed milliseconds, and timestamp. It contains no prompts, documents, model replies, token counts, or provider charges. History begins at deployment; search/API observations currently cover successful requests, while AI requests also record provider failures and interruptions. Authentication, authorization, and quota rejections are excluded. These best-effort observations are not service uptime or an incident monitoring system. Rows are removed when the associated account or project is deleted.

General → API key governance controls new keys created by that account: creation can be disabled and expiry constrained to 1–30 days. Existing keys are unaffected and remain individually revocable. Billing preferences save company name, billing contact, and purchase-order reference for future setup only. No payment processor, invoices, credit grants, card collection, tax-ID collection, automatic charging, or provider billing synchronization is configured.

Projects administration offers role/name filters, CSV export, and project creation. Advanced identity federation, IP gateway enforcement, mutual TLS, public embed keys, private tunnels, and organization-admin keys still require appropriate infrastructure; displayed availability is explicit.

### Screenshot app collections
The catalog includes 91 distinct apps named in the supplied plugin screenshots, reusing 18 existing entries and adding 73 listings marked **Setup required**. Collections preserve the screenshot groupings. These listings do not install plugins, connect provider accounts, or grant data access. Existing shared-link and import/export workflows keep their documented behavior. Unknown provider URLs are not guessed.
