import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".npm-cache",
  "node_modules",
  "playwright-report",
  "test-results",
  "coverage",
]);
const SENSITIVE_DIRECTORY_NAMES = new Set([
  "artifacts",
  "backup",
  "reports",
  "user-data",
]);
const FORBIDDEN_EXTENSIONS = new Set([
  ".aac",
  ".db",
  ".docx",
  ".jks",
  ".key",
  ".kdbx",
  ".mp3",
  ".ovpn",
  ".p12",
  ".pdf",
  ".pem",
  ".pfx",
  ".sqlite",
  ".wpress",
  ".zip",
]);
const FORBIDDEN_FILENAMES = new Set([
  ".netrc",
  ".npmrc",
  "id_ed25519",
  "id_rsa",
]);
const MAX_FILE_BYTES = 1_000_000;


const secretPatterns = [
  { label: "AWS access key", expression: /AKIA[0-9A-Z]{16}/g },
  { label: "GitHub token", expression: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  {
    label: "GitHub fine-grained token",
    expression: /github_pat_[A-Za-z0-9_]{20,}/g,
  },
  { label: "GitLab token", expression: /glpat-[A-Za-z0-9_-]{20,}/g },
  { label: "Google API key", expression: /AIza[0-9A-Za-z_-]{35}/g },
  { label: "OpenAI-style token", expression: /sk-[A-Za-z0-9_-]{20,}/g },
  { label: "Slack token", expression: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { label: "Stripe live key", expression: /[rs]k_live_[A-Za-z0-9]{16,}/g },
  {
    label: "private key block",
    expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    label: "Windows user path",
    expression: /[A-Za-z]:[\\/]+Users[\\/]/gi,
  },
  {
    label: "Unix user path",
    expression: /\/(?:Users|home)\/[^/\s]+(?:\/|$)/g,
  },
  {
    label: "email address",
    expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
];

async function walk(directory, relative = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const nextRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (!(relative === "" && ROOT_IGNORED_DIRECTORIES.has(entry.name))) {
        files.push(...(await walk(path.join(directory, entry.name), nextRelative)));
      }
      continue;
    }
    files.push(nextRelative);
  }

  return files;
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

export async function scanPublicSurface(root = ROOT) {
  const issues = [];
  const files = await walk(root);

  for (const relativePath of files) {
    const normalized = relativePath.replaceAll("\\", "/");
    const lowerPath = normalized.toLowerCase();
    const extension = path.extname(lowerPath);
    const basename = path.posix.basename(lowerPath);
    const segments = lowerPath.split("/");
    const filePath = path.join(root, relativePath);
    const fileStats = await lstat(filePath);
    if (fileStats.isSymbolicLink()) {
      issues.push(`${normalized}: symbolic links are not publishable`);
      continue;
    }

    if (lowerPath !== ".env.example" && basename.startsWith(".env")) {
      issues.push(`${normalized}: environment file is not publishable`);
    }
    if (
      lowerPath.includes("storagestate") ||
      segments.some((segment) => SENSITIVE_DIRECTORY_NAMES.has(segment))
    ) {
      issues.push(`${normalized}: forbidden private or generated path`);
    }
    if (
      FORBIDDEN_EXTENSIONS.has(extension) ||
      FORBIDDEN_FILENAMES.has(basename)
    ) {
      issues.push(`${normalized}: forbidden credential or binary file`);
    }
    if (fileStats.size > MAX_FILE_BYTES) {
      issues.push(`${normalized}: exceeds ${MAX_FILE_BYTES} bytes`);
    }

    if (fileStats.size > MAX_FILE_BYTES) continue;
    const contents = await readFile(filePath);
    if (contents.includes(0)) continue;
    const text = contents.toString("utf8");
    for (const pattern of secretPatterns) {
      pattern.expression.lastIndex = 0;
      const match = pattern.expression.exec(text);
      if (match) {
        issues.push(
          `${normalized}:${lineNumber(text, match.index)} contains ${pattern.label}`,
        );
      }
    }
  }

  return issues.sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const issues = await scanPublicSurface();
  if (issues.length > 0) {
    console.error("Public-surface check failed:\n" + issues.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Public-surface check passed.");
  }
}
