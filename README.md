# Paradigm Shift Core

A privacy-safe, accessible personal operating system starter built with Next.js, React, and Three.js.

The repository is a clean-room public core. It preserves the interaction idea of a spatial personal site while replacing private records, client material, commercial media, and production operations with neutral fixtures.

## Included

- A full-bleed Three.js stage for capable desktop browsers.
- Ordinary DOM navigation beside the canvas.
- Mobile and reduced-motion fallbacks that do not mount WebGL.
- Neutral project, thinking, about, and contact routes.
- Security headers, public-surface checks, unit tests, and Playwright coverage.
- Code-generated visuals with no copied photos, music, logos, or customer screenshots.

## Deliberately excluded

- Personal contact details, CVs, private notes, and research evidence.
- Client identities, domains, screenshots, pricing, and operational records.
- Crawlers, browser profiles, cookies, storage state, and deployment credentials.
- Commercial audio and media with unclear redistribution rights.
- Backups, audit artifacts, generated reports, and the private repository history.

## Requirements

- Node.js 24 LTS or Node.js 26
- npm 11

## Run locally

```bash
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Production build

Set `NEXT_PUBLIC_SITE_URL` to the absolute deployed origin before running `npm run build`. Production builds stop when it is missing so metadata, `robots.txt`, and `sitemap.xml` cannot silently publish a localhost URL.

`npm run build:verify` reads the local value in `.env.example`; it is intended only for tests and CI.

## Verify

```bash
npm run check
npm run test:e2e
npm run check:public
npm audit --omit=dev
```

The Playwright command builds the production application and starts an isolated server on port 3100.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Accessible spatial stage and system overview |
| `/projects` | Neutral reference implementations |
| `/thinking` | Sample note and decision frames |
| `/about` | Public/private architecture boundary |
| `/contact` | Repository and issue channels |

## Customize

Edit `src/config/site.ts`, `src/data/projects.ts`, and `src/data/principles.ts`. Keep personal or commercial content in a separate private content layer.

Any new media must satisfy [ASSET_RIGHTS.md](ASSET_RIGHTS.md). Do not copy files from a private production workspace into `public/` without reviewing identity, metadata, licensing, and redistribution permission.

## Accessibility and performance

The canvas is decorative. Navigation and content remain available as semantic HTML. At widths below 768 pixels, when reduced motion is requested, or when WebGL fails, the page uses a static CSS field. The canvas caps device pixel ratio and pauses when the document is hidden.

## Security boundary

This is a frontend starter with no authentication, database, upload, or account automation. Review [SECURITY.md](SECURITY.md) before adding a backend or handling user data.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

Code and repository-authored documentation are licensed under the [MIT License](LICENSE). Third-party packages retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
