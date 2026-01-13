const { createAvatar } = require("@dicebear/core");
const { openPeeps } = require("@dicebear/collection");
const { createHash } = require("crypto");

const PALETTE = [
  "8c4f4a",
  "57553c",
  "a17e3e",
  "65788f",
  "85678f",
  "718062",
  "c8b491"
];

function getColorFromId(id) {
  if (!id) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

function generateAvatar(pk) {
  const backgroundColor = getColorFromId(pk + "pfp");
  const svg = createAvatar(openPeeps, {
    seed: createHash("sha256").update(pk).digest("hex"),
    scale: 50,
    backgroundColor: [backgroundColor],
  }).toString();
  return svg;
}

module.exports = { generateAvatar };
