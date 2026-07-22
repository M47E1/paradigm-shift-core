import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify, TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
function gitExecFile(argumentsList, options = {}) {
  return execFileAsync("git", argumentsList, {
    ...options,
    env: {
      ...process.env,
      ...(options.env ?? {}),
      GIT_NO_REPLACE_OBJECTS: "1",
    },
  });
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_MANIFEST_FILENAME = "asset-rights.json";
const EXPECTED_PRE_PUSH_SHA256 =
  "cafb6272f2e31f622411eb8488413caeda9f8194e71a3e4f6d9939bbc8632606";
const SENSITIVE_DIRECTORY_NAMES = new Set([
  ".aws",
  ".azure",
  ".docker",
  ".gnupg",
  ".kube",
  ".ssh",
  "artifacts",
  "backup",
  "reports",
  "user-data",
]);
const FORBIDDEN_EXTENSIONS = new Set([
  ".db",
  ".jks",
  ".key",
  ".kdbx",
  ".ovpn",
  ".p12",
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
const ASSET_EXTENSIONS = new Set([
  ".aac",
  ".avif",
  ".bmp",
  ".docx",
  ".eot",
  ".fbx",
  ".flac",
  ".gif",
  ".glb",
  ".gltf",
  ".ico",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".m4v",
  ".mov",
  ".mp3",
  ".mp4",
  ".obj",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".stl",
  ".svg",
  ".ttf",
  ".usdz",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);
const TEXT_SOURCE_EXTENSIONS = new Set([
  ".bat",
  ".cjs",
  ".cmd",
  ".conf",
  ".css",
  ".csv",
  ".editorconfig",
  ".example",
  ".gitattributes",
  ".gitignore",
  ".gql",
  ".graphql",
  ".html",
  ".ini",
  ".js",
  ".json",
  ".jsx",
  ".lock",
  ".md",
  ".mdx",
  ".mjs",
  ".nvmrc",
  ".ps1",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const TEXT_SOURCE_FILENAMES = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".gitkeep",
  ".nvmrc",
  "license",
]);
const TEXT_SOURCE_PATHS = new Set([
  ".github/codeowners",
  ".githooks/pre-push",
]);
const REQUIRED_ASSET_FIELDS = [
  "path",
  "sha256",
  "owner",
  "source",
  "license",
  "redistribution",
  "attribution",
  "modifications",
  "evidenceId",
  "status",
];
const MAX_ORDINARY_FILE_BYTES = 1_000_000;
const MAX_APPROVED_ASSET_BYTES = 25_000_000;
const DEFAULT_HISTORY_COMMIT_LIMIT = 100;
const MAX_HISTORY_COMMIT_LIMIT = 500;
const MAX_HISTORY_TREE_FILES = 2_000;
const MAX_HISTORY_TREE_BYTES = 50_000_000;

const secretPatterns = [
  {
    label: "AWS access key",
    expression: /(?:AKIA|ASIA)[0-9A-Z]{16}/g,
  },
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
    expression: /-----BEGIN (?:[A-Z0-9][A-Z0-9 ]* )?PRIVATE KEY(?: BLOCK)?-----/g,
  },
  {
    label: "JSON Web Token",
    expression: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    label: "credential-bearing URL",
    expression:
      /\b(?:https?|ftp|sftp|ssh|postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis(?:s)?|amqp(?:s)?|mssql):\/\/[^/\s:@]+:[^@\s/]+@/gi,
  },
  {
    label: "generic secret assignment",
    expression:
      /(?<![A-Za-z0-9_-])["']?(?:aws[_-]?(?:access[_-]?key[_-]?id|secret[_-]?access[_-]?key|session[_-]?token)|(?:[a-z0-9][a-z0-9_-]{0,63}[_-])?(?:api[_-]?key|access[_-]?token|auth(?:[_-]?token)?|password|passwd|secret|token))["']?\s*[:=]\s*(?:"(?:\\.|[^"\\\r\n]){12,}"|'(?:\\.|[^'\\\r\n]){12,}'|[A-Za-z0-9_./+=:@$%!-]{16,})/gi,
  },
  {
    label: "embedded data URI",
    expression: new RegExp(
      ["\\bdata", ":[^,\\s\"'<>]*,[^\\s\"'<>)]*"].join(""),
      "gi",
    ),
  },
  {
    label: "Git LFS pointer",
    expression: new RegExp(
      ["version https://git-lfs.github.com/spec/", "v1"].join(""),
      "g",
    ),
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

function normalizeRelativePath(relativePath) {
  return relativePath.replace(/^\.\/+/, "");
}

function samePath(left, right) {
  const leftPath = path.resolve(left);
  const rightPath = path.resolve(right);
  return process.platform === "win32"
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath;
}

function splitNull(value) {
  return value
    .split("\0")
    .filter(Boolean)
    .map(normalizeRelativePath);
}

function decodeGitPathOutput(value) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    const error = new Error("Git path output is not valid UTF-8");
    error.code = "GIT_PATH_ENCODING";
    throw error;
  }
}

function parseGitIndexModes(value) {
  const modes = new Map();
  for (const record of value.split("\0").filter(Boolean)) {
    const separator = record.indexOf("\t");
    if (separator === -1) continue;
    const mode = record.slice(0, separator).split(" ", 1)[0];
    modes.set(normalizeRelativePath(record.slice(separator + 1)), mode);
  }
  return modes;
}

async function gitInventory(root, configuredSafetyArguments = null) {
  const safetyArguments = configuredSafetyArguments ?? [
    "-c",
    "core.autocrlf=false",
    "-c",
    "core.eol=lf",
    "-c",
    "core.fsmonitor=false",
    ...(await disabledCheckoutFilterArguments(root)),
  ];
  const { stdout: topLevel } = await gitExecFile(
    ["-C", root, ...safetyArguments, "rev-parse", "--show-toplevel"],
    { encoding: "utf8", windowsHide: true },
  );
  if (!samePath(topLevel.trim(), root)) {
    const error = new Error("root does not match the Git worktree");
    error.code = "GIT_TOPLEVEL_MISMATCH";
    throw error;
  }

  const [
    { stdout: filesOutput },
    { stdout: ignoredTrackedOutput },
    { stdout: unstagedOutput },
    { stdout: stagedEntriesOutput },
  ] = await Promise.all([
    gitExecFile(
      [
        "-C",
        root,
        ...safetyArguments,
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
      ],
      { encoding: "buffer", maxBuffer: 10_000_000, windowsHide: true },
    ),
    gitExecFile(
      [
        "-C",
        root,
        ...safetyArguments,
        "ls-files",
        "-z",
        "--cached",
        "--ignored",
        "--exclude-standard",
      ],
      { encoding: "buffer", maxBuffer: 10_000_000, windowsHide: true },
    ),
    gitExecFile(
      [
        "-C",
        root,
        ...safetyArguments,
        "diff",
        "--no-ext-diff",
        "--name-only",
        "-z",
        "--",
      ],
      { encoding: "buffer", maxBuffer: 10_000_000, windowsHide: true },
    ),
    gitExecFile(
      ["-C", root, ...safetyArguments, "ls-files", "-z", "--stage"],
      { encoding: "buffer", maxBuffer: 20_000_000, windowsHide: true },
    ),
  ]);

  const files = decodeGitPathOutput(filesOutput);
  const ignoredTracked = decodeGitPathOutput(ignoredTrackedOutput);
  const unstaged = decodeGitPathOutput(unstagedOutput);
  const stagedEntries = decodeGitPathOutput(stagedEntriesOutput);
  const gitModes = parseGitIndexModes(stagedEntries);
  const publishedPaths = splitNull(files);
  const portablePaths = new Set();
  const inventoryIssues = [];
  for (const publishedPath of publishedPaths) {
    const portableKey = portablePathKey(publishedPath);
    if (!portableKey) {
      inventoryIssues.push(
        "Git inventory contains a path unsafe on common filesystems",
      );
      break;
    }
    if (portablePaths.has(portableKey)) {
      inventoryIssues.push(
        "Git inventory contains paths that collide on common filesystems",
      );
      break;
    }
    portablePaths.add(portableKey);
  }
  return {
    files: [...new Set(publishedPaths)].sort(),
    ignoredTracked: new Set(splitNull(ignoredTracked)),
    indexWorktreeDivergence: new Set(splitNull(unstaged)),
    gitModes,
    gitSymlinks: new Set(
      [...gitModes].filter(([, mode]) => mode === "120000").map(([file]) => file),
    ),
    inventoryIssues,
  };
}

async function walk(directory, relative = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const nextRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (!(relative === "" && entry.name === ".git")) {
        files.push(...(await walk(path.join(directory, entry.name), nextRelative)));
      }
      continue;
    }
    files.push(nextRelative);
  }

  return files;
}

async function inventory(root, gitConfigArguments = null) {
  let hasGitMarker = false;
  try {
    await lstat(path.join(root, ".git"));
    hasGitMarker = true;
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") {
      throw error;
    }
  }

  if (hasGitMarker) {
    try {
      return await gitInventory(root, gitConfigArguments);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "UNKNOWN";
      return {
        files: [],
        ignoredTracked: new Set(),
        indexWorktreeDivergence: new Set(),
        gitModes: null,
        gitSymlinks: new Set(),
        inventoryIssues: [`Git inventory unavailable (${code})`],
      };
    }
  }

  return {
    files: await walk(root),
    ignoredTracked: new Set(),
    indexWorktreeDivergence: new Set(),
    gitModes: null,
    gitSymlinks: new Set(),
    inventoryIssues: [],
  };
}

function isSafeManifestPath(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    path.posix.isAbsolute(value)
  ) {
    return false;
  }
  const normalized = path.posix.normalize(value);
  return (
    normalized === value &&
    normalized !== "." &&
    !normalized.startsWith("../") &&
    !/^[A-Za-z]:/.test(value)
  );
}

async function readAssetManifest(root, issues, files, gitSymlinks) {
  const manifestPath = path.join(root, ASSET_MANIFEST_FILENAME);
  if (!files.includes(ASSET_MANIFEST_FILENAME)) {
    issues.push(`${ASSET_MANIFEST_FILENAME}: asset manifest is missing`);
    return new Map();
  }
  if (gitSymlinks.has(ASSET_MANIFEST_FILENAME)) {
    issues.push(`${ASSET_MANIFEST_FILENAME}: asset manifest must be a regular file`);
    return new Map();
  }

  let manifestStats;
  try {
    manifestStats = await lstat(manifestPath);
  } catch {
    issues.push(`${ASSET_MANIFEST_FILENAME}: asset manifest is missing`);
    return new Map();
  }
  if (manifestStats.isSymbolicLink() || !manifestStats.isFile()) {
    issues.push(`${ASSET_MANIFEST_FILENAME}: asset manifest must be a regular file`);
    return new Map();
  }
  if (manifestStats.size > MAX_ORDINARY_FILE_BYTES) {
    issues.push(
      `${ASSET_MANIFEST_FILENAME}: asset manifest exceeds ${MAX_ORDINARY_FILE_BYTES} bytes`,
    );
    return new Map();
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    issues.push(`${ASSET_MANIFEST_FILENAME}: asset manifest is missing or invalid JSON`);
    return new Map();
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.assets)
  ) {
    issues.push(`${ASSET_MANIFEST_FILENAME}: expected schemaVersion 1 and an assets array`);
    return new Map();
  }

  const assets = new Map();
  for (const [index, entry] of parsed.assets.entries()) {
    const location = `${ASSET_MANIFEST_FILENAME}:assets[${index}]`;
    if (!entry || typeof entry !== "object") {
      issues.push(`${location}: asset entry must be an object`);
      continue;
    }

    for (const field of REQUIRED_ASSET_FIELDS) {
      if (typeof entry[field] !== "string" || entry[field].trim() === "") {
        issues.push(`${location}: ${field} must be a non-empty string`);
      }
    }

    if (!isSafeManifestPath(entry.path)) {
      issues.push(`${location}: path must be a normalized repository-relative POSIX path`);
      continue;
    }
    if (assets.has(entry.path)) {
      issues.push(`${location}: duplicate asset path ${issuePath(entry.path)}`);
      continue;
    }
    if (!/^[0-9a-f]{64}$/i.test(entry.sha256 ?? "")) {
      issues.push(`${location}: sha256 must contain 64 hexadecimal characters`);
    }
    if ((entry.status ?? "").toUpperCase() !== "APPROVED") {
      issues.push(`${location}: status must be APPROVED`);
    }
    if ((entry.redistribution ?? "").toUpperCase() !== "ALLOWED") {
      issues.push(`${location}: redistribution must be Allowed`);
    }
    assets.set(entry.path, entry);
  }

  return assets;
}

function hasBinaryControls(text) {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text);
}

function looksLikeUtf16(contents, zeroByteIndex) {
  if (contents.length < 4 || contents.length % 2 !== 0) return false;
  const pairs = Math.min(contents.length / 2, 512);
  let expectedZeros = 0;
  let oppositeZeros = 0;
  for (let pair = 0; pair < pairs; pair += 1) {
    if (contents[pair * 2 + zeroByteIndex] === 0) expectedZeros += 1;
    if (contents[pair * 2 + (1 - zeroByteIndex)] === 0) oppositeZeros += 1;
  }
  return expectedZeros / pairs >= 0.3 && oppositeZeros / pairs <= 0.1;
}

function decodeText(contents, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(contents);
  } catch {
    return null;
  }
}

function decodePublicText(contents) {
  let encoding = "utf-8";
  let input = contents;
  if (contents.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    input = contents.subarray(3);
  } else if (contents.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    encoding = "utf-16le";
    input = contents.subarray(2);
  } else if (contents.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) {
    encoding = "utf-16be";
    input = contents.subarray(2);
  } else if (looksLikeUtf16(contents, 1)) {
    encoding = "utf-16le";
  } else if (looksLikeUtf16(contents, 0)) {
    encoding = "utf-16be";
  }

  const primaryText = decodeText(input, encoding);
  const binary = primaryText === null || hasBinaryControls(primaryText);
  const texts = new Set();
  if (primaryText !== null) texts.add(primaryText);
  if (binary) texts.add(contents.toString("latin1"));

  for (const offset of [0, 1]) {
    const candidate = contents.subarray(offset);
    if (candidate.length < 4 || candidate.length % 2 !== 0) continue;
    for (const alternateEncoding of ["utf-16le", "utf-16be"]) {
      const alternateText = decodeText(candidate, alternateEncoding);
      if (alternateText !== null) texts.add(alternateText);
    }
  }

  return { binary, texts: [...texts] };
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function scanSecrets(
  normalized,
  texts,
  issues,
  { ignoredLabels = new Set(), includedLabels = null } = {},
) {
  for (const text of texts) {
    let foundDataUri = false;
    for (const pattern of secretPatterns) {
      if (ignoredLabels.has(pattern.label)) continue;
      if (includedLabels && !includedLabels.has(pattern.label)) continue;
      pattern.expression.lastIndex = 0;
      const match = pattern.expression.exec(text);
      if (match) {
        if (pattern.label === "embedded data URI") foundDataUri = true;
        issues.push(
          `${normalized}:${lineNumber(text, match.index)} contains ${pattern.label}`,
        );
      }
    }
    const scansDataUri =
      !ignoredLabels.has("embedded data URI") &&
      (!includedLabels || includedLabels.has("embedded data URI"));
    if (!foundDataUri && scansDataUri) {
      const normalizedUrlText = decodeUrlCharacterReferences(text).replace(
        /[\u0000-\u001f\u007f-\u009f]/g,
        "",
      );
      const dataUriPattern = secretPatterns.find(
        (pattern) => pattern.label === "embedded data URI",
      );
      if (dataUriPattern) {
        dataUriPattern.expression.lastIndex = 0;
        if (dataUriPattern.expression.test(normalizedUrlText)) {
          issues.push(`${normalized}: contains embedded data URI`);
        }
      }
    }
  }
}

function secretLabels(texts) {
  const labels = new Set();
  for (const text of texts) {
    for (const pattern of secretPatterns) {
      pattern.expression.lastIndex = 0;
      if (pattern.expression.test(text)) labels.add(pattern.label);
    }
  }
  return labels;
}

function issuePath(value) {
  const pathValue = String(value);
  return secretLabels([pathValue]).size > 0 ||
    !isSafeManifestPath(normalizeRelativePath(pathValue))
    ? "[redacted publishable path]"
    : pathValue;
}

function decodeNumericCharacterReferences(text) {
  return text.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (match, hex, decimal) => {
    const codePoint = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
    if (!Number.isFinite(codePoint) || codePoint > 0x10ffff) return match;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  });
}

function decodeUrlCharacterReferences(text) {
  return decodeNumericCharacterReferences(text)
    .replace(/&colon;?/gi, ":")
    .replace(/&(?:Tab|NewLine);?/gi, "\n");
}

function scanSvg(normalized, decoded, issues) {
  if (decoded.binary) {
    issues.push(`${normalized}: SVG could not be decoded as safe text`);
  }
  const text = decodeUrlCharacterReferences(decoded.texts.join("\n"));
  if (/<!DOCTYPE\b|<!ENTITY\b|\bxml:base\s*=/i.test(text)) {
    issues.push(`${normalized}: SVG contains XML indirection or a base override`);
  }
  if (
    /<(?:[A-Za-z][\w.-]*:)?(?:style|animate|animateMotion|animateTransform|set|discard)\b/i.test(
      text,
    ) ||
    /\sstyle\s*=/i.test(text)
  ) {
    issues.push(`${normalized}: SVG contains dynamic styling or animation`);
  }
  if (/<(?:[A-Za-z][\w.-]*:)?script\b/i.test(text)) {
    issues.push(`${normalized}: SVG contains a script element`);
  }
  if (/\s(?:[A-Za-z][\w.-]*:)?on[A-Za-z][\w:.-]*\s*=/i.test(text)) {
    issues.push(`${normalized}: SVG contains an event-handler attribute`);
  }
  const urlNormalizedText = text.replace(/[\s\u0000-\u001f\u007f-\u009f]/g, "");
  if (/javascript\s*:/i.test(urlNormalizedText)) {
    issues.push(`${normalized}: SVG contains a javascript URL`);
  }
  if (
    /<(?:[A-Za-z][\w.-]*:)?(?:foreignObject|iframe|object|embed)\b/i.test(text)
  ) {
    issues.push(`${normalized}: SVG contains active embedded content`);
  }
  let hasExternalReference = /@import\b|<\?xml-stylesheet\b/i.test(text);
  for (const match of text.matchAll(
    /(?:^|\s)(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  )) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!value.startsWith("#")) hasExternalReference = true;
  }
  for (const match of text.matchAll(
    /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,
  )) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!value.startsWith("#")) hasExternalReference = true;
  }
  if (hasExternalReference) {
    issues.push(`${normalized}: SVG contains an external resource reference`);
  }
}

function isKnownTextSource(normalized, extension, basename) {
  return (
    TEXT_SOURCE_EXTENSIONS.has(extension) ||
    TEXT_SOURCE_FILENAMES.has(basename) ||
    TEXT_SOURCE_PATHS.has(normalized)
  );
}

export async function scanPublicSurface(
  root = ROOT,
  { gitConfigArguments = null } = {},
) {
  const resolvedRoot = path.resolve(root);
  const issues = [];
  const {
    files,
    ignoredTracked,
    indexWorktreeDivergence,
    gitModes,
    gitSymlinks,
    inventoryIssues,
  } = await inventory(resolvedRoot, gitConfigArguments);
  issues.push(...inventoryIssues);
  if (inventoryIssues.length > 0) {
    return [...new Set(issues)].sort();
  }
  const assets = await readAssetManifest(
    resolvedRoot,
    issues,
    files,
    gitSymlinks,
  );
  if (gitModes && gitModes.get(".githooks/pre-push") !== "100755") {
    issues.push(".githooks/pre-push: tracked hook must use Git mode 100755");
  }
  const seenFiles = new Set();

  for (const relativePath of files) {
    const normalized = normalizeRelativePath(relativePath);
    const pathLabels = secretLabels([relativePath]);
    const safePath = isSafeManifestPath(normalized);
    const displayPath =
      pathLabels.size > 0 || !safePath
        ? "[redacted publishable path]"
        : normalized;
    for (const label of pathLabels) {
      issues.push(`publishable path contains ${label}`);
    }
    if (!safePath) {
      issues.push(
        `${displayPath}: path is not a safe repository-relative path`,
      );
      continue;
    }
    const lowerPath = normalized.toLowerCase();
    const extension = path.extname(lowerPath);
    const basename = path.posix.basename(lowerPath);
    const segments = lowerPath.split("/");
    const filePath = path.join(resolvedRoot, ...normalized.split("/"));
    seenFiles.add(normalized);

    if (ignoredTracked.has(normalized)) {
      issues.push(`${displayPath}: tracked file is ignored by repository rules`);
    }
    if (indexWorktreeDivergence.has(normalized)) {
      issues.push(
        `${displayPath}: tracked Git bytes differ from the scanned worktree file`,
      );
    }
    if (gitSymlinks.has(normalized)) {
      issues.push(`${displayPath}: Git mode 120000 symlinks are not publishable`);
      continue;
    }

    let fileStats;
    try {
      fileStats = await lstat(filePath);
    } catch {
      issues.push(`${displayPath}: publishable file is missing from the worktree`);
      continue;
    }
    if (fileStats.isSymbolicLink()) {
      issues.push(`${displayPath}: symbolic links are not publishable`);
      continue;
    }
    if (!fileStats.isFile()) {
      issues.push(`${displayPath}: publishable path is not a regular file`);
      continue;
    }

    if (lowerPath !== ".env.example" && basename.startsWith(".env")) {
      issues.push(`${displayPath}: environment file is not publishable`);
    }
    if (
      lowerPath.includes("storagestate") ||
      segments.some((segment) => SENSITIVE_DIRECTORY_NAMES.has(segment))
    ) {
      issues.push(`${displayPath}: forbidden private or generated path`);
    }
    if (
      FORBIDDEN_EXTENSIONS.has(extension) ||
      FORBIDDEN_FILENAMES.has(basename)
    ) {
      issues.push(`${displayPath}: forbidden credential or archive file`);
    }
    const assetEntry = assets.get(normalized);
    const fileLimit = assetEntry
      ? MAX_APPROVED_ASSET_BYTES
      : MAX_ORDINARY_FILE_BYTES;
    if (fileStats.size > fileLimit) {
      const limitLabel = assetEntry ? "approved asset" : "ordinary file";
      issues.push(`${displayPath}: exceeds ${limitLabel} limit of ${fileLimit} bytes`);
      continue;
    }

    const contents = await readFile(filePath);
    const decoded = decodePublicText(contents);
    scanSecrets(displayPath, decoded.texts, issues);

    if (normalized === ".githooks/pre-push") {
      const hookHash = createHash("sha256").update(contents).digest("hex");
      if (hookHash !== EXPECTED_PRE_PUSH_SHA256) {
        issues.push(
          `${displayPath}: pre-push hook contents do not match the trusted launcher`,
        );
      }
    }

    if (
      basename === ".gitattributes" &&
      decoded.texts.some((text) =>
        /\b(?:working-tree-encoding|ident)\b/i.test(text),
      )
    ) {
      issues.push(
        `${displayPath}: transforming attributes can hide Git blob bytes from review`,
      );
    }

    if (assetEntry) {
      const actualHash = createHash("sha256").update(contents).digest("hex");
      if (actualHash.toLowerCase() !== (assetEntry.sha256 ?? "").toLowerCase()) {
        issues.push(`${displayPath}: SHA-256 does not match asset manifest`);
      }
    }

    if (extension === ".svg") {
      scanSvg(displayPath, decoded, issues);
    }

    if (
      assetEntry &&
      extension !== ".svg" &&
      (decoded.binary || !isKnownTextSource(lowerPath, extension, basename))
    ) {
      issues.push(
        `${displayPath}: opaque asset format is not publishable without format-aware privacy checks`,
      );
    }

    if (
      (ASSET_EXTENSIONS.has(extension) ||
        decoded.binary ||
        !isKnownTextSource(lowerPath, extension, basename)) &&
      !assetEntry
    ) {
      issues.push(`${displayPath}: binary, media, or unknown file is not registered`);
    }
  }

  for (const manifestPath of assets.keys()) {
    if (!seenFiles.has(manifestPath)) {
      issues.push(
        `${issuePath(manifestPath)}: asset manifest entry has no publishable file`,
      );
    }
  }

  return [...new Set(issues)].sort();
}

function errorCode(error) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "UNKNOWN";
}

async function resolveCommit(root, revision) {
  if (typeof revision !== "string" || revision.trim() === "") {
    throw new Error("revision must be a non-empty string");
  }
  const { stdout } = await gitExecFile(
    [
      "-C",
      root,
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${revision}^{commit}`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  return stdout.trim();
}

async function resolveObject(root, revision) {
  if (typeof revision !== "string" || revision.trim() === "") {
    throw new Error("revision must be a non-empty string");
  }
  const { stdout } = await gitExecFile(
    [
      "-C",
      root,
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${revision}^{object}`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  return stdout.trim();
}

function splitGitObject(rawObject, label, issues) {
  const separator = Buffer.from("\n\n");
  const headerEnd = rawObject.indexOf(separator);
  if (headerEnd === -1) {
    issues.push(`${label}: Git object metadata is malformed`);
    return { header: rawObject, message: Buffer.alloc(0) };
  }
  return {
    header: rawObject.subarray(0, headerEnd),
    message: rawObject.subarray(headerEnd + separator.length),
  };
}

function scanGitObjectMetadata(label, rawObject, issues) {
  const { header, message } = splitGitObject(rawObject, label, issues);
  const decodedHeader = decodePublicText(header);
  const decodedMessage = decodePublicText(message);
  if (decodedHeader.binary || decodedMessage.binary) {
    issues.push(`${label}: metadata is not valid supported text`);
  }
  const emailLabel = new Set(["email address"]);
  scanSecrets(label, decodedHeader.texts, issues, {
    ignoredLabels: emailLabel,
  });
  scanSecrets(label, decodedMessage.texts, issues, {
    ignoredLabels: emailLabel,
  });
  const messagesWithoutGitHubAddresses = decodedMessage.texts.map((text) =>
    text
      .replace(
        /[A-Z0-9._%+\-\[\]]+@users\.noreply\.github\.com/gi,
        "[github-public-email]",
      )
      .replace(/\b(?:noreply|support)@github\.com\b/gi, "[github-public-email]"),
  );
  scanSecrets(label, messagesWithoutGitHubAddresses, issues, {
    includedLabels: emailLabel,
  });
}

async function scanCommitMetadata(root, commit, issues) {
  const { stdout } = await gitExecFile(
    ["-C", root, "cat-file", "commit", commit],
    {
      encoding: "buffer",
      maxBuffer: MAX_ORDINARY_FILE_BYTES,
      windowsHide: true,
    },
  );
  scanGitObjectMetadata(
    `history ${commit.slice(0, 12)} commit metadata`,
    stdout,
    issues,
  );
}

async function scanHeadTagMetadata(root, revision, issues) {
  let object = await resolveObject(root, revision);
  const seen = new Set();
  const maxTagDepth = 32;

  for (let depth = 0; depth < maxTagDepth; depth += 1) {
    if (seen.has(object)) {
      issues.push("history tag chain contains a cycle");
      return;
    }
    seen.add(object);
    const { stdout: objectType } = await gitExecFile(
      ["-C", root, "cat-file", "-t", object],
      { encoding: "utf8", windowsHide: true },
    );
    if (objectType.trim() !== "tag") return;

    const { stdout } = await gitExecFile(
      ["-C", root, "cat-file", "tag", object],
      {
        encoding: "buffer",
        maxBuffer: MAX_ORDINARY_FILE_BYTES,
        windowsHide: true,
      },
    );
    scanGitObjectMetadata(
      `history tag ${object.slice(0, 12)} metadata`,
      stdout,
      issues,
    );
    const { header } = splitGitObject(
      stdout,
      `history tag ${object.slice(0, 12)} metadata`,
      issues,
    );
    const headerText = header.toString("latin1");
    const target = /^object ([0-9a-f]{40,64})$/m.exec(headerText)?.[1];
    const targetType = /^type ([^\r\n]+)$/m.exec(headerText)?.[1];
    if (targetType !== "tag" || !target) return;
    object = target;
  }

  issues.push(`history tag chain exceeds the configured limit of ${maxTagDepth}`);
}

async function disabledCheckoutFilterArguments(root) {
  const filterNames = new Set(["lfs"]);
  try {
    const { stdout } = await gitExecFile(
      [
        "-C",
        root,
        "config",
        "--name-only",
        "--get-regexp",
        "^filter\\..*\\.(clean|smudge|process|required)$",
      ],
      { encoding: "utf8", maxBuffer: 1_000_000, windowsHide: true },
    );
    for (const key of stdout.split(/\r?\n/).filter(Boolean)) {
      const match = /^filter\.(.+)\.(?:clean|smudge|process|required)$/i.exec(key);
      if (match) filterNames.add(match[1]);
    }
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== 1) throw error;
  }

  const argumentsList = [];
  for (const filterName of filterNames) {
    argumentsList.push(
      "-c",
      `filter.${filterName}.clean=`,
      "-c",
      `filter.${filterName}.smudge=`,
      "-c",
      `filter.${filterName}.process=`,
      "-c",
      `filter.${filterName}.required=false`,
    );
  }
  return argumentsList;
}

async function gitRewriteOverrideIssues(root) {
  const issues = [];
  const { stdout: replacementRefs } = await gitExecFile(
    [
      "-C",
      root,
      "for-each-ref",
      "--format=%(refname)",
      "refs/replace/",
    ],
    { encoding: "buffer", maxBuffer: 1_000_000, windowsHide: true },
  );
  if (replacementRefs.length > 0) {
    issues.push("history range: Git replacement refs are not allowed");
  }

  const { stdout: commonDirectoryOutput } = await gitExecFile(
    [
      "-C",
      root,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ],
    { encoding: "utf8", maxBuffer: 1_000_000, windowsHide: true },
  );
  const commonDirectory = path.resolve(root, commonDirectoryOutput.trim());
  try {
    const graftStats = await lstat(path.join(commonDirectory, "info", "grafts"));
    if (graftStats.size > 0) {
      issues.push("history range: Git grafts are not allowed");
    }
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") {
      throw error;
    }
  }
  return issues;
}

async function preflightCommitTree(root, commit) {
  const { stdout } = await gitExecFile(
    [
      "-C",
      root,
      "ls-tree",
      "--full-tree",
      "-r",
      "-l",
      "-z",
      commit,
      "--",
    ],
    { encoding: "buffer", maxBuffer: 20_000_000, windowsHide: true },
  );
  const records = decodeGitPathOutput(stdout).split("\0").filter(Boolean);
  let totalBytes = 0;
  const issues = [];
  const entries = [];
  const portablePaths = new Set();

  if (records.length > MAX_HISTORY_TREE_FILES) {
    issues.push(
      `tree contains more than ${MAX_HISTORY_TREE_FILES} publishable entries`,
    );
  }
  for (const record of records) {
    const tab = record.indexOf("\t");
    const header = tab === -1 ? "" : record.slice(0, tab);
    const relativePath = tab === -1 ? "" : record.slice(tab + 1);
    const fields = header.split(/ +/);
    if (fields.length !== 4) {
      issues.push("tree inventory contains a malformed entry");
      break;
    }
    const portableKey = portablePathKey(relativePath);
    if (!portableKey) {
      issues.push("tree contains a path that is unsafe on common filesystems");
      break;
    }
    if (portablePaths.has(portableKey)) {
      issues.push("tree contains paths that collide on common filesystems");
      break;
    }
    portablePaths.add(portableKey);
    const [mode, type, objectId, sizeText] = fields;
    if (
      !/^[0-7]{6}$/.test(mode) ||
      !/^[0-9a-f]{40,64}$/.test(objectId) ||
      !["blob", "commit"].includes(type)
    ) {
      issues.push("tree inventory contains an unsupported entry");
      break;
    }
    if (type === "commit" || mode === "160000") {
      issues.push("Git submodules are not publishable");
      break;
    }
    if (!/^\d+$/.test(sizeText)) {
      issues.push("tree inventory contains an invalid blob size");
      break;
    }
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size)) {
      issues.push("tree inventory contains an invalid blob size");
      break;
    }
    totalBytes += size;
    if (size > MAX_APPROVED_ASSET_BYTES) {
      issues.push(
        `tree contains a blob larger than ${MAX_APPROVED_ASSET_BYTES} bytes`,
      );
      break;
    }
    if (totalBytes > MAX_HISTORY_TREE_BYTES) {
      issues.push(
        `tree exceeds the declared byte budget of ${MAX_HISTORY_TREE_BYTES}`,
      );
      break;
    }
    entries.push({ mode, objectId, relativePath, size, type });
  }
  return { entries, issues };
}

function portablePathKey(relativePath) {
  if (!isSafeManifestPath(relativePath)) return null;
  const reservedNames = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  const portableSegments = [];
  for (const segment of relativePath.normalize("NFC").split("/")) {
    if (
      /[<>:"\\|?*\u0000-\u001f]/.test(segment) ||
      /[ .]$/.test(segment) ||
      reservedNames.test(segment)
    ) {
      return null;
    }
    portableSegments.push(segment.toLowerCase());
  }
  return portableSegments.join("/");
}

async function repositoryObjectFormat(root) {
  const { stdout } = await gitExecFile(
    ["-C", root, "rev-parse", "--show-object-format"],
    { encoding: "utf8", windowsHide: true },
  );
  const objectFormat = stdout.trim();
  if (!["sha1", "sha256"].includes(objectFormat)) {
    const error = new Error("unsupported Git object format");
    error.code = "GIT_OBJECT_FORMAT";
    throw error;
  }
  return objectFormat;
}

async function verifyCommitWorktreeBytes(
  worktreePath,
  entries,
  objectFormat,
) {
  const issues = [];
  for (const entry of entries) {
    if (entry.type !== "blob" || entry.mode === "120000") continue;
    const filePath = path.join(
      worktreePath,
      ...entry.relativePath.split("/"),
    );
    const contents = await readFile(filePath);
    const actualObjectId = createHash(objectFormat)
      .update(`blob ${contents.length}\0`)
      .update(contents)
      .digest("hex");
    if (actualObjectId !== entry.objectId) {
      issues.push(
        `${issuePath(entry.relativePath)}: checkout bytes differ from the stored Git blob`,
      );
    }
  }
  return issues;
}

async function scanCommitWorktree(root, commit, entries, objectFormat) {
  const temporaryParent = await mkdtemp(
    path.join(tmpdir(), "paradigm-shift-history-"),
  );
  const worktreePath = path.join(temporaryParent, "tree");
  const trustedHooksPath = path.join(temporaryParent, "empty-hooks");
  let worktreeAdded = false;
  let safetyArguments = [];

  try {
    await mkdir(trustedHooksPath);
    const filterArguments = await disabledCheckoutFilterArguments(root);
    safetyArguments = [
      "-c",
      `core.hooksPath=${trustedHooksPath.replaceAll("\\", "/")}`,
      "-c",
      "core.autocrlf=false",
      "-c",
      "core.eol=lf",
      "-c",
      "core.fsmonitor=false",
      ...filterArguments,
    ];
    await gitExecFile(
      [
        "-C",
        root,
        ...safetyArguments,
        "worktree",
        "add",
        "--detach",
        "--force",
        worktreePath,
        commit,
      ],
      { encoding: "utf8", maxBuffer: 10_000_000, windowsHide: true },
    );
    worktreeAdded = true;
    const identityIssues = await verifyCommitWorktreeBytes(
      worktreePath,
      entries,
      objectFormat,
    );
    const surfaceIssues = await scanPublicSurface(worktreePath, {
      gitConfigArguments: safetyArguments,
    });
    return [...identityIssues, ...surfaceIssues];
  } finally {
    try {
      if (worktreeAdded) {
        await gitExecFile(
          [
            "-C",
            root,
            ...safetyArguments,
            "worktree",
            "remove",
            "--force",
            worktreePath,
          ],
          { encoding: "utf8", maxBuffer: 10_000_000, windowsHide: true },
        );
      }
    } finally {
      await rm(temporaryParent, { recursive: true, force: true });
    }
  }
}

export async function scanGitHistoryRange({
  root = ROOT,
  base,
  head = "HEAD",
  maxCommits = DEFAULT_HISTORY_COMMIT_LIMIT,
  refName,
  refNames = [],
} = {}) {
  const resolvedRoot = path.resolve(root);
  if (
    !Number.isInteger(maxCommits) ||
    maxCommits < 1 ||
    maxCommits > MAX_HISTORY_COMMIT_LIMIT
  ) {
    return [
      `history range: maxCommits must be between 1 and ${MAX_HISTORY_COMMIT_LIMIT}`,
    ];
  }

  try {
    const rewriteOverrideIssues =
      await gitRewriteOverrideIssues(resolvedRoot);
    if (rewriteOverrideIssues.length > 0) {
      return rewriteOverrideIssues;
    }
    const headCommit = await resolveCommit(resolvedRoot, head);
    const objectFormat = await repositoryObjectFormat(resolvedRoot);
    const baseCommit =
      base === undefined ? null : await resolveCommit(resolvedRoot, base);
    const issues = [];
    const providedRefNames = [];
    if (refName !== undefined) providedRefNames.push(refName);
    if (Array.isArray(refNames)) {
      providedRefNames.push(...refNames);
    } else {
      issues.push("history ref names must be an array");
    }
    for (const providedRefName of new Set(providedRefNames)) {
      if (
        typeof providedRefName !== "string" ||
        !/^refs\/(?:heads|tags)\/[^\u0000-\u001f\u007f]+$/.test(providedRefName)
      ) {
        issues.push("history ref name is not an allowed branch or tag reference");
      }
      for (const label of secretLabels([String(providedRefName)])) {
        issues.push(`history ref name contains ${label}`);
      }
    }
    await scanHeadTagMetadata(resolvedRoot, head, issues);
    const { stdout } = await gitExecFile(
      [
        "-C",
        resolvedRoot,
        "rev-list",
        "--reverse",
        "--topo-order",
        `--max-count=${maxCommits + 1}`,
        ...(baseCommit ? [`${baseCommit}..${headCommit}`] : [headCommit]),
        "--",
      ],
      { encoding: "utf8", maxBuffer: 10_000_000, windowsHide: true },
    );
    const commits = stdout.split(/\r?\n/).filter(Boolean);
    if (commits.length > maxCommits) {
      return [
        `history range: exceeds the configured limit of ${maxCommits} commits`,
      ];
    }

    for (const commit of commits) {
      try {
        await scanCommitMetadata(resolvedRoot, commit, issues);
        const { entries, issues: treeIssues } = await preflightCommitTree(
          resolvedRoot,
          commit,
        );
        if (treeIssues.length > 0) {
          for (const issue of treeIssues) {
            issues.push(`history ${commit.slice(0, 12)}: ${issue}`);
          }
          break;
        }
        const commitIssues = await scanCommitWorktree(
          resolvedRoot,
          commit,
          entries,
          objectFormat,
        );
        for (const issue of commitIssues) {
          issues.push(`history ${commit.slice(0, 12)}: ${issue}`);
        }
      } catch (error) {
        issues.push(
          `history ${commit.slice(0, 12)}: commit scan failed (${errorCode(error)})`,
        );
        break;
      }
    }
    return [...new Set(issues)].sort();
  } catch (error) {
    return [`history range: Git traversal failed (${errorCode(error)})`];
  }
}

function parseHistoryCli(argumentsList) {
  if (argumentsList.length === 0) return null;
  const [mode, target, ...optionArguments] = argumentsList;
  if (!["--git-all", "--git-range"].includes(mode) || !target) {
    throw new Error(
      "usage: check-public-surface.mjs [--git-range <base>..<head> | --git-all <head>] [--max-commits <count>] [--ref-name <ref>]",
    );
  }

  let base;
  let head = target;
  if (mode === "--git-range") {
    const separator = target.indexOf("..");
    if (separator <= 0 || separator === target.length - 2) {
      throw new Error("history range must use the form <base>..<head>");
    }
    base = target.slice(0, separator);
    head = target.slice(separator + 2);
  }

  let maxCommits = DEFAULT_HISTORY_COMMIT_LIMIT;
  const refNames = [];
  for (let index = 0; index < optionArguments.length; index += 2) {
    const option = optionArguments[index];
    const value = optionArguments[index + 1];
    if (value === undefined) {
      throw new Error(`${option} requires a value`);
    }
    if (option === "--max-commits") {
      maxCommits = Number(value);
    } else if (option === "--ref-name") {
      refNames.push(value);
    } else {
      throw new Error(`unknown history option: ${option}`);
    }
  }
  return { base, head, maxCommits, refNames };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let issues;
  try {
    const historyOptions = parseHistoryCli(process.argv.slice(2));
    issues = historyOptions
      ? await scanGitHistoryRange(historyOptions)
      : await scanPublicSurface();
  } catch (error) {
    issues = [
      `Public-surface check could not start: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    ];
  }
  if (issues.length > 0) {
    console.error("Public-surface check failed:\n" + issues.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Public-surface check passed.");
  }
}
