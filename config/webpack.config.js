const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const { createManifest, supportedBrowsers } = require("./manifest");
const srcDir = path.join(__dirname, "..", "src");

module.exports = (_env = {}) => {
  const browser = _env.browser ?? "chrome";
  if (!supportedBrowsers.includes(browser)) {
    throw new Error(`Unsupported browser "${browser}". Expected one of: ${supportedBrowsers.join(", ")}`);
  }

  return {
    mode: "production",
    entry: {
      popup: path.join(srcDir, "popup.ts"),
      background: path.join(srcDir, "background.ts"),
      content_script: path.join(srcDir, "content_script.ts"),
    },
    output: {
      path: path.join(__dirname, "../dist", browser),
      filename: "js/[name].js",
      clean: true,
    },
    optimization: { splitChunks: false, runtimeChunk: false },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"],
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          {
            from: ".",
            to: ".",
            context: "public",
            globOptions: { ignore: ["**/manifest.json", "**/images/logo-options/**"] },
          },
          {
            from: path.join(__dirname, "manifest.base.json"),
            to: "manifest.json",
            transform: () => `${JSON.stringify(createManifest(browser), null, 2)}\n`,
          },
        ],
      }),
    ],
  };
};
