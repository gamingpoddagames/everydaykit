# EverydayKit

Production-ready static MVP for a worldwide free-tools platform.

## Included
- Responsive homepage with search and categories
- 10 working browser-side tools
- Individual SEO-friendly tool pages
- Privacy, Terms and Contact pages
- robots.txt and sitemap.xml
- Vite build/development setup

## Run
```bash
npm install
npm run dev
```

Build:
```bash
npm run build
```

Output: `dist/`

## Deploy to Cloudflare Pages
Connect the GitHub repository to Cloudflare Pages. Use:
- Build command: `npm run build`
- Output directory: `dist`

Before production, replace `YOUR-SITE.pages.dev` in canonical URLs, robots.txt and sitemap.xml with the actual site URL.

## Next milestones
1. Search Console and Bing Webmaster Tools
2. Add 20–30 more high-quality tools
3. Add original guides and FAQs
4. Add analytics after the privacy disclosure is updated
5. Add Supabase only when accounts/favorites/feedback are needed
6. Monetize after substantial useful content and genuine traffic
