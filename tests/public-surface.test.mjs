import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { scanPublicSurface } from "../scripts/check-public-surface.mjs";

test("public surface contains no blocked paths, secrets, or oversized files", async () => {
  const issues = await scanPublicSurface();
  assert.deepEqual(issues, []);
});

test("open-source policy documents are present", async () => {
  const required = [
    "LICENSE",
    "README.md",
    "ASSET_RIGHTS.md",
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
  const root = await mkdtemp(path.join(tmpdir(), "paradigm-shift-core-scan-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const fakeToken = ["ghp", "_", "a".repeat(32)].join("");
  const fakeFineGrainedToken = ["github", "_pat_", "b".repeat(32)].join("");
  const windowsPath = ["C:", "Users", "example", "secret.txt"].join("\\");
  const windowsForwardPath = ["C:", "Users", "example", "secret.txt"].join("/");
  await writeFile(path.join(root, "sample.txt"), [windowsPath, fakeToken, fakeFineGrainedToken].join("\n"));
  await writeFile(path.join(root, "forward.txt"), windowsForwardPath);
  const nestedDirectory = path.join(root, "src", "node_modules");
  await mkdir(nestedDirectory, { recursive: true });
  const privateKey = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  await writeFile(path.join(nestedDirectory, "credential"), privateKey);
  await writeFile(path.join(root, "client.key"), "placeholder");
  const issues = await scanPublicSurface(root);

  assert.equal(issues.filter((issue) => issue.includes("Windows user path")).length, 2);
  assert.ok(issues.some((issue) => issue.includes("GitHub token")));
  assert.ok(issues.some((issue) => issue.includes("GitHub fine-grained token")));
  assert.ok(issues.some((issue) => issue.includes("private key block")));
  assert.ok(issues.some((issue) => issue.includes("forbidden credential")));
});
