const { createAvatar } = require("@dicebear/core");
const { openPeeps } = require("@dicebear/collection");
const { createHash } = require("crypto");

function generateAvatar(pk) {
  const svg = createAvatar(openPeeps, {
    seed: createHash("sha256").update(pk).digest("hex"),
    scale: 50, // 50 px face
    backgroundColor: ["b6e3f4"], // DiceBear v5+ uses array for colors usually, checking compat
  }).toString();
  return svg;
}

module.exports = { generateAvatar };
