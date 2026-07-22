# Security Policy

## Supported version

Security fixes target the latest commit on `main`.

## Report a vulnerability

Use GitHub's private vulnerability reporting for this repository. Do not place credentials, personal data, exploit payloads, or private infrastructure details in a public issue.

For ordinary bugs without sensitive content, use the public issue tracker.

## Research boundaries

Good-faith testing is welcome when it avoids denial of service, social engineering, destructive actions, credential access, private-data collection, and testing against accounts or production systems you do not own.

Reports are handled on a best-effort basis. Copyright or asset-rights concerns should also be reported privately so potentially sensitive evidence is not republished.

## Browser policy

Production responses set a restrictive baseline CSP and related browser headers. The static Next.js App Router output currently requires inline bootstrap scripts and component styles, so `script-src` and `style-src` permit `'unsafe-inline'`; production does not permit `'unsafe-eval'`.

The starter renders no untrusted HTML and accepts no user content. Revisit the policy and adopt request-scoped nonces before adding dynamic user input, authentication, or third-party scripts.
