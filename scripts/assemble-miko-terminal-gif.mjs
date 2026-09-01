import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import GIFEncoder from 'gif-encoder-2';
import sharp from 'sharp';

const frameDir = process.argv[2];
const output = path.resolve(process.argv[3] ?? 'docs/assets/miko-terminal-demo.gif');
const poster = output.replace(/\.gif$/i, '-poster.png');

if (!frameDir || !existsSync(frameDir)) {
  process.stderr.write('Usage: node scripts/assemble-miko-terminal-gif.mjs <frame-dir> [output.gif]\n');
  process.exit(1);
}

const files = readdirSync(frameDir)
  .filter((name) => /^frame-\d+\.png$/i.test(name))
  .sort()
  .map((name) => path.join(frameDir, name));

if (files.length !== 8) {
  throw new Error(`Expected 8 captured Miko frames, found ${files.length}.`);
}

// Coordinates come from the 1280px-wide live-demo capture. The terminal panel
// itself is a Reddit-friendly 4:5 portrait and already contains Miko branding,
// progress, controls, and the real replay copy.
const crop = { left: 133, top: 706, width: 674, height: 809 };
const delays = [650, 1050, 1050, 1050, 1050, 1200, 1200, 2400];
const rendered = [];

for (const file of files) {
  rendered.push(await sharp(file)
    .extract(crop)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true }));
}

mkdirSync(path.dirname(output), { recursive: true });
const encoder = new GIFEncoder(crop.width, crop.height, 'neuquant', true);
encoder.setRepeat(0);
encoder.setQuality(12);
encoder.start();

for (let index = 0; index < rendered.length; index += 1) {
  encoder.setDelay(delays[index]);
  encoder.addFrame(new Uint8Array(rendered[index].data));
}

encoder.finish();
const gif = encoder.out.getData();
writeFileSync(output, gif);

await sharp(files.at(-1)).extract(crop).png().toFile(poster);

process.stdout.write(
  `Wrote ${output} (${(gif.length / 1024 / 1024).toFixed(2)} MB) and ${poster}\n`,
);
