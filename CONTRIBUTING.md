# Contributing

Thanks for improving Paradigm Shift Core.

## Setup

Use Node.js 24 LTS or Node.js 26 and npm 11.

```bash
npm ci
npm run dev
```

## Before a pull request

Run:

```bash
npm run check
npm run test:e2e
npm run check:public
npm audit --omit=dev
```

Check the changed interface at desktop width, 390-pixel mobile width, with keyboard-only navigation, and with reduced motion enabled.

## Scope and privacy

Keep pull requests bounded. Do not submit:

- credentials, environment files, browser sessions, cookies, or absolute user paths
- personal records, customer or employer material, unpublished research, or account screenshots
- media without documented redistribution permission
- generated reports, build artifacts, backups, or production deployment state

Any new binary asset must be recorded in `ASSET_RIGHTS.md` with its provenance, license, authorization reference, and SHA-256.

By submitting a contribution, you confirm that you have the right to provide it and agree that it is licensed under the repository's MIT License.
