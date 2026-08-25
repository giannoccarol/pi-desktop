const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const source = path.join(projectRoot, 'icon.png');
const buildDirectory = path.join(projectRoot, 'build');
const destination = path.join(buildDirectory, 'icon.png');

function readPngMetadata(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('icon.png is not a valid PNG image');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25]
  };
}

if (fs.existsSync(source)) {
  const sourceBuffer = fs.readFileSync(source);
  const metadata = readPngMetadata(sourceBuffer);
  if (metadata.width < 512 || metadata.height < 512 || metadata.width !== metadata.height) {
    throw new Error('icon.png must be square and at least 512×512 pixels');
  }
  if (metadata.colorType !== 4 && metadata.colorType !== 6) {
    throw new Error('icon.png must include an alpha channel');
  }
  fs.mkdirSync(buildDirectory, { recursive: true });
  fs.copyFileSync(source, destination);
  console.log(`Prepared build/icon.png (${metadata.width}×${metadata.height}, alpha channel)`);
} else {
  // No icon.png yet (pi-desktop is pre-release) — create placeholder build dir
  // so electron-builder can still resolve buildResources. If you add an icon later
  // it will be validated strictly.
  fs.mkdirSync(buildDirectory, { recursive: true });
  console.log('No icon.png found, skipping icon validation (build dir ensured)');
}
