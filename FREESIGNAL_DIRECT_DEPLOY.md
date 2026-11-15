# Direct deployment of the FreeSignal media Worker

The connected Cloudflare build remained in Initializing, before repository cloning. The direct GitHub Actions workflow uses the same existing Worker and site through Cloudflare's deployment API.

## Owner authorization

In this repository's Actions secrets, store a scoped Cloudflare API token as `CLOUDFLARE_API_TOKEN`. Never put the value in source, an issue or chat. Scope the token to the existing Gamingpoddagames Cloudflare account only.

| Account permission | Access |
| --- | --- |
| Workers Scripts | Edit |
| Workers KV Storage | Read |
| Account Settings | Read |

Use a custom API token, not a Global API Key. API token creation and storing its value are owner actions. No paid subscription, domain purchase or additional storage namespace is required.

## Operation and verification

Run **Deploy FreeSignal Media Worker Directly**. It confirms the exact account and existing `everydaykit` Worker, retrieves only its existing binding metadata, and requires exactly one live `TIKTOK_AUTH` namespace. The generated deployment configuration reuses that ID. It copies no remote secret or plain-text values, and retains existing variables and secrets.

The workflow builds the current Vite site, checks the Worker routes and authorization tests, deploys through Wrangler, and verifies the live anonymous-write rejection and existing site pages. A missing token stops with `SETUP_PENDING`; that is not a successful deployment.

After this workflow passes, rerun **FreeSignal TikTok via Buffer Free** in the private AutoTradingSignals repository. Its setup probe verifies an authorized upload of the original MP4 and anonymous MIME/hash read-back. Its daily receipt prevents another TikTok post on a date already published. Keep the native internal TikTok audit gates and all FreeSignal account checks.

References:
- https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/configuration/secrets/
