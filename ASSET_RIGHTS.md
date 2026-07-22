# Asset Rights

This repository uses a default-deny media policy. The machine-readable source of truth for file-backed assets is [asset-rights.json](asset-rights.json); this document is its human-readable summary and admission policy.

## Current inventory

| Path | SHA-256 | Owner | Source | License | Redistribution | Attribution | Modifications | Evidence ID | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/app/icon.svg` | 6fb58db78fbf2bf602f20f49ea5c8d50a7f84f17b55a76bea5167410575d808c | Repository contributors | Original geometric mark | MIT | Allowed | None required | Original repository-authored work | repo-original-icon-v1 | APPROVED |
| Three.js scene geometry and CSS visuals | Generated at runtime | Repository contributors | Source code | MIT | Allowed | None required | Runtime-generated, with no file-backed media | repo-runtime-visuals-v1 | APPROVED |

The `public/` directory intentionally contains no media in the initial release.

## Admission rule

A new passive SVG or reviewable text-based asset may enter the repository only when its pull request records:

- path and SHA-256
- author or rights holder
- original source
- exact license or written authorization reference
- required attribution
- modifications made
- explicit permission to redistribute the file in source repositories
- a non-sensitive evidence identifier and APPROVED status

CI compares every Git-tracked or publishable untracked asset against `asset-rights.json`. Missing entries, stale hashes, structurally invalid approval fields, and manifest entries without files fail closed. Tracked files hidden by ignore rules also fail the public-surface check. Ordinary files are capped at 1 MB; explicitly approved reviewable assets are capped at 25 MB.

The automated check validates structure, hashes, and declared approval state. It cannot prove that a license claim or evidence identifier is truthful, so a human rights review remains required.

Registered SVG files must remain passive and self-contained. Script, event handlers, JavaScript URLs, embedded active elements, stylesheet imports, and non-fragment resource references are rejected even when the file has an approved rights entry.

Opaque images, audio, video, fonts, PDFs, office documents, archives, and model containers are rejected even when registered. Supporting one requires a reviewed, format-aware metadata and embedded-content inspection before the extension can be admitted.

Private authorization evidence should remain in a protected archive. The public manifest may reference that evidence only through a non-sensitive identifier.

## Excluded categories

Do not add commercial music, private photos, CVs, QR codes, customer screenshots, school or company marks, scraped platform media, unpublished research evidence, browser profiles, Git LFS pointers, opaque containers without format-aware inspection, or generated assets whose redistribution terms cannot be verified.
