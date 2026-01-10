const { createAvatar } = require("@dicebear/core");
const { openPeeps } = require("@dicebear/collection");
const { createHash } = require("crypto");

function generateAvatar(pk) {
  const svg = createAvatar(openPeeps, {
    seed: createHash("sha256").update(pk).digest("hex"),
    scale: 50,
    backgroundColor: ["c5c8c6"],
  }).toString();
  return svg;
}

module.exports = { generateAvatar };
