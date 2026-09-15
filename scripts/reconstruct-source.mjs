import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const OWNER = "blinkzdlfx-cell";
const REPO = "Beulah-foods";
const REF = "main";
const API_TREE = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${REF}?recursive=1`;
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${REF}`;

// Staging keeps its own documentation and clean migration chain. Historical
// production migrations are evidence only and are intentionally excluded.
const EXCLUDED = [
  /^\.git\//,
  /^docs\//,
  /^supabase\/migrations\//,
  /^\.github\/workflows\//,
  /^wrangler\.toml$/,
];

function excluded(path) {
  return EXCLUDED.some((pattern) => pattern.test(path));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub request failed ${response.status}: ${url}`);
  return response.json();
}

async function main() {
  const treeResponse = await fetchJson(API_TREE);
  const files = (treeResponse.tree || []).filter(
    (entry) => entry.type === "blob" && !excluded(entry.path),
  );

  console.log(`Reconstructing ${files.length} production source files into this working tree.`);

  for (const entry of files) {
    const response = await fetch(`${RAW_BASE}/${entry.path}`);
    if (!response.ok) throw new Error(`Source download failed ${response.status}: ${entry.path}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const destination = join(process.cwd(), entry.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    console.log(`copied ${entry.path}`);
  }

  console.log("Source reconstruction complete.");
  console.log("Next: configure staging Supabase/Worker values and build the clean migration chain.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
