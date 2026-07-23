# Security Policy

## Supported version

Security fixes target the latest commit on `main`.

## Report a vulnerability

Use GitHub's private vulnerability reporting for this repository. Do not place credentials, personal data, exploit payloads, or private infrastructure details in a public issue.

For ordinary bugs without sensitive content, use the public issue tracker.

## Research boundaries

Good-faith testing is welcome when it avoids denial of service, social engineering, destructive actions, credential access, private-data collection, and testing against accounts or production systems you do not own.

Reports are handled on a best-effort basis. Copyright or asset-rights concerns should also be reported privately so potentially sensitive evidence is not republished.

## Public-history boundary

Run `npm run setup:hooks` once per clone. The repository-local pre-push hook rejects blocked material in the current tree, introduced commit trees and metadata, tag annotations, and ref names, including content added and deleted within the same branch. For an empty remote it scans all reachable commits rather than trusting stale remote-tracking refs. CI repeats the history scan. A read-only pull request workflow checks out the immutable base revision, uses that trusted scanner to inspect pull request objects in an unprivileged job, and uploads a success marker bound to the pull request number, run attempt, base, head, and synthetic merge. The privileged `workflow_run` publisher never fetches or checks out pull request content: it authenticates that marker and the pull request, verifies the merge parents, confirms that the complete workflow subtree and scanner blob match the base, rechecks the default-branch tip and pull request state, and only then posts the required result. This two-step design also supports Dependabot's restricted pull request token.

GitHub checks happen after branch data reaches GitHub, so they are not a substitute for the local hook or a private staging repository. If a required check is renamed or unavailable, an administrator must edit or temporarily disable the main-branch ruleset before merging; restore it immediately after recovery.

GitHub identifies required checks by the GitHub Actions integration, not by one immutable workflow file. `CODEOWNERS` therefore requires owner review for changes to workflows, the scanner, the hook, its tests, and package commands. The trusted publisher also fails closed when a pull request changes any workflow or the scanner, so those trust-anchor changes require the pull-request-only owner bypass after separate manual verification. A dedicated GitHub App or external verifier is required before giving untrusted collaborators write access.

GitHub creates new commit objects when it rebases a pull request after checks. The repository therefore permits rebase merges only: their messages come from the head commits already checked by the public-boundary scanner, rather than from an editable pull request title or merge-message field. The resulting object IDs are still created after the check, so push CI remains a post-publication backstop. Never use an administrative bypass to enable merge commits, squash messages, or new sensitive metadata.

The public-surface scanner is a fail-closed pattern and structure check, not a JavaScript interpreter or a license oracle. It normalizes common text encodings and HTML character-reference obfuscation, compares history checkouts to stored Git blob identities, pins the hook launcher, and rejects opaque asset containers until format-aware inspection exists. Human review must still catch sensitive or unlicensed content assembled dynamically from otherwise harmless fragments.

The unprivileged scan deliberately has no cache, runs no package or pull request scripts, and executes a scanner that currently imports only Node.js built-ins. If that scanner gains local imports or actions, expand the frozen trust set before merging. Privilege separation cannot make a success marker cryptographic proof against a future Git, Node.js, runner, or scanner parsing vulnerability; keep the runner and pinned actions current.

## Browser policy

Production responses set a restrictive baseline CSP and related browser headers. The static Next.js App Router output currently requires inline bootstrap scripts and component styles, so `script-src` and `style-src` permit `'unsafe-inline'`; production does not permit `'unsafe-eval'`.

The starter renders no untrusted HTML and accepts no user content. Revisit the policy and adopt request-scoped nonces before adding dynamic user input, authentication, or third-party scripts.

## Dependency overrides

`package.json` temporarily overrides Next.js transitive dependencies with `postcss@8.5.22` and `sharp@0.35.3` so the locked production tree uses versions that address the applicable security advisories. These are compatibility exceptions: Next.js 16.2.11 declares `postcss@8.4.31` and `sharp@^0.34.5`, so the overrides do not imply upstream support for those versions.

The current lockfile has passed `npm ci`, lint, type checking, unit tests, the production build, and Chromium, Firefox, and WebKit end-to-end tests. That evidence covers this starter's present routes, but not every future PostCSS plugin or `next/image` transform.

Remove an override when a stable Next.js release declares a patched version in its own dependency range and the checks below still pass without the override. Reassess both overrides whenever Next.js changes, an advisory is revised, or the starter begins using custom PostCSS plugins or image transforms.

```bash
npm ci
npm explain postcss
npm explain sharp
npm audit --omit=dev
npm audit
npm run check
npm run test:e2e
```
