const baseManifest = require("./manifest.base.json");

const supportedBrowsers = ["chrome", "edge", "firefox"];

function createManifest(browser) {
  if (!supportedBrowsers.includes(browser)) {
    throw new Error(`Unsupported browser "${browser}". Expected one of: ${supportedBrowsers.join(", ")}`);
  }

  const manifestFamily = browser === "firefox" ? "firefox" : "chromium";
  const override = require(`./manifests/${manifestFamily}.json`);
  const manifest = structuredClone(baseManifest);

  Object.assign(manifest, override);

  return manifest;
}

module.exports = { createManifest, supportedBrowsers };
