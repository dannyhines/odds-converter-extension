import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const browser = process.argv[2];
if (!new Set(["chrome", "edge", "firefox"]).has(browser)) {
  throw new Error("Usage: node scripts/validate-build.mjs <chrome|edge|firefox>");
}

const buildPath = resolve("dist", browser);
const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(buildPath, "manifest.json"), "utf8"));
const backgroundPaths = [
  manifest.background?.service_worker,
  ...(manifest.background?.scripts ?? []),
];
const referencedPaths = [
  ...backgroundPaths,
  manifest.action?.default_popup,
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...manifest.content_scripts.flatMap((script) => script.js ?? []),
  ...Object.values(manifest.icons ?? {}),
].filter(Boolean);

await Promise.all(
  referencedPaths.map((relativePath) =>
    access(join(buildPath, relativePath.replace(/^\//, ""))),
  ),
);

if (manifest.manifest_version !== 3) throw new Error("Expected a Manifest V3 build");
if (manifest.version !== packageJson.version) {
  throw new Error("Manifest and package versions are inconsistent");
}
if ((manifest.permissions ?? []).includes("activeTab")) {
  throw new Error("The build must not request the activeTab permission");
}

if (browser === "chrome" || browser === "edge") {
  if (!manifest.background?.service_worker || manifest.background?.scripts) {
    throw new Error("Chromium must use an MV3 background service worker");
  }
  if (!manifest.minimum_chrome_version) {
    throw new Error("Chromium must declare its minimum supported version");
  }
  if (manifest.browser_specific_settings) {
    throw new Error("Chromium must not contain Firefox-specific settings");
  }
}

if (browser === "firefox") {
  if (!manifest.background?.scripts?.length || manifest.background?.service_worker) {
    throw new Error("Firefox must use an MV3 background script");
  }
  if (!manifest.browser_specific_settings?.gecko?.id) {
    throw new Error("Firefox must declare a stable add-on ID for signing");
  }
  if (manifest.minimum_chrome_version) {
    throw new Error("Firefox must not contain Chromium-specific version settings");
  }
}

console.log(
  `Validated ${browser} Manifest V3 build with ${referencedPaths.length} referenced files.`,
);
