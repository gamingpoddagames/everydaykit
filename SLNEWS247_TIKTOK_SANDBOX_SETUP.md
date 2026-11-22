# SL NEWS 24/7 TikTok Sandbox connection

Separate from FreeSignal. TikTok app: World Video Publisher, Sandbox: SLNews247-TikTok-Test. Target account: @slnewstwentyfourseven.

## Register redirect URI in TikTok Sandbox Login Kit

`https://everydaykit.gamingpoddagames.workers.dev/slnews247/auth/callback`

Remove the old `/freesignal/auth/callback` redirect from this **SL NEWS Sandbox** only after registering the new one. Do not change the separate FreeSignal TikTok app.

## Cloudflare Worker secrets

Use TikTok **Sandbox** Client Key and Client Secret from this same app. Never commit them to GitHub, share them in chat, or paste them into public deployment URLs.

```powershell
npx wrangler secret put SLNEWS247_TIKTOK_CLIENT_KEY
npx wrangler secret put SLNEWS247_TIKTOK_CLIENT_SECRET
npx wrangler secret put SLNEWS247_OAUTH_ADMIN_KEY
```

The third secret must be a new, random, independent string of at least 32 characters. Existing `TIKTOK_ENCRYPTION_SECRET` and `TIKTOK_AUTH` KV binding are reused; saved SLNews tokens use a different KV record key. Existing FreeSignal keys/tokens remain untouched. Run these commands from the existing EverydayKit folder, targeting the exact Worker and Cloudflare account.

Connection page (owner only):
`https://everydaykit.gamingpoddagames.workers.dev/slnews247/auth/connect`

Safe public config probe (no secrets disclosed):
`https://everydaykit.gamingpoddagames.workers.dev/slnews247/auth/status`

After credentials are configured, the owner visits the connection page, enters the independent owner authorization key, logs in to the sandbox target TikTok account, approves requested scopes, and sees a callback confirmation. This is **not** evidence that any video was uploaded. The API requires a separate draft-upload test and an actual recorded end-to-end flow before review. Public Direct Post is not implemented or enabled here.

Production deploy is triggered by the existing `deploy-freesignal-media.yml` GitHub Actions workflow. Check its actual result; do not assume deployment success solely from commits.
