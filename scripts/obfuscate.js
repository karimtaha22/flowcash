// Post-build step (see "postbuild" in package.json): obfuscates the already
// -minified client JS Next.js just produced, on top of the standard
// minification it does by default. This is what item 6 of the security plan
// ("تشويش وضغط كود الواجهة") asks for beyond plain minification — makes
// "View Source" meaningfully harder to read without touching any server code.
//
// Settings are DELIBERATELY conservative:
//   - only local variable/function names inside each already-bundled chunk
//     are renamed (renameGlobals stays false) — module boundaries and
//     exports are untouched, so cross-chunk references still work.
//   - no controlFlowFlattening / selfDefending / debugProtection: these are
//     the javascript-obfuscator features most likely to break a framework
//     runtime (React hydration, Turbopack's chunk loader) or fight the
//     strict CSP already in next.config.ts (debugProtection uses timing
//     tricks that read like a debugger-detection eval loop).
//   - runs against every file Next.js emitted under .next/static/chunks —
//     Turbopack gives every chunk (including React/Next internals) an
//     opaque hashed filename with no reliable way to tell "our code" apart
//     from vendor code, so there's nothing meaningful to exclude by name.
//
// If a deploy ever breaks after this step, delete the "postbuild" line in
// package.json — the app works identically without it, just more readable
// in View Source.
const fs = require("fs");
const path = require("path");
const JavaScriptObfuscator = require("javascript-obfuscator");

const CHUNKS_DIR = path.join(__dirname, "..", ".next", "static", "chunks");

const OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  selfDefending: false,
  stringArray: true,
  stringArrayThreshold: 0.5,
  splitStrings: false,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
};

function walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (entry.isFile() && entry.name.endsWith(".js") && !entry.name.endsWith(".map.js")) out.push(full);
  }
  return out;
}

function main() {
  if (!fs.existsSync(CHUNKS_DIR)) {
    console.log("[obfuscate] .next/static/chunks not found — skipping (did `next build` run?)");
    return;
  }

  const files = walk(CHUNKS_DIR);
  let ok = 0;
  let skipped = 0;

  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    try {
      const result = JavaScriptObfuscator.obfuscate(code, OPTIONS).getObfuscatedCode();
      fs.writeFileSync(file, result);
      ok++;
    } catch (err) {
      // best-effort: leave the original (already-minified) file untouched
      // rather than risk shipping a broken chunk over a fully-obfuscated one.
      console.warn(`[obfuscate] skipped ${path.relative(CHUNKS_DIR, file)}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`[obfuscate] done — ${ok} chunk(s) obfuscated, ${skipped} skipped, out of ${files.length} total.`);
}

main();
