import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const targets = ["chrome", "edge", "firefox"];

for (const browser of targets) {
  const archive = resolve(
    "artifacts",
    `odds-converter-${packageJson.version}-${browser}.zip`,
  );
  const entries = (await capture("unzip", ["-Z1", archive])).trim().split("\n");
  for (const required of ["manifest.json", "popup.html", "js/background.js", "js/content_script.js"]) {
    if (!entries.includes(required)) {
      throw new Error(`${archive} is missing root entry ${required}`);
    }
  }
  if (entries.some((entry) => entry.startsWith("dist/"))) {
    throw new Error(`${archive} contains an unexpected dist/ wrapper directory`);
  }

  const manifest = JSON.parse(await capture("unzip", ["-p", archive, "manifest.json"]));
  if (browser === "firefox") {
    const gecko = manifest.browser_specific_settings?.gecko;
    if (!manifest.background?.scripts?.includes("js/background.js")) {
      throw new Error("Firefox archive does not declare the background script");
    }
    if (!gecko?.id || gecko.strict_min_version !== "128.0") {
      throw new Error("Firefox archive is missing supported Gecko signing metadata");
    }
    if (JSON.stringify(gecko.data_collection_permissions?.required) !== '["none"]') {
      throw new Error("Firefox archive must explicitly declare no required data collection");
    }
  }
}

const sourceArchive = resolve(
  "artifacts",
  `odds-converter-${packageJson.version}-source.zip`,
);
const sourceEntries = (await capture("unzip", ["-Z1", sourceArchive])).trim().split("\n");
for (const required of [
  "package.json",
  "package-lock.json",
  "README.md",
  "config/manifest.base.json",
  "config/manifests/firefox.json",
  "src/background.ts",
]) {
  if (!sourceEntries.includes(required)) throw new Error(`Source archive is missing ${required}`);
}
if (
  sourceEntries.some(
    (entry) => /^(\.git|node_modules|dist|artifacts)\//.test(entry) || entry.endsWith(".zip"),
  )
) {
  throw new Error("Source archive contains generated files, dependencies, archives, or Git metadata");
}

console.log("Validated three browser archives and the reproducible-source archive.");

function capture(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise(output);
      else reject(new Error(`${command} exited with status ${code}`));
    });
  });
}
