const crypto = require("crypto");

/**
 * Calculates the Swarm ID from a topic name.
 * 0 is reserved for Global.
 * Maps name to 1-255.
 * @param {string} name
 * @returns {number}
 */
const getSwarmId = (name) => {
  if (!name || name.trim() === "") return 0; // Global
  const normalized = name.trim().toLowerCase();
  const hash = crypto.createHash("sha256").update(normalized).digest();
  // Use first byte, mod 255 + 1 to get range 1-255
  return (hash[0] % 255) + 1;
};

/**
 * Creates a default subscription filter (Global only).
 * Returns a 32-byte hex string representing 256 bits.
 * @returns {string}
 */
const createSwarmFilter = () => {
  const buffer = new Uint8Array(32);
  // Set bit 0 (Global)
  buffer[0] |= 1;
  return Buffer.from(buffer).toString("hex");
};

/**
 * Updates the filter to include/exclude a swarm ID.
 * @param {string} filterHex
 * @param {number} swarmId
 * @param {boolean} join
 * @returns {string}
 */
const updateSwarmFilter = (filterHex, swarmId, join = true) => {
  const buffer = Buffer.from(filterHex, "hex");
  const byteIndex = Math.floor(swarmId / 8);
  const bitIndex = swarmId % 8;

  if (join) {
    buffer[byteIndex] |= 1 << bitIndex;
  } else {
    buffer[byteIndex] &= ~(1 << bitIndex);
  }
  return buffer.toString("hex");
};

/**
 * Checks if a filter includes a swarm ID.
 * @param {string} filterHex
 * @param {number} swarmId
 * @returns {boolean}
 */
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
  updateSwarmFilter,
  hasSwarmSubscription,
};
