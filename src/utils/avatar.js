const { createHash } = require("crypto");

let _createAvatar = null;
let _openPeeps = null;

async function _initDicebear() {
  if (!_createAvatar) {
    const core = await import("@dicebear/core");
    const coll = await import("@dicebear/collection");
    _createAvatar = core.createAvatar;
    _openPeeps = coll.openPeeps;
  }
}

async function generateAvatar(pk) {
  await _initDicebear();
  return _createAvatar(_openPeeps, {
    seed: createHash("sha256").update(pk).digest("hex"),
    scale: 50,
    backgroundColor: [],
  }).toString();
}

module.exports = { generateAvatar };
