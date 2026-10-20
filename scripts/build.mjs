import { build, loadEnv } from "vite";
import { writeFile, readFile } from "node:fs/promises";
import { generateKeyPairSync, createHash } from "node:crypto";
const env = loadEnv("production", process.cwd(), "VITE_");
await build();
await build({
  configFile: false,
  define: {
    "import.meta.env.VITE_MICROSOFT_CLIENT_ID": JSON.stringify(
      env.VITE_MICROSOFT_CLIENT_ID || "",
    ),
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/background/worker.ts",
      formats: ["es"],
      fileName: () => "worker.js",
    },
  },
});
let key;
try {
  key = JSON.parse(await readFile("scripts/extension-key.json", "utf8")).key;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  key = pair.publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  await writeFile(
    "scripts/extension-key.json",
    JSON.stringify({ key }, null, 2) + "\n",
  );
}
const manifest = {
  manifest_version: 3,
  name: "Next Chapter — Application Tracker",
  version: "0.1.0",
  description:
    "A local-first application tracker with Gmail and Outlook email imports.",
  minimum_chrome_version: "120",
  key,
  permissions: ["storage", "identity", "alarms"],
  optional_host_permissions: [
    "https://gmail.googleapis.com/*",
    "https://graph.microsoft.com/*",
    "https://login.microsoftonline.com/*",
  ],
  chrome_url_overrides: { newtab: "index.html" },
  background: { service_worker: "worker.js", type: "module" },
  action: { default_title: "Open Next Chapter" },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'",
  },
};
if (env.VITE_GOOGLE_CLIENT_ID)
  manifest.oauth2 = {
    client_id: env.VITE_GOOGLE_CLIENT_ID,
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  };
await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const id = createHash("sha256")
  .update(Buffer.from(key, "base64"))
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
console.log(
  `Stable extension ID: ${id}\nMicrosoft redirect: https://${id}.chromiumapp.org/microsoft`,
);
