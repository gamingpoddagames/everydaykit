# FreeSignal TikTok Sandbox OAuth — Cloudflare configuration

## Current status (14 November 2026)

The GitHub repo contains `src/worker.js`, `wrangler.jsonc`, and the private-setup form at `public/freesignal/connect.html`. GitHub Actions CI compiles the existing Vite site, checks Worker syntax and ensures the public FreeSignal pages and TikTok verification file remain in `dist/`.

**This code is not proof of a live OAuth login.** Cloudflare must deploy the Worker script, provision the `TIKTOK_AUTH` KV namespace, and receive its secrets. Never put TikTok credentials in source code, a GitHub issue, a screenshot or chat.

## Cloudflare setup

The Wrangler configuration uses:
- Worker name `everydaykit`
- `main: src/worker.js` with existing `assets.directory: ./dist`
- `assets.binding: ASSETS`, and `run_worker_first` only on `/freesignal/auth/*`
- `TIKTOK_AUTH` KV binding with automatic provisioning by modern Cloudflare deployments. Verify it exists under Worker Settings → Bindings.

After successful Worker deployment, configure these **encrypted Secret** values in Cloudflare Worker Settings → Variables and Secrets:

| Secret name | Value |
| --- | --- |
| `TIKTOK_CLIENT_KEY` | **Sandbox** Client Key for FreeSignal Video Publisher |
| `TIKTOK_CLIENT_SECRET` | **Sandbox** Client Secret from TikTok Developer portal |
| `FREESIGNAL_OAUTH_ADMIN_KEY` | Owner-only random string of at least 32 characters; different from TikTok secrets |
| `TIKTOK_ENCRYPTION_SECRET` | Separate random string of at least 32 characters, used to encrypt stored TikTok tokens |

Keep production and Sandbox credentials distinct. For Sandbox testing use the Sandbox credentials and target user that the owner added.

`FREESIGNAL_OAUTH_ADMIN_KEY` is entered privately in the password field at
`https://everydaykit.gamingpoddagames.workers.dev/freesignal/connect.html`.
No auth key is appended to a URL. It is sent via HTTPS POST to
`/freesignal/auth/start`. This backend endpoint checks the admin key before
redirecting the owner to TikTok.

When TikTok sends an authorization code back to
`https://everydaykit.gamingpoddagames.workers.dev/freesignal/auth/callback`,
the Worker validates its CSRF state cookie and single-use KV state,
exchanges the authorization code server-side, verifies that
`video.publish` was granted, encrypts and stores the access/refresh tokens in
`TIKTOK_AUTH` KV and confirms success **without showing tokens**.

TikTok tokens expire and must be refreshed before subsequent posting; the
existing Facebook/TikTok GitHub publisher still has **no ability to retrieve
the stored Cloudflare tokens**, and no publicly accessible token delivery
endpoint exists. A separate authenticated, refresh-aware GitHub integration
must be built before unattended TikTok publishing. For now, owner login can
be sandbox-tested safely once the secrets and binding are configured.

**Verification checklist**

1. Cloudflare Worker Deployments shows newest GitHub change as Ready, not failed.
2. Worker Settings shows actual script runtime and `TIKTOK_AUTH` binding; Variables and Secrets allows encrypted secrets.
3. `/freesignal/` homepage, `/freesignal/terms.html`,
   `/freesignal/privacy.html`, and TikTok's `tiktokq0xC8VNBQluxxAAeHjmvwWRqANNCK4nY.txt` verification file still work.
4. `/freesignal/auth/start` with GET returns a safe 'Use private ... form' error after secrets are configured (it must NOT return the EverydayKit home page).
5. Owner opens `/freesignal/connect.html`, enters the owner-only setup key,
   approves the TikTok Sandbox scopes, and receives a success page. Never
   share the OAuth callback URL while it contains `code` and `state` values.

If Cloudflare Git integration uses custom Wrangler settings, ensure it deploys
`wrangler.jsonc` **with** Worker `main`, not as a static-only assets Worker.
Do not delete the existing Worker to switch modes.

Current documentation: https://developers.cloudflare.com/workers/static-assets/binding/
TikTok OAuth: https://developers.tiktok.com/docs/en/login-kit-web
