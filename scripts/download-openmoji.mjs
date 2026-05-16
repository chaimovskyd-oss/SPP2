/**
 * Download OpenMoji SVG assets for SPP2 emoji library.
 *
 * Usage:  node scripts/download-openmoji.mjs
 *
 * Downloads all emoji SVGs used in src/data/openmoji.ts into:
 *   public/assets/openmoji/{code}.svg
 *
 * After running this script, the app will load emojis from local files
 * and work fully offline.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "assets", "openmoji");

const CDN_BASE = "https://openmoji.org/data/color/svg";

// All emoji codes from src/data/openmoji.ts
const EMOJI_CODES = [
  // Favorites
  "2B50","2728","2764","1F525","1F308","1F389","1F381","1F382","1F3C6","1F451",
  "1F33B","1F339","1F388","1F4F7","1F4AF",
  // Smileys
  "1F600","1F601","1F602","1F923","1F604","1F605","1F609","1F60A","1F970",
  "1F60D","1F929","1F618","1F60B","1F92A","1F917","1F914","1F92B","1F60E",
  "1F913","1F973","1F920","1F634","1F971","1F637","1F912","1F976","1F975",
  "1F92F","1F622","1F62D","1F621","1F633","1F628","1F632","1F97A","1F47B",
  "1F47D","1F4A9","1F921","1F480","1F608","1F47C","1F916","1F44F","1F44D",
  "1F44E","1F44B","1F44C","270B","1F4AA","1F64F","1F440",
  // Hearts
  "1F9E1","1F49B","1F49A","1F499","1F49C","1F5A4","1F90D","1F494","1F495",
  "1F49E","1F493","1F497","1F496","1F498","1F49D","1F49F",
  // Celebration
  "1F38A","1F393","1F31F",
  // Animals
  "1F436","1F431","1F430","1F98A","1F43B","1F43C","1F428","1F42F","1F981",
  "1F42E","1F437","1F438","1F435","1F648","1F649","1F64A","1F414","1F427",
  "1F426","1F985","1F989","1F43A","1F434","1F984","1F41D","1F98B","1F41E",
  "1F41F","1F42C","1F40B","1F988","1F422","1F40D","1F996","1F409","1F418",
  "1F992","1F993","1F419","1F980",
  // Food
  "1F34E","1F34B","1F347","1F353","1F352","1F349","1F34C","1F34D","1F951",
  "1F33D","1F355","1F354","1F32E","1F363","1F35C","1F35D","1F372","1F37F",
  "1F369","1F36A","1F36B","1F36D","1F368","1F370","2615","1F375","1F9C3",
  "1F95B","1F37A","1F37E","1F95A","1F9C0","1F35E",
  // Objects
  "1F4F1","1F4BB","1F4F9","1F4FA","1F3A7","1F3A4","1F3B8","1F3B9","1F941",
  "1F3A8","270F","1F58A","1F4D3","1F4DA","1F4D6","2702","1F4CE","1F4CC",
  "1F4A1","1F50D","1F512","1F511","1F528","1F527","1F4B0","1F4B3","1F4E7",
  "1F4E3","23F0","23F3","1F48E","1F48D","1F484",
  // Symbols
  "2705","274C","2753","2757","1F534","1F7E0","1F7E1","1F7E2","1F535","1F7E3",
  "26A1","267B","262E","267E","26D4","26A0","1F514","1F3B5","2747","2693",
  // Weather
  "2600","26C5","2601","1F327","26C8","1F328","2744","26C4","1F4A8","1F32A",
  "1F32B","1F30A","1F4A7","2614","1F31E","1F319",
  // Travel
  "1F697","1F68C","1F3CE","1F691","1F692","1F69A","2708","1F680","1F681",
  "26F5","1F6A2","1F682","1F6B2","1F6F4","1F5FA","1F30D","1F9ED","1F9F3",
  "1F6C2","1F3D6","26F0","26FA","1F3DE","1F3D9",
];

// Deduplicate
const unique = [...new Set(EMOJI_CODES)];

async function downloadEmoji(code) {
  const url = `${CDN_BASE}/${code}.svg`;
  const dest = path.join(OUT_DIR, `${code}.svg`);
  if (fs.existsSync(dest)) return { code, status: "skipped" };
  try {
    const res = await fetch(url);
    if (!res.ok) return { code, status: "error", reason: `HTTP ${res.status}` };
    const text = await res.text();
    fs.writeFileSync(dest, text, "utf8");
    return { code, status: "ok" };
  } catch (err) {
    return { code, status: "error", reason: err.message };
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Downloading ${unique.length} emoji SVGs into ${OUT_DIR}\n`);

  const BATCH = 10;
  let ok = 0, skipped = 0, errors = 0;

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(downloadEmoji));
    for (const r of results) {
      if (r.status === "ok") { ok++; process.stdout.write("✓"); }
      else if (r.status === "skipped") { skipped++; process.stdout.write("."); }
      else { errors++; process.stdout.write("✗"); console.error(`\n  ${r.code}: ${r.reason}`); }
    }
  }

  console.log(`\n\nDone: ${ok} downloaded, ${skipped} skipped, ${errors} errors.`);
  if (ok + skipped === unique.length) {
    console.log("All emoji assets ready for offline use.");
  }
}

main().catch(console.error);
