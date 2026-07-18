import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("production build contains the Sites worker entry point", async () => {
  await access(new URL("dist/server/index.js", root));
  await access(new URL("dist/client", root));

  const hosting = JSON.parse(await read(".openai/hosting.json"));
  assert.equal(hosting.project_id, "appgprj_6a54aacae01c8191bb781431d4f99a78");
  assert.equal(hosting.d1, "DB");
});

test("application source contains production branding and no starter preview", async () => {
  const [page, layout, styles, packageJson, vite] = await Promise.all([
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read("app/globals.css"),
    read("package.json"),
    read("vite.config.ts"),
  ]);

  assert.match(page, /Quiniela MNF/);
  assert.match(layout, /Quiniela MNF 2026/);
  assert.match(styles, /\.header-logo\s*\{[^}]*width:249\.2px/);
  assert.match(styles, /\.brand-copy h1\s*\{[^}]*font-family:var\(--font-sport\)/);
  assert.match(packageJson, /"name": "quiniela-mnf-2026"/);
  assert.match(vite, /sites\(\)/);
  assert.doesNotMatch(page + layout + styles, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});
