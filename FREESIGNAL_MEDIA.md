# FreeSignal promotion media

This Worker hosts only original FreeSignal promotional MP4s that the owner intends to publish publicly. Authorization records and public promotion files use separate KV key namespaces.

| Route | Method | Expected behavior |
| --- | --- | --- |
| `/freesignal/api/buffer/media-upload` | POST | Accept an original MP4 only from the exact authorized GitHub workflow. |
| `/freesignal/api/public-video/YYYY-MM-DD/SHA256.mp4` | GET / HEAD | Return the matching public MP4, including byte-range support. |

## Deployment acceptance

The production Worker entry point is `src/worker.js`; static assets are built into `dist`. Wrangler routes `/freesignal/api/*` through the Worker before static assets. The existing `TIKTOK_AUTH` KV binding stores promotion media for 30 days under `public-promo-video:` keys.

After the connected production build finishes, an anonymous empty POST to the upload route must return HTTP 403 with `unauthorized_workflow`. A missing public MP4 must return 404. The private FreeSignal publisher additionally uploads with a short-lived GitHub OIDC assertion and verifies the anonymously downloaded video's MIME type and SHA256 before giving its URL to Buffer.

The accepted identity is `gamingpoddagames/AutoTradingSignals`, repository ID 1436107564, main branch, and `.github/workflows/freesignal-buffer-tiktok.yml`. Assertions are audience- and purpose-bound. Maximum original video size is 10 MiB. Do not expose authorization records, bot credentials, API keys or arbitrary KV keys through public routes.

The Buffer publishing secret lives only in the private publisher repository. Its account check must select exactly `@freesignaltradealerts` with Automatic delivery. Publishing uses Share Now and persistent daily receipts to prevent duplicate public TikTok posts. Native TikTok test integration gates remain separate.

A passing source test is not a deployment receipt. Keep API publishing marked pending until the live upload-authorization preflight, original-video read-back and Buffer account checks all pass. A pending build or failed Cloudflare sign-in does not prove production has updated.

This deployment note also provides a fresh production Git push so the existing connected build integration can retry the pending media-host release without modifying application behavior.
