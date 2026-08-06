const assert = require("assert");
const crypto = require("crypto");
const { EventEmitter } = require("events");
const { SwarmManager } = require("../src/p2p/swarm");

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.writes = [];
  }

  write(data) {
    this.writes.push(data);
    return true;
  }

  destroy() {
    this.destroyed = true;
    this.emit("close");
  }
}

const keys = crypto.generateKeyPairSync("ed25519");
const identity = {
  id: "peer",
  username: "test",
  privateKey: keys.privateKey,
  encryptionPublicKey: "key",
  nonce: 1,
};

const handled = [];
const persistenceManager = {
  getPrimaryPublicKey: () => "core",
  replicate() {},
};

const manager = new SwarmManager(
  identity,
  { getSeq: () => 0 },
  { increment() {} },
  { handleMessage: (message, socket) => handled.push({ message, socket }) },
  () => {},
  () => {},
  null,
  persistenceManager
);
const realSwarm = manager.swarm;
manager.swarm = { connections: new Set() };

const socket = new FakeSocket();
manager.swarm.connections.add(socket);
manager.handleConnection(socket);

socket.emit("data", Buffer.alloc(16385, 0x80));
assert.strictEqual(socket.destroyed, false);

socket.emit("data", Buffer.from('{"type":"PING"}\n'));
assert.strictEqual(handled.length, 1);
assert.deepStrictEqual(handled[0].message, { type: "PING" });

socket.emit("data", Buffer.from('{"type"'));
socket.emit("data", Buffer.from(':"PING"}\n'));
assert.strictEqual(handled.length, 2);

realSwarm.destroy().then(() => console.log("p2p-transport: ok"));
