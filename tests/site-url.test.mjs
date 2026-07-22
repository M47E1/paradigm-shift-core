import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSiteUrl } from "../src/config/site-url.mjs";

test("site URL normalization accepts a bare HTTPS origin", () => {
  assert.equal(
    normalizeSiteUrl("https://example.test/"),
    "https://example.test",
  );
});

test("site URL normalization rejects non-origin and credential-bearing values", () => {
  const at = String.fromCharCode(64);
  const invalidValues = [
    "file:///tmp/site",
    "https://example.test/path",
    "https://example.test/?preview=1",
    "https://example.test/#section",
    `https://user:credential${at}example.test`,
  ];

  for (const value of invalidValues) {
    assert.throws(() => normalizeSiteUrl(value));
  }
});

test("production site URLs require HTTPS and reject loopback by default", () => {
  assert.throws(() =>
    normalizeSiteUrl("http://example.test", { production: true }),
  );
  assert.throws(() =>
    normalizeSiteUrl("http://127.0.0.1:3101", { production: true }),
  );
  assert.throws(() =>
    normalizeSiteUrl("https://127.0.0.2", { production: true }),
  );
  assert.throws(() =>
    normalizeSiteUrl("https://preview.localhost", { production: true }),
  );
  assert.throws(() =>
    normalizeSiteUrl("https://localhost.", { production: true }),
  );
  assert.throws(() =>
    normalizeSiteUrl("https://preview.localhost.", { production: true }),
  );
  assert.throws(() =>
    normalizeSiteUrl("https://[::1]", { production: true }),
  );
  assert.equal(
    normalizeSiteUrl("http://127.0.0.1:3101", {
      production: true,
      allowLoopback: true,
    }),
    "http://127.0.0.1:3101",
  );
  assert.equal(
    normalizeSiteUrl("https://127.example.test", { production: true }),
    "https://127.example.test",
  );
});
