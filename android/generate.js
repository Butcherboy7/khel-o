// Regenerates the Android TWA project in this folder from twa-manifest.json.
// Normally you run `bubblewrap update` instead; this script exists because the
// first generation had to read icons from a local server (ICON_BASE) before
// they were live on khel-o.com. Usage: ICON_BASE=http://127.0.0.1:8765 node generate.js
const path = require('path');
const core = require(path.join(process.env.APPDATA, 'npm/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core'));
const { TwaManifest, TwaGenerator, ConsoleLog } = core;
const fs = require('fs');
const { computeChecksum } = require(path.join(process.env.APPDATA, 'npm/node_modules/@bubblewrap/cli/dist/lib/cmds/shared'));

(async () => {
  const file = path.join(__dirname, 'twa-manifest.json');
  const manifest = await TwaManifest.fromFile(file);
  const base = process.env.ICON_BASE;
  if (base) {
    const swap = (u) => u && u.replace('https://khel-o.com', base);
    manifest.iconUrl = swap(manifest.iconUrl);
    manifest.maskableIconUrl = swap(manifest.maskableIconUrl);
    manifest.shortcuts.forEach((s) => {
      s.chosenIconUrl = swap(s.chosenIconUrl);
      s.chosenMaskableIconUrl = swap(s.chosenMaskableIconUrl);
    });
  }
  const err = manifest.validate();
  if (err) throw new Error(err);
  await new TwaGenerator().createTwaProject(__dirname, manifest, new ConsoleLog('generate'));
  // What `bubblewrap update` writes: tells `bubblewrap build` the project matches twa-manifest.json.
  fs.writeFileSync(path.join(__dirname, 'manifest-checksum.txt'), computeChecksum(fs.readFileSync(file)));
  console.log('Android project generated in', __dirname);
})().catch((e) => { console.error(e); process.exit(1); });
