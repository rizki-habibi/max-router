const fs = require("node:fs");
const path = require("node:path");

const backendDir = path.resolve(__dirname, "..");
const sourceDir = path.join(backendDir, "open-sse");
const distDir = path.join(backendDir, "dist", "open-sse");

fs.rmSync(distDir, { recursive: true, force: true });
fs.cpSync(sourceDir, distDir, {
  recursive: true,
  filter(source) {
    return !source.includes(path.sep + "test" + path.sep) &&
      !source.endsWith(path.sep + "test") &&
      !source.endsWith(".log");
  },
});

console.log("Synced backend/open-sse -> backend/dist/open-sse");
