import { mkdir, rm, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const releaseDir = join(root, "release");
const zipPath = join(releaseDir, "productivity-setup-web.zip");
const notesPath = join(releaseDir, "README.txt");

await mkdir(releaseDir, { recursive: true });
await rm(zipPath, { force: true });

await writeFile(
  notesPath,
  [
    "Productivity Setup web build",
    "",
    "This zip contains the production web app in the dist folder.",
    "",
    "To run locally:",
    "1. Unzip productivity-setup-web.zip.",
    "2. Serve the dist folder with any static web server.",
    "3. Open the local server URL in your browser.",
    "",
    "Example:",
    "  npx serve dist",
    "",
    "Opening index.html directly from the file system is not recommended because browser module and asset rules vary.",
    "",
  ].join("\n"),
);

const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";

try {
  execFileSync(
    powershell,
    [
      "-NoProfile",
      "-Command",
      [
        "$ErrorActionPreference = 'Stop'",
        "$items = @('dist', 'release/README.txt')",
        "Compress-Archive -Path $items -DestinationPath 'release/productivity-setup-web.zip' -Force",
      ].join("; "),
    ],
    { cwd: root, stdio: "inherit" },
  );
} catch (error) {
  const output = createWriteStream(zipPath);
  output.end();
  throw new Error(`Failed to create zip package. Make sure PowerShell is available. ${error.message}`);
}

console.log(`Created ${zipPath}`);
