# SL NEWS 24/7 direct publishing connection

This isolated route connects the existing GitHub news workflow to the owner's existing vidIQ TikTok authorization. It does not use the old TikTok Sandbox inbox uploader, create a separate publishing schedule, or replace Facebook/Telegram/Blogger credentials.

Open https://everydaykit.gamingpoddagames.workers.dev/slnews247/vidiq/connect and connect the same vidIQ account that owns the already verified SL NEWS 24/7 TikTok profile. The callback rejects any other publishing account. Authorization and rotating refresh tokens stay encrypted in the existing Cloudflare KV under a separate key; no token is returned to the browser or GitHub.

GitHub calls the bridge with a short-lived OIDC token for audience slnews247-vidiq-publisher. The bridge verifies GitHub's RS256 signature, issuer, expiry, exact repository/owner, main ref, event, and news.yml or blogger-mirror.yml workflow. Only media-import and TikTok publishing tools for platform account _000pSUDUpUO5p3zoi4neSwWWUIyukn4lGIr are allowed. Public visibility, comments enabled and no added music are enforced. Future publishAt values and other accounts/platforms are rejected.

No public publication is claimed from successful authorization alone. Check the production delivery journal and returned platform post URLs. The native pipeline must create and immediately publish each validated post in the same run, preserving existing source/media checks and duplicate receipts. GitHub scheduling and TikTok processing/rate limits remain external constraints.

OAuth discovery: https://mcp.vidiq.com/.well-known/oauth-protected-resource and https://mcp.vidiq.com/.well-known/oauth-authorization-server. API keys are read-only; this uses the owner's explicit OAuth grant instead. Existing FreeSignal and SL NEWS Sandbox authorization records are unchanged.
