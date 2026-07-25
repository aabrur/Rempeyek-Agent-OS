import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(desktop, "..", "..");
const source = path.join(root, "apps", "web", "public", "brand", "logo.webp");
const target = path.join(desktop, "assets", "icon.ico");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "rempeyek-icon-"));
const sizes = [16, 32, 48, 64, 128, 256];

try {
  const pngs = await Promise.all(sizes.map(async size => {
    const output = path.join(temporary, `icon-${size}.png`);
    await sharp(source)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: false,
      })
      .png()
      .toFile(output);
    return output;
  }));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, await pngToIco(pngs));
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
