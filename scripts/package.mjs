import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Package only the built extension; source, local configuration and user data
// never enter the staging directory. Run after the production build.
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
if (manifest.manifest_version !== 3 || manifest.version !== "0.1.0")
  throw new Error("Expected the built v1 extension (0.1.0).");
const allowed = ["assets", "index.html", "manifest.json", "worker.js"];
for (const entry of await readdir("dist")) {
  if (!allowed.includes(entry))
    throw new Error(
      `Unexpected build output: ${entry}. Review before packaging.`,
    );
}
const stage = await mkdtemp(join(tmpdir(), "next-chapter-package-"));
const output = resolve("release");
const filename = `next-chapter-v${manifest.version}.zip`;
try {
  for (const entry of allowed)
    await cp(join("dist", entry), join(stage, entry), { recursive: true });
  await cp("RELEASE.md", join(stage, "INSTALL.md"));
  await mkdir(output, { recursive: true });
  const archive = join(output, filename);
  await rm(archive, { force: true });
  execFileSync("zip", ["-q", "-r", archive, "."], { cwd: stage });
  const hash = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  await writeFile(join(output, "SHA256SUMS.txt"), `${hash}  ${filename}\n`);
  console.log(`Created ${archive}\nSHA-256: ${hash}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
