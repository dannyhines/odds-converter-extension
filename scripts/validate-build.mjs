import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const buildDirectory = new URL("../dist/", import.meta.url);
const buildPath = fileURLToPath(buildDirectory);
const manifest = JSON.parse(await readFile(new URL("manifest.json", buildDirectory), "utf8"));
const referencedPaths = [
  manifest.background?.service_worker,
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
if (manifest.version !== "4.0.0") throw new Error("Manifest and release version are inconsistent");
if ((manifest.permissions ?? []).includes("activeTab")) {
  throw new Error("The build must not request the activeTab permission");
}
console.log(`Validated Manifest V3 build with ${referencedPaths.length} referenced files.`);
