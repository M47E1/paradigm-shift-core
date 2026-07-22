# Contributing

Thanks for improving Paradigm Shift Core.

## Setup

Use Node.js 24 LTS or Node.js 26 and npm 11.

```bash
npm ci
npm run setup:hooks
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
- media without documented redistribution permission or format-aware privacy inspection
- Git LFS pointers or other files whose reviewed bytes live outside Git history
- generated reports, build artifacts, backups, or production deployment state
- `.gitattributes` rules using `ident` or `working-tree-encoding`; the scanner rejects every mention conservatively because checkout transforms can conceal stored blob bytes

Any new file-backed asset must be registered in `asset-rights.json` with its provenance, license, authorization reference, and SHA-256. Keep the human-readable inventory in `ASSET_RIGHTS.md` synchronized.

The repository-local pre-push hook scans commit trees, metadata, paths, tag annotations, and ref names before they reach the public remote. Its launcher contents and executable mode are pinned by the scanner. Do not bypass it. Stage or restore tracked worktree edits before running the check so Git and worktree bytes have one reviewable state. When a remote has no default branch, every reachable commit is scanned; squash histories longer than 100 commits into a reviewed publication commit before the initial push.

Changes to the publication boundary listed in `.github/CODEOWNERS` require repository-owner review.

GitHub is configured for rebase-only pull request merges so final branch history reuses the commit messages already checked by the public-boundary scanner. Keep every commit message public-safe, and do not use an administrative bypass to enable merge commits or squash messages.

By submitting a contribution, you confirm that you have the right to provide it and agree that it is licensed under the repository's MIT License.
