# Self-host Recoord on Cloudflare

This path runs the application in your Cloudflare account with D1 and Cloudflare Access authentication. The signed-token verifier is unit tested; the build can be validated with Wrangler's dry run. A complete deployment still needs your Cloudflare account, domain, Access configuration, and model provider.

1. Install dependencies and build with `npm ci` and `npm run build`.
2. Authenticate Wrangler to your Cloudflare account. Create a D1 database with `npx wrangler d1 create recoord` and retain the returned database UUID.
3. Set up a Cloudflare Access self-hosted application protecting your entire chosen hostname. Configure your identity provider and an allow policy for intended users. Copy its team issuer URL (`https://TEAM.cloudflareaccess.com`) and application audience tag. Do not use a bypass policy. The application must supply signed identity tokens for every request.
4. Generate your ignored deployment configuration:

```sh
node self-host/configure.mjs DATABASE_UUID chat.example.com https://TEAM.cloudflareaccess.com ACCESS_AUDIENCE
```

5. In `self-host/wrangler.json`, set `AI_BASE_URL`, `AI_MODEL`, and `AI_PROVIDER_LABEL`. Adjust daily limits as appropriate. Keep credentials out of this file. The generated configuration disables workers.dev and preview URLs; requests to the worker still verify a signed Access token.
6. Apply all migrations, then deploy:

```sh
npx wrangler d1 migrations apply DB --remote --config self-host/wrangler.json
npx wrangler deploy --config self-host/wrangler.json
npx wrangler secret put AI_API_KEY --config self-host/wrangler.json
```

7. Visit your hostname and verify sign-in, project/document save and reopen, an actual streamed answer, sign-out, cross-account isolation, exports, and deletion before inviting users. Configure a provider spend limit. Back up D1 before upgrades.

The wrapper checks signature, issuer, audience, expiry, and required identity fields; removes caller-supplied identity headers; and supplies verified identity to the app. Keep the Access issuer/audience bound to this deployment. Do not change `main` to the underlying built worker. The sign-in provider is Cloudflare Access in this mode, although some inherited route names still mention ChatGPT.

To check bundling without publishing, use `npx wrangler deploy --dry-run --config self-host/wrangler.json`. Regenerate the build before deploying updates. The source archive intentionally excludes local database data, credentials, and the original Site identity.
