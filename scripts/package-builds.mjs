import { mkdir, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const artifactsDirectory = resolve("artifacts");
const targets = [
  ["chrome", `odds-converter-${packageJson.version}-chrome.zip`],
  ["edge", `odds-converter-${packageJson.version}-edge.zip`],
  ["firefox", `odds-converter-${packageJson.version}-firefox.zip`],
];
const sourceFilename = `odds-converter-${packageJson.version}-source.zip`;

await mkdir(artifactsDirectory, { recursive: true });

for (const [browser, filename] of targets) {
  const sourceDirectory = resolve("dist", browser);
  const destination = resolve(artifactsDirectory, filename);
  await rm(destination, { force: true });
  await run("zip", ["-q", "-r", destination, "."], sourceDirectory);
  console.log(`Created ${destination}`);
}

const sourceDestination = resolve(artifactsDirectory, sourceFilename);
await rm(sourceDestination, { force: true });
await run(
  "zip",
  [
    "-q",
    "-r",
    sourceDestination,
    ".",
    "-x",
    ".git/*",
    "node_modules/*",
    "dist/*",
    "artifacts/*",
    "*.zip",
    "*/**.zip",
    ".DS_Store",
    "*/.DS_Store",
  ],
  resolve("."),
);
console.log(`Created ${sourceDestination}`);

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with status ${code}`));
    });
  });
}
