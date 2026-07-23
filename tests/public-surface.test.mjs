import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseHistoryCli,
  scanGitHistoryRange,
  scanPublicSurface,
} from "../scripts/check-public-surface.mjs";

const execFileAsync = promisify(execFile);
const trustedPrePushHook = await readFile(
  new URL("../.githooks/pre-push", import.meta.url),
);
const assetDefaults = {
  owner: "Repository contributors",
  source: "Test fixture",
  license: "MIT",
  redistribution: "Allowed",
  attribution: "None required",
  modifications: "None",
  evidenceId: "test-fixture",
  status: "APPROVED",
};

test("history CLI accepts exactly one complete two-dot range", () => {
  assert.deepEqual(
    parseHistoryCli([
      "--git-range",
      "release/1.2..HEAD~1",
      "--max-commits",
      "25",
      "--ref-name",
      "refs/heads/topic",
    ]),
    {
      base: "release/1.2",
      head: "HEAD~1",
      maxCommits: 25,
      refNames: ["refs/heads/topic"],
    },
  );
});

test("history CLI rejects missing, empty, triple-dot, and repeated ranges", () => {
  for (const target of [
    "HEAD",
    "..HEAD",
    "HEAD..",
    "HEAD...main",
    "HEAD....main",
    "HEAD..main..tip",
    "HEAD..main..",
  ]) {
    assert.throws(
      () => parseHistoryCli(["--git-range", target]),
      /history range must use the form <base>\.\.<head>/,
      target,
    );
  }
});

function digest(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function emailAddress(localPart, domain) {
  return [localPart, domain].join(String.fromCharCode(64));
}

function assetEntry(assetPath, contents, overrides = {}) {
  return {
    path: assetPath,
    sha256: digest(contents),
    ...assetDefaults,
    ...overrides,
  };
}

async function writeManifest(root, assets = []) {
  await writeFile(
    path.join(root, "asset-rights.json"),
    JSON.stringify({ schemaVersion: 1, assets }, null, 2) + "\n",
  );
}

async function fixtureRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), "paradigm-shift-core-scan-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeManifest(root);
  await mkdir(path.join(root, ".githooks"));
  const hookPath = path.join(root, ".githooks", "pre-push");
  await writeFile(hookPath, trustedPrePushHook);
  await chmod(hookPath, 0o755);
  return root;
}

async function gitInit(root) {
  await execFileAsync("git", ["init", "-q"], { cwd: root, windowsHide: true });
  await execFileAsync("git", ["config", "user.name", "Public Surface Tests"], {
    cwd: root,
    windowsHide: true,
  });
  await execFileAsync(
    "git",
    [
      "config",
      "user.email",
      emailAddress("1+public-surface-tests", "users.noreply.github.com"),
    ],
    {
      cwd: root,
      windowsHide: true,
    },
  );
  await execFileAsync("git", ["add", ".githooks/pre-push"], {
    cwd: root,
    windowsHide: true,
  });
  await execFileAsync(
    "git",
    ["update-index", "--chmod=+x", ".githooks/pre-push"],
    { cwd: root, windowsHide: true },
  );
}

async function gitCommit(root, message) {
  await execFileAsync("git", ["add", "-A"], { cwd: root, windowsHide: true });
  await execFileAsync("git", ["commit", "-q", "-m", message], {
    cwd: root,
    windowsHide: true,
  });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  return stdout.trim();
}

function utf16be(text) {
  const buffer = Buffer.from(text, "utf16le");
  for (let index = 0; index < buffer.length; index += 2) {
    [buffer[index], buffer[index + 1]] = [buffer[index + 1], buffer[index]];
  }
  return buffer;
}

test("public surface contains no blocked paths, secrets, or unapproved assets", async () => {
  const issues = await scanPublicSurface();
  assert.deepEqual(issues, []);
});

test("open-source policy documents are present", async () => {
  const required = [
    "LICENSE",
    "README.md",
    "ASSET_RIGHTS.md",
    "asset-rights.json",
    "THIRD_PARTY_NOTICES.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CODE_OF_CONDUCT.md",
  ];
  await Promise.all(required.map((file) => access(new URL(`../${file}`, import.meta.url))));
});

test("initial public media directory contains only its tracked marker", async () => {
  const entries = await readdir(new URL("../public/", import.meta.url));
  assert.deepEqual(entries, [".gitkeep"]);
});

test("scanner detects secret shapes and absolute user paths", async (t) => {
  const root = await fixtureRoot(t);
  const fakeToken = ["ghp", "_", "a".repeat(32)].join("");
  const fakeFineGrainedToken = ["github", "_pat_", "b".repeat(32)].join("");
  const windowsPath = ["C:", "Users", "example", "secret.txt"].join("\\");
  const windowsForwardPath = ["C:", "Users", "example", "secret.txt"].join("/");
  await writeFile(
    path.join(root, "sample.txt"),
    [windowsPath, fakeToken, fakeFineGrainedToken].join("\n"),
  );
  await writeFile(path.join(root, "forward.txt"), windowsForwardPath);
  const nestedDirectory = path.join(root, "src", "node_modules");
  await mkdir(nestedDirectory, { recursive: true });
  const privateKey = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  await writeFile(path.join(nestedDirectory, "credential"), privateKey);
  await writeFile(
    path.join(root, "encrypted.txt"),
    ["-----BEGIN ", "ENCRYPTED PRIVATE KEY-----"].join(""),
  );
  await writeFile(
    path.join(root, "dsa.txt"),
    ["-----BEGIN ", "DSA PRIVATE KEY-----"].join(""),
  );
  await writeFile(
    path.join(root, "pgp.txt"),
    ["-----BEGIN ", "PGP PRIVATE KEY BLOCK-----"].join(""),
  );
  await writeFile(path.join(root, "client.key"), "placeholder");

  const issues = await scanPublicSurface(root);

  assert.equal(issues.filter((issue) => issue.includes("Windows user path")).length, 2);
  assert.ok(issues.some((issue) => issue.includes("GitHub token")));
  assert.ok(issues.some((issue) => issue.includes("GitHub fine-grained token")));
  assert.equal(issues.filter((issue) => issue.includes("private key block")).length, 4);
  assert.ok(issues.some((issue) => issue.includes("forbidden credential")));
});

test("scanner detects quoted structured secrets and credential directories", async (t) => {
  const root = await fixtureRoot(t);
  const value = ["opaque", "v".repeat(24)].join("-");
  const passwordKey = ["pass", "word"].join("");
  const accessTokenKey = ["access", "_token"].join("");
  const apiKey = ["api", "_key"].join("");
  await writeFile(
    path.join(root, "structured.json"),
    JSON.stringify({ [passwordKey]: value }),
  );
  await writeFile(
    path.join(root, "settings.toml"),
    `"${accessTokenKey}" = "${value}"\n`,
  );
  await writeFile(path.join(root, "settings.yaml"), `${apiKey}: ${value}\n`);
  await writeFile(
    path.join(root, "settings.env.example"),
    `${passwordKey.toUpperCase()}=${value}\n`,
  );
  await writeFile(
    path.join(root, "punctuation.json"),
    JSON.stringify({ [passwordKey]: "Correct horse! 2026" }),
  );
  const dockerDirectory = path.join(root, ".docker");
  await mkdir(dockerDirectory);
  await writeFile(
    path.join(dockerDirectory, "config.json"),
    JSON.stringify({ auths: { registry: { auth: value } } }),
  );

  const issues = await scanPublicSurface(root);

  assert.ok(
    issues.filter((issue) => issue.includes("generic secret assignment")).length >=
      6,
  );
  assert.ok(
    issues.some((issue) => issue.includes("forbidden private or generated path")),
  );
});

test("scanner detects temporary cloud credentials and service URLs", async (t) => {
  const root = await fixtureRoot(t);
  const temporaryAccessKey = ["ASIA", "Z".repeat(16)].join("");
  const secretValue = ["private", "x".repeat(32)].join("-");
  const keys = [
    ["AWS", "ACCESS", "KEY", "ID"].join("_"),
    ["AWS", "SECRET", "ACCESS", "KEY"].join("_"),
    ["AWS", "SESSION", "TOKEN"].join("_"),
    ["DEPLOY", "TOKEN"].join("_"),
  ];
  await writeFile(
    path.join(root, "cloud.env.example"),
    [
      `${keys[0]}=${temporaryAccessKey}`,
      `${keys[1]}=${secretValue}`,
      `${keys[2]}=${secretValue}`,
      `${keys[3]}=${secretValue}`,
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "services.txt"),
    [
      ["redis", "://user:", secretValue, "@cache.invalid/0"].join(""),
      ["amqps", "://user:", secretValue, "@queue.invalid/vhost"].join(""),
    ].join("\n"),
  );

  const issues = await scanPublicSurface(root);

  assert.ok(issues.some((issue) => issue.includes("AWS access key")));
  assert.ok(
    issues.filter((issue) => issue.includes("generic secret assignment")).length >=
      1,
  );
  assert.equal(
    issues.filter((issue) => issue.includes("credential-bearing URL")).length,
    1,
  );
});

test("scanner includes force-tracked files inside ignored directories", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  await writeFile(path.join(root, ".gitignore"), "/.next/\n");
  const hiddenDirectory = path.join(root, ".next");
  await mkdir(hiddenDirectory);
  const trackedToken = ["ghp", "_", "c".repeat(32)].join("");
  const untrackedToken = ["ghp", "_", "d".repeat(32)].join("");
  await writeFile(path.join(hiddenDirectory, "private.txt"), trackedToken);
  await writeFile(path.join(hiddenDirectory, "ignored.txt"), untrackedToken);
  await execFileAsync("git", ["add", "-f", ".next/private.txt"], {
    cwd: root,
    windowsHide: true,
  });

  const issues = await scanPublicSurface(root);

  assert.ok(issues.some((issue) => issue.includes("tracked file is ignored")));
  assert.ok(issues.some((issue) => issue.includes(".next/private.txt") && issue.includes("GitHub token")));
  assert.ok(!issues.some((issue) => issue.includes(".next/ignored.txt")));
});

test("scanner rejects partially staged files that hide different index content", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  const stagedToken = ["ghp", "_", "f".repeat(32)].join("");
  await writeFile(path.join(root, "partial.txt"), stagedToken);
  await execFileAsync("git", ["add", "partial.txt"], {
    cwd: root,
    windowsHide: true,
  });
  await writeFile(path.join(root, "partial.txt"), "clean worktree replacement");

  const issues = await scanPublicSurface(root);

  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("partial.txt") &&
        issue.includes("tracked Git bytes differ from the scanned worktree"),
    ),
  );
});

test("scanner rejects a clean worktree that hides tracked sensitive bytes", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  const trackedToken = ["ghp", "_", "u".repeat(32)].join("");
  await writeFile(path.join(root, "tracked.txt"), trackedToken);
  await gitCommit(root, "track sensitive fixture");
  await writeFile(path.join(root, "tracked.txt"), "clean worktree replacement");

  const issues = await scanPublicSurface(root);

  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("tracked.txt") &&
        issue.includes("tracked Git bytes differ from the scanned worktree"),
    ),
  );
});

test("scanner fails closed when a Git worktree cannot be inventoried", async (t) => {
  const root = await fixtureRoot(t);
  await mkdir(path.join(root, ".git"));

  const issues = await scanPublicSurface(root);

  assert.ok(issues.some((issue) => issue.includes("Git inventory unavailable")));
  assert.ok(!issues.some((issue) => issue.includes("asset-rights.json: binary")));
});

test("scanner rejects Git mode 120000 even when checkout is a regular file", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  await writeFile(path.join(root, "link"), "target.txt");
  const { stdout: objectId } = await execFileAsync(
    "git",
    ["hash-object", "-w", "link"],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  await execFileAsync(
    "git",
    [
      "update-index",
      "--add",
      "--cacheinfo",
      `120000,${objectId.trim()},link`,
    ],
    { cwd: root, windowsHide: true },
  );

  const issues = await scanPublicSurface(root);

  assert.ok(issues.some((issue) => issue.includes("Git mode 120000 symlinks")));
});

test("scanner rejects a Git mode 120000 asset manifest before parsing it", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  await writeFile(path.join(root, "asset-rights.json"), "not JSON");
  const { stdout: objectId } = await execFileAsync(
    "git",
    ["hash-object", "-w", "asset-rights.json"],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  await execFileAsync(
    "git",
    [
      "update-index",
      "--add",
      "--cacheinfo",
      `120000,${objectId.trim()},asset-rights.json`,
    ],
    { cwd: root, windowsHide: true },
  );

  const issues = await scanPublicSurface(root);

  assert.ok(
    issues.some((issue) =>
      issue.includes("asset-rights.json: asset manifest must be a regular file"),
    ),
  );
  assert.ok(!issues.some((issue) => issue.includes("invalid JSON")));
});

test("scanner rejects an oversized asset manifest before parsing it", async (t) => {
  const root = await fixtureRoot(t);
  await writeFile(
    path.join(root, "asset-rights.json"),
    Buffer.alloc(1_000_001, 0x20),
  );

  const issues = await scanPublicSurface(root);

  assert.ok(
    issues.some((issue) =>
      issue.includes("asset-rights.json: asset manifest exceeds 1000000 bytes"),
    ),
  );
  assert.ok(!issues.some((issue) => issue.includes("invalid JSON")));
});

test("scanner detects tokens after NUL bytes and in UTF-16 text", async (t) => {
  const root = await fixtureRoot(t);
  const fakeToken = ["ghp", "_", "e".repeat(32)].join("");
  await writeFile(
    path.join(root, "nul.bin"),
    Buffer.concat([Buffer.from([0]), Buffer.from(fakeToken)]),
  );
  await writeFile(path.join(root, "little.txt"), Buffer.from(fakeToken, "utf16le"));
  await writeFile(path.join(root, "big.txt"), utf16be(fakeToken));
  const widePrefix = String.fromCodePoint(0x6d4b, 0x8bd5).repeat(200);
  await writeFile(
    path.join(root, "mixed.txt"),
    Buffer.from(widePrefix + fakeToken, "utf16le"),
  );
  await writeFile(
    path.join(root, "misaligned.txt"),
    Buffer.concat([Buffer.from([0x41]), Buffer.from(fakeToken, "utf16le")]),
  );

  const issues = await scanPublicSurface(root);

  for (const file of [
    "nul.bin",
    "little.txt",
    "big.txt",
    "mixed.txt",
    "misaligned.txt",
  ]) {
    assert.ok(
      issues.some((issue) => issue.includes(file) && issue.includes("GitHub token")),
      `expected token finding for ${file}`,
    );
  }
});

test("scanner rejects embedded media hidden in a text data URI", async (t) => {
  const root = await fixtureRoot(t);
  await writeFile(
    path.join(root, "embedded.txt"),
    ["data:", "application/octet-stream", ";base64,", "A".repeat(48)].join(""),
  );
  await writeFile(
    path.join(root, "omitted-media-type.txt"),
    ["data:", ";base64,", "B".repeat(48)].join(""),
  );
  await writeFile(
    path.join(root, "percent-encoded.txt"),
    ["data", ":image/svg+xml,", "%3Csvg%3E"].join(""),
  );
  await writeFile(
    path.join(root, "entity-encoded.html"),
    ['<img src="da', 'ta&#58;image/png;base64,AAAA">'].join(""),
  );
  await writeFile(
    path.join(root, "control-encoded.html"),
    ['<img src="da', '&#x0A;ta:image/png,AAAA">'].join(""),
  );

  const issues = await scanPublicSurface(root);

  assert.equal(
    issues.filter((issue) => issue.includes("embedded data URI")).length,
    5,
  );
});

test("scanner rejects Git LFS pointers whose object bytes evade review", async (t) => {
  const root = await fixtureRoot(t);
  const pointer = [
    ["version https://git-lfs.github.com/spec/", "v1"].join(""),
    "oid sha256:" + "0".repeat(64),
    "size 1234",
    "",
  ].join("\n");
  await writeFile(path.join(root, "asset.txt"), pointer);

  const issues = await scanPublicSurface(root);

  assert.ok(issues.some((issue) => issue.includes("Git LFS pointer")));
});

test(
  "scanner rejects repository paths that could escape after separator normalization",
  { skip: process.platform === "win32" },
  async (t) => {
    const root = await fixtureRoot(t);
    await writeFile(path.join(root, "..\\outside.txt"), "not actually outside");

    const issues = await scanPublicSurface(root);

    assert.ok(
      issues.some((issue) => issue.includes("not a safe repository-relative path")),
    );
  },
);

test(
  "scanner fails closed on Git paths that are not valid UTF-8",
  { skip: process.platform === "win32" },
  async (t) => {
    const root = await fixtureRoot(t);
    await gitInit(root);
    const invalidPath = Buffer.concat([
      Buffer.from(root + path.sep),
      Buffer.from([0xff]),
      Buffer.from(".txt"),
    ]);
    await writeFile(invalidPath, "unreviewable filename");
    await execFileAsync("git", ["add", "-A"], { cwd: root, windowsHide: true });

    const issues = await scanPublicSurface(root);

    assert.ok(
      issues.some((issue) =>
        issue.includes("Git inventory unavailable (GIT_PATH_ENCODING)"),
      ),
    );
  },
);

test("scanner redacts secret-bearing publishable paths from every finding", async (t) => {
  const root = await fixtureRoot(t);
  const fakeToken = ["ghp", "_", "r".repeat(32)].join("");
  const sensitiveEmail = emailAddress("person", "example.com");
  const sensitiveName = `${fakeToken}-${sensitiveEmail}.unknown`;
  await writeFile(path.join(root, sensitiveName), "printable but unregistered");

  const issues = await scanPublicSurface(root);

  assert.ok(issues.some((issue) => issue.includes("publishable path contains GitHub token")));
  assert.ok(issues.some((issue) => issue.includes("publishable path contains email address")));
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("[redacted publishable path]") &&
        issue.includes("unknown file is not registered"),
    ),
  );
  assert.ok(issues.every((issue) => !issue.includes(fakeToken)));
  assert.ok(issues.every((issue) => !issue.includes(sensitiveEmail)));
});

test("scanner accepts the approved extensionless pre-push hook path", async (t) => {
  const root = await fixtureRoot(t);
  await writeFile(path.join(root, ".githooks", "pre-push"), trustedPrePushHook);

  assert.deepEqual(await scanPublicSurface(root), []);
});

test("scanner rejects a modified or no-op pre-push hook", async (t) => {
  const root = await fixtureRoot(t);
  await writeFile(path.join(root, ".githooks", "pre-push"), "#!/bin/sh\nexit 0\n");

  const issues = await scanPublicSurface(root);

  assert.ok(
    issues.some((issue) =>
      issue.includes("pre-push hook contents do not match the trusted launcher"),
    ),
  );
});

test("scanner requires the tracked pre-push hook to remain executable", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  await execFileAsync(
    "git",
    ["update-index", "--chmod=-x", ".githooks/pre-push"],
    { cwd: root, windowsHide: true },
  );

  let issues = await scanPublicSurface(root);
  assert.ok(
    issues.some((issue) => issue.includes("tracked hook must use Git mode 100755")),
  );

  await execFileAsync(
    "git",
    ["update-index", "--chmod=+x", ".githooks/pre-push"],
    { cwd: root, windowsHide: true },
  );
  issues = await scanPublicSurface(root);
  assert.ok(
    !issues.some((issue) => issue.includes("tracked hook must use Git mode 100755")),
  );
});

test("scanner rejects removal of the tracked pre-push hook", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  await rm(path.join(root, ".githooks", "pre-push"));
  await execFileAsync("git", ["rm", "--cached", ".githooks/pre-push"], {
    cwd: root,
    windowsHide: true,
  });

  const issues = await scanPublicSurface(root);

  assert.ok(
    issues.some((issue) => issue.includes("tracked hook must use Git mode 100755")),
  );
});

test("scanner rejects attributes that can disguise Git blob bytes", async (t) => {
  const root = await fixtureRoot(t);
  await mkdir(path.join(root, "nested"));
  await writeFile(
    path.join(root, "nested", ".gitattributes"),
    [
      "payload.txt working-tree-encoding=UTF-32LE",
      "ident-payload.txt ident",
      "",
    ].join("\n"),
  );

  const issues = await scanPublicSurface(root);

  assert.ok(
    issues.some((issue) =>
      issue.includes("transforming attributes can hide Git blob bytes from review"),
    ),
  );
});

test("scanner treats unknown printable media extensions as assets", async (t) => {
  const root = await fixtureRoot(t);
  await writeFile(path.join(root, "pixel.ppm"), "P3\n1 1\n255\n255 0 0\n");

  const issues = await scanPublicSurface(root);

  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("pixel.ppm") &&
        issue.includes("binary, media, or unknown file is not registered"),
    ),
  );
});

test("scanner rejects unregistered binary and media assets", async (t) => {
  const root = await fixtureRoot(t);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await writeFile(path.join(root, "image.png"), png);

  const issues = await scanPublicSurface(root);

  assert.ok(
    issues.some((issue) =>
      issue.includes("binary, media, or unknown file is not registered"),
    ),
  );
});

test("scanner rejects an asset whose digest differs from its manifest", async (t) => {
  const root = await fixtureRoot(t);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  await writeFile(path.join(root, "image.png"), png);
  await writeManifest(root, [
    assetEntry("image.png", png, { sha256: "0".repeat(64) }),
  ]);

  const issues = await scanPublicSurface(root);

  assert.ok(issues.some((issue) => issue.includes("SHA-256 does not match asset manifest")));
});

test("scanner verifies manifest hashes for ordinary text files", async (t) => {
  const root = await fixtureRoot(t);
  const contents = "registered text";
  await writeFile(path.join(root, "notes.txt"), contents);
  await writeManifest(root, [
    assetEntry("notes.txt", contents, { sha256: "0".repeat(64) }),
  ]);

  const issues = await scanPublicSurface(root);

  assert.ok(issues.some((issue) => issue.includes("SHA-256 does not match asset manifest")));
});

test("scanner accepts a fully registered asset with a matching digest", async (t) => {
  const root = await fixtureRoot(t);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="2" cy="2" r="1"/></svg>';
  await writeFile(path.join(root, "image.svg"), svg);
  await writeManifest(root, [assetEntry("image.svg", svg)]);

  assert.deepEqual(await scanPublicSurface(root), []);
});

test("asset registration does not admit opaque binary containers", async (t) => {
  const root = await fixtureRoot(t);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 5, 6, 7, 8]);
  await writeFile(path.join(root, "image.png"), png);
  await writeManifest(root, [assetEntry("image.png", png)]);

  const issues = await scanPublicSurface(root);

  assert.ok(
    issues.some((issue) =>
      issue.includes(
        "opaque asset format is not publishable without format-aware privacy checks",
      ),
    ),
  );
});

test("approved assets use the larger file-size limit", async (t) => {
  const root = await fixtureRoot(t);
  const contents = Buffer.alloc(1_000_001, 0x61);
  await writeFile(path.join(root, "large.txt"), contents);
  await writeManifest(root, [assetEntry("large.txt", contents)]);

  assert.deepEqual(await scanPublicSurface(root), []);
});

test("asset registration does not permit active SVG content", async (t) => {
  const root = await fixtureRoot(t);
  const svgs = new Map([
    ["script.svg", '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'],
    ["event.svg", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
    ["url.svg", '<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#x73;cript:alert(1)"/></svg>'],
    ["control.svg", '<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#x0A;script:alert(1)"/></svg>'],
    ["form-feed.svg", '<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#x0C;script:alert(1)"/></svg>'],
    ["foreign.svg", '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>'],
    ["external.svg", '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/a.png"/></svg>'],
    ["import.svg", '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "theme.css";</style></svg>'],
    ["doctype.svg", '<!DOCTYPE svg [<!ENTITY shape "circle">]><svg xmlns="http://www.w3.org/2000/svg"><text>&shape;</text></svg>'],
    ["base.svg", '<svg xmlns="http://www.w3.org/2000/svg" xml:base="https://example.invalid/"><use href="#mark"/></svg>'],
    ["style.svg", '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:red"/></svg>'],
    ["animate.svg", '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="opacity" values="0;1"/></svg>'],
    ["local.svg", '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#g"/></svg>'],
  ]);
  await Promise.all(
    [...svgs].map(([file, contents]) => writeFile(path.join(root, file), contents)),
  );
  await writeManifest(
    root,
    [...svgs].map(([file, contents]) => assetEntry(file, contents)),
  );

  const issues = await scanPublicSurface(root);

  assert.ok(issues.some((issue) => issue.includes("script element")));
  assert.ok(issues.some((issue) => issue.includes("event-handler attribute")));
  assert.ok(
    issues.some(
      (issue) => issue.includes("control.svg") && issue.includes("javascript URL"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("doctype.svg") &&
        issue.includes("XML indirection or a base override"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("base.svg") &&
        issue.includes("XML indirection or a base override"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("style.svg") &&
        issue.includes("dynamic styling or animation"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("animate.svg") &&
        issue.includes("dynamic styling or animation"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) => issue.includes("form-feed.svg") && issue.includes("javascript URL"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("foreign.svg") &&
        issue.includes("active embedded content"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("external.svg") &&
        issue.includes("external resource reference"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("import.svg") &&
        issue.includes("external resource reference"),
    ),
  );
  assert.ok(
    !issues.some(
      (issue) =>
        issue.includes("local.svg") &&
        issue.includes("external resource reference"),
    ),
  );
});

test("scanner rejects manifest entries without publishable files", async (t) => {
  const root = await fixtureRoot(t);
  await writeManifest(root, [assetEntry("missing.png", Buffer.from("missing"))]);

  const issues = await scanPublicSurface(root);

  assert.ok(issues.some((issue) => issue.includes("asset manifest entry has no publishable file")));
});

test("history scan catches a secret added and deleted before the head tree", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  const base = await gitCommit(root, "base");
  const fakeToken = ["ghp", "_", "h".repeat(32)].join("");
  await writeFile(path.join(root, "temporary-secret.txt"), fakeToken);
  const leakingCommit = await gitCommit(root, "add temporary secret");
  await rm(path.join(root, "temporary-secret.txt"));
  const head = await gitCommit(root, "delete temporary secret");

  assert.deepEqual(await scanPublicSurface(root), []);
  const issues = await scanGitHistoryRange({
    root,
    base,
    head,
    maxCommits: 10,
  });

  assert.ok(
    issues.some(
      (issue) =>
        issue.includes(leakingCommit.slice(0, 12)) &&
        issue.includes("temporary-secret.txt") &&
        issue.includes("GitHub token"),
    ),
  );

  const boundedIssues = await scanGitHistoryRange({
    root,
    base,
    head,
    maxCommits: 1,
  });
  assert.ok(boundedIssues.some((issue) => issue.includes("exceeds the configured limit")));
});

test("all-history scan includes a leaking root commit", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  const fakeToken = ["ghp", "_", "i".repeat(32)].join("");
  await writeFile(path.join(root, "root-secret.txt"), fakeToken);
  const leakingRoot = await gitCommit(root, "leaking root");
  await rm(path.join(root, "root-secret.txt"));
  const head = await gitCommit(root, "remove root secret");

  const issues = await scanGitHistoryRange({ root, head, maxCommits: 10 });

  assert.ok(
    issues.some(
      (issue) =>
        issue.includes(leakingRoot.slice(0, 12)) &&
        issue.includes("root-secret.txt") &&
        issue.includes("GitHub token"),
    ),
  );
});

test("history scan checks commit, annotated-tag, and ref metadata", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  const commitToken = ["ghp", "_", "j".repeat(32)].join("");
  const tagToken = ["ghp", "_", "k".repeat(32)].join("");
  const refToken = ["ghp", "_", "m".repeat(32)].join("");
  const head = await gitCommit(
    root,
    `metadata ${commitToken} ${emailAddress("committer", "example.com")}`,
  );
  await execFileAsync(
    "git",
    ["tag", "-a", "inner-review-tag", "-m", `tag metadata ${tagToken}`],
    { cwd: root, windowsHide: true },
  );
  await execFileAsync(
    "git",
    ["tag", "-a", "review-tag", "inner-review-tag", "-m", "outer tag metadata"],
    { cwd: root, windowsHide: true },
  );

  const issues = await scanGitHistoryRange({
    root,
    head: "review-tag",
    maxCommits: 10,
    refNames: [
      "refs/heads/safe-source",
      `refs/tags/${refToken}-${emailAddress("owner", "example.com")}`,
    ],
  });

  assert.ok(
    issues.some(
      (issue) =>
        issue.includes(head.slice(0, 12)) &&
        issue.includes("commit metadata") &&
        issue.includes("GitHub token"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("commit metadata") && issue.includes("email address"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("history tag") && issue.includes("GitHub token"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("history ref name contains GitHub token"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("history ref name contains email address"),
    ),
  );
});

test("history scan permits ordinary Git identity email headers", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  await execFileAsync(
    "git",
    ["config", "user.email", emailAddress("contributor", "example.com")],
    {
      cwd: root,
      windowsHide: true,
    },
  );
  const head = await gitCommit(
    root,
    [
      "benign commit",
      "",
      `Signed-off-by: dependabot[bot] <${emailAddress("support", "github.com")}>`,
      `Co-authored-by: Example <${emailAddress(
        "1+example",
        "users.noreply.github.com",
      )}>`,
    ].join("\n"),
  );

  assert.deepEqual(
    await scanGitHistoryRange({ root, head, maxCommits: 10 }),
    [],
  );
});

test("history scan refuses Git replacement refs and grafts", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  const first = await gitCommit(root, "first");
  await writeFile(path.join(root, "second.txt"), "second");
  const second = await gitCommit(root, "second");
  await execFileAsync("git", ["replace", first, second], {
    cwd: root,
    windowsHide: true,
  });

  let issues = await scanGitHistoryRange({ root, head: first, maxCommits: 10 });
  assert.ok(
    issues.some((issue) => issue.includes("Git replacement refs are not allowed")),
  );

  await execFileAsync("git", ["replace", "-d", first], {
    cwd: root,
    windowsHide: true,
  });
  await mkdir(path.join(root, ".git", "info"), { recursive: true });
  await writeFile(path.join(root, ".git", "info", "grafts"), `${second}\n`);
  issues = await scanGitHistoryRange({ root, head: second, maxCommits: 10 });
  assert.ok(issues.some((issue) => issue.includes("Git grafts are not allowed")));
});

test("history scan rejects ident before checkout can rewrite a secret blob", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  const nested = path.join(root, "nested");
  await mkdir(nested);
  await writeFile(path.join(nested, ".gitattributes"), "payload.txt ident\n");
  const fakeToken = ["ghp", "_", "n".repeat(32)].join("");
  await writeFile(
    path.join(nested, "payload.txt"),
    ["$Id: ", fakeToken, " $"].join(""),
  );
  await execFileAsync("git", ["add", "-A"], { cwd: root, windowsHide: true });
  const { stdout: rawObjectOutput } = await execFileAsync(
    "git",
    ["hash-object", "-w", "--no-filters", "nested/payload.txt"],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  const rawObject = rawObjectOutput.trim();
  await execFileAsync(
    "git",
    [
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${rawObject},nested/payload.txt`,
    ],
    { cwd: root, windowsHide: true },
  );
  await execFileAsync("git", ["commit", "-q", "-m", "raw ident fixture"], {
    cwd: root,
    windowsHide: true,
  });
  const { stdout: headOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  const head = headOutput.trim();
  const { stdout: storedBlob } = await execFileAsync(
    "git",
    ["cat-file", "blob", `${head}:nested/payload.txt`],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  assert.ok(storedBlob.includes(fakeToken));

  const issues = await scanGitHistoryRange({ root, head, maxCommits: 10 });

  assert.ok(
    issues.some((issue) =>
      issue.includes("transforming attributes can hide Git blob bytes"),
    ),
  );
});

test("history scan rejects checkout bytes that differ from stored blobs", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  await writeFile(path.join(root, ".gitattributes"), "* text eol=crlf\n");
  await writeFile(path.join(root, "payload.txt"), "first\nsecond\n");
  await execFileAsync(
    "git",
    ["add", ".gitattributes", "asset-rights.json", ".githooks/pre-push"],
    { cwd: root, windowsHide: true },
  );
  const { stdout: rawObjectOutput } = await execFileAsync(
    "git",
    ["hash-object", "-w", "--no-filters", "payload.txt"],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  const rawObject = rawObjectOutput.trim();
  await execFileAsync(
    "git",
    [
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${rawObject},payload.txt`,
    ],
    { cwd: root, windowsHide: true },
  );
  await execFileAsync("git", ["commit", "-q", "-m", "raw eol fixture"], {
    cwd: root,
    windowsHide: true,
  });
  const { stdout: headOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });

  const issues = await scanGitHistoryRange({
    root,
    head: headOutput.trim(),
    maxCommits: 10,
  });

  assert.ok(
    issues.some((issue) =>
      issue.includes("checkout bytes differ from the stored Git blob"),
    ),
    JSON.stringify(issues),
  );
});

test("history scan rejects case-colliding Git paths before checkout", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  await execFileAsync("git", ["add", "asset-rights.json"], {
    cwd: root,
    windowsHide: true,
  });
  const fakeToken = ["ghp", "_", "q".repeat(32)].join("");
  const privateBlobPath = path.join(root, ".git", "private-blob");
  const publicBlobPath = path.join(root, ".git", "public-blob");
  await writeFile(privateBlobPath, fakeToken);
  await writeFile(publicBlobPath, "safe");
  const { stdout: privateObjectOutput } = await execFileAsync(
    "git",
    ["hash-object", "-w", privateBlobPath],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  const { stdout: publicObjectOutput } = await execFileAsync(
    "git",
    ["hash-object", "-w", publicBlobPath],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  await execFileAsync(
    "git",
    [
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${privateObjectOutput.trim()},PAYLOAD.txt`,
    ],
    { cwd: root, windowsHide: true },
  );
  await execFileAsync(
    "git",
    [
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${publicObjectOutput.trim()},payload.txt`,
    ],
    { cwd: root, windowsHide: true },
  );
  await execFileAsync("git", ["commit", "-q", "-m", "colliding paths"], {
    cwd: root,
    windowsHide: true,
  });
  const { stdout: headOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });

  const currentIssues = await scanPublicSurface(root);
  assert.ok(
    currentIssues.some((issue) =>
      issue.includes("paths that collide on common filesystems"),
    ),
  );

  const issues = await scanGitHistoryRange({
    root,
    head: headOutput.trim(),
    maxCommits: 10,
  });

  assert.ok(
    issues.some((issue) =>
      issue.includes("paths that collide on common filesystems"),
    ),
  );
});

test("history scan decodes UTF-16 commit messages", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  await execFileAsync("git", ["add", "-A"], { cwd: root, windowsHide: true });
  const { stdout: treeOutput } = await execFileAsync("git", ["write-tree"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  const fakeToken = ["ghp", "_", "u".repeat(32)].join("");
  const rawCommitPath = path.join(root, ".git", "raw-utf16-commit");
  const identityEmail = emailAddress(
    "1+public-surface-tests",
    "users.noreply.github.com",
  );
  const rawCommit = Buffer.concat([
    Buffer.from(
      [
        `tree ${treeOutput.trim()}`,
        `author Public Surface Tests <${identityEmail}> 1700000000 +0000`,
        `committer Public Surface Tests <${identityEmail}> 1700000000 +0000`,
        "",
        "",
      ].join("\n"),
    ),
    Buffer.from(fakeToken, "utf16le"),
    Buffer.from("\n", "utf16le"),
  ]);
  await writeFile(rawCommitPath, rawCommit);
  const { stdout: commitOutput } = await execFileAsync(
    "git",
    ["hash-object", "-t", "commit", "--literally", "-w", rawCommitPath],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  const commit = commitOutput.trim();

  const issues = await scanGitHistoryRange({
    root,
    head: commit,
    maxCommits: 10,
  });

  assert.ok(
    issues.some(
      (issue) =>
        issue.includes(`history ${commit.slice(0, 12)} commit metadata`) &&
        issue.includes("GitHub token"),
    ),
  );
});

test("history scan never runs hooks from the commit being inspected", async (t) => {
  const root = await fixtureRoot(t);
  await gitInit(root);
  await execFileAsync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: root,
    windowsHide: true,
  });
  const base = await gitCommit(root, "base");
  const hooksDirectory = path.join(root, ".githooks");
  await writeFile(
    path.join(hooksDirectory, "post-checkout"),
    [
      "#!/bin/sh",
      'printf executed > "$PUBLIC_SURFACE_HOOK_MARKER"',
      "",
    ].join("\n"),
  );
  await execFileAsync("git", ["add", ".githooks/post-checkout"], {
    cwd: root,
    windowsHide: true,
  });
  await execFileAsync("git", ["update-index", "--chmod=+x", ".githooks/post-checkout"], {
    cwd: root,
    windowsHide: true,
  });
  await execFileAsync("git", ["commit", "-q", "-m", "add hostile checkout hook"], {
    cwd: root,
    windowsHide: true,
  });
  const { stdout: headOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  const marker = path.join(root, "hook-executed.txt");
  const previousMarker = process.env.PUBLIC_SURFACE_HOOK_MARKER;
  process.env.PUBLIC_SURFACE_HOOK_MARKER = marker;
  let issues;
  try {
    issues = await scanGitHistoryRange({
      root,
      base,
      head: headOutput.trim(),
      maxCommits: 10,
    });
  } finally {
    if (previousMarker === undefined) {
      delete process.env.PUBLIC_SURFACE_HOOK_MARKER;
    } else {
      process.env.PUBLIC_SURFACE_HOOK_MARKER = previousMarker;
    }
  }

  assert.ok(
    issues.some(
      (issue) =>
        issue.includes(".githooks/post-checkout") &&
        issue.includes("unknown file is not registered"),
    ),
  );
  assert.ok(!issues.some((issue) => issue.includes("commit scan failed")));

  await assert.rejects(
    access(marker),
    (error) => error && typeof error === "object" && error.code === "ENOENT",
  );
});
