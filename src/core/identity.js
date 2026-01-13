const crypto = require("crypto");
const sodium = require("sodium-native");
const {
  generateScreenname,
  generatePersistentName,
} = require("../utils/name-generator");
const { MY_POW_PREFIX, DEVICE_PERSISTENCE } = require("../config/constants");
const { getMacAddress } = require("../utils/swarm-utils");

const generateIdentity = () => {
  let publicKey, privateKey, username;
  const mac = DEVICE_PERSISTENCE ? getMacAddress() : null;

  if (mac) {
    const seed = crypto.createHash("sha256").update(mac).digest();
    const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
    const pkcs8 = Buffer.concat([prefix, seed]);
    privateKey = crypto.createPrivateKey({
      key: pkcs8,
      format: "der",
      type: "pkcs8",
    });
    publicKey = crypto.createPublicKey(privateKey);
    username = generatePersistentName(mac);
  } else {
    const keys = crypto.generateKeyPairSync("ed25519");
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  }

  const id = publicKey.export({ type: "spki", format: "der" }).toString("hex");
  if (!username) {
    username = generateScreenname(id);
  }

  const curvePk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
  const curveSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);

  if (mac) {
    const encryptionSeed = crypto
      .createHash("sha256")
      .update(mac + "encryption")
      .digest();
    sodium.crypto_box_seed_keypair(curvePk, curveSk, encryptionSeed);
  } else {
    sodium.crypto_box_keypair(curvePk, curveSk);
  }

  let nonce = 0;
  while (true) {
    const hash = crypto
      .createHash("sha256")
      .update(id + nonce)
      .digest("hex");
    if (hash.startsWith(MY_POW_PREFIX)) break;
    nonce++;
  }

  return {
    publicKey,
    privateKey,
    id,
    nonce,
    username,
    encryptionPublicKey: curvePk.toString("hex"),
    encryptionPrivateKey: curveSk.toString("hex"),
  };
};

module.exports = { generateIdentity };
