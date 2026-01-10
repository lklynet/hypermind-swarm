const crypto = require("crypto");

const getSwarmId = (name) => {
  if (!name || name.trim() === "") return 0;
  const normalized = name.trim().toLowerCase();
  const hash = crypto.createHash("sha256").update(normalized).digest();
  return (hash[0] % 255) + 1;
};

const createSwarmFilter = () => {
  const buffer = new Uint8Array(32);
  buffer[0] |= 1;
  return Buffer.from(buffer).toString("hex");
};

const hasSwarmSubscription = (filterHex, swarmId) => {
  if (!filterHex) return false;
  const buffer = Buffer.from(filterHex, "hex");
  const byteIndex = Math.floor(swarmId / 8);
  const bitIndex = swarmId % 8;
  return (buffer[byteIndex] & (1 << bitIndex)) !== 0;
};

module.exports = {
  getSwarmId,
  createSwarmFilter,
  hasSwarmSubscription,
};
