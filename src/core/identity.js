const crypto = require("crypto");
const sodium = require("sodium-native");
const { generateScreenname } = require("../utils/name-generator");
const { MY_POW_PREFIX } = require("../config/constants");

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

const generateIdentity = () => {
  let publicKey, privateKey, curvePk, curveSk;

  if (process.env.HYPERMIND_ID) {
    const seed = crypto
      .createHash("sha256")
      .update(process.env.HYPERMIND_ID)
      .digest();

    // Deterministic Ed25519
    const signPk = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const signSk = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    const signSeed = crypto
      .createHash("sha256")
      .update(seed)
      .update("sign")
      .digest();
    sodium.crypto_sign_seed_keypair(signPk, signSk, signSeed);

    publicKey = crypto.createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, signPk]),
      format: "der",
      type: "spki",
    });
    privateKey = crypto.createPrivateKey({
      key: Buffer.concat([PKCS8_PREFIX, signSeed]),
      format: "der",
      type: "pkcs8",
    });

    // Deterministic Curve25519
    curvePk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    curveSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    const boxSeed = crypto
      .createHash("sha256")
      .update(seed)
      .update("box")
      .digest();
    sodium.crypto_box_seed_keypair(curvePk, curveSk, boxSeed);
  } else {
    const keys = crypto.generateKeyPairSync("ed25519");
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;

    curvePk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    curveSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(curvePk, curveSk);
  }

  const id = publicKey.export({ type: "spki", format: "der" }).toString("hex");
  const username = generateScreenname(id);

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
