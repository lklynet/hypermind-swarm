const crypto = require("crypto");
const TOPIC_NAME = process.env.TOPIC_NAME || "hypermind-swarm-v1";
const TOPIC = crypto.createHash("sha256").update(TOPIC_NAME).digest();
const MY_POW_PREFIX = "00000";
const VERIFICATION_POW_PREFIX = "0000";
const MAX_PEERS = parseInt(process.env.MAX_PEERS) || 100000;
const MAX_MESSAGE_SIZE = parseInt(process.env.MAX_MESSAGE_SIZE) || 2048;
const MAX_RELAY_HOPS = parseInt(process.env.MAX_RELAY_HOPS) || 10;
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS) || 50;
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL) || 30000;
const CONNECTION_ROTATION_INTERVAL = parseInt(process.env.CONNECTION_ROTATION_INTERVAL) || 300000;
const PEER_TIMEOUT = parseInt(process.env.PEER_TIMEOUT) || 45000;
const BROADCAST_THROTTLE = 1000;
const DIAGNOSTICS_INTERVAL = 10000;
const PORT = process.env.PORT || 3000;
const CHAT_RATE_LIMIT = parseInt(process.env.CHAT_RATE_LIMIT) || 5000;
const VISUAL_LIMIT = parseInt(process.env.VISUAL_LIMIT) || 500;

module.exports = {
  TOPIC_NAME,
  TOPIC,
  MY_POW_PREFIX,
  VERIFICATION_POW_PREFIX,
  MAX_PEERS,
  MAX_MESSAGE_SIZE,
  MAX_RELAY_HOPS,
  MAX_CONNECTIONS,
  HEARTBEAT_INTERVAL,
  CONNECTION_ROTATION_INTERVAL,
  PEER_TIMEOUT,
  BROADCAST_THROTTLE,
  DIAGNOSTICS_INTERVAL,
  PORT,
  CHAT_RATE_LIMIT,
  VISUAL_LIMIT,
};
