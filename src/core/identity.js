const crypto = require("crypto");
const sodium = require("sodium-native");
const { generateScreenname } = require("../utils/name-generator");
const { MY_POW_PREFIX } = require("../config/constants");

const generateIdentity = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const id = publicKey.export({ type: "spki", format: "der" }).toString("hex");
  const username = generateScreenname(id);

  const curvePk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
  const curveSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_box_keypair(curvePk, curveSk);

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
