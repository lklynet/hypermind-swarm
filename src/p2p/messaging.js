const {
  RATE_LIMIT_CLEANUP_INTERVAL,
  RATE_LIMIT_WINDOW_MS,
  MEGA_NODE,
} = require("../config/constants");
const { BloomFilterManager } = require("../state/bloom");
const { validateMessage } = require("./validation/message-validator");
const { HeartbeatHandler } = require("./handlers/heartbeat-handler");
const { LeaveHandler } = require("./handlers/leave-handler");
const { PingHandler } = require("./handlers/ping-handler");
const { AmplifyHandler } = require("./handlers/amplify-handler");
const { CommentHandler } = require("./handlers/comment-handler");
const { QuoteHandler } = require("./handlers/quote-handler");
const { CatchupHandler } = require("./handlers/catchup-handler");

class MessageHandler {
  constructor(
    peerManager,
    diagnostics,
    pingStore,
    relayCallback,
    broadcastCallback,
    pingCallback,
    systemMessageFn,
    persistenceManager,
    identity
  ) {
    this.peerManager = peerManager;
    this.diagnostics = diagnostics;
    this.pingStore = pingStore;
    this.relayCallback = relayCallback;
    this.broadcastCallback = broadcastCallback;
    this.pingCallback = pingCallback;
    this.systemMessageFn = systemMessageFn;
    this.persistenceManager = persistenceManager;
    this.bloomFilter = new BloomFilterManager();
    this.bloomFilter.start();
    this.rateLimits = new Map();
    this.rateLimitCleanup = setInterval(() => {
      const now = Date.now();
      for (const [author, data] of this.rateLimits.entries()) {
        if (now - data.windowStart > RATE_LIMIT_WINDOW_MS * 6) {
          this.rateLimits.delete(author);
        }
      }
    }, RATE_LIMIT_CLEANUP_INTERVAL);
    this.getSwarmFilter = () => null;

    const isMegaNode = MEGA_NODE;

    const deps = {
      peerManager,
      diagnostics,
      pingStore,
      bloomFilter: this.bloomFilter,
      rateLimits: this.rateLimits,
      relayCallback,
      broadcastCallback,
      pingCallback,
      systemMessageFn,
      persistenceManager,
      isMegaNode,
      identity,
    };

    this.heartbeatHandler = new HeartbeatHandler(deps);
    this.leaveHandler = new LeaveHandler(deps);
    this.pingHandler = new PingHandler(deps);
    this.amplifyHandler = new AmplifyHandler(deps);
    this.commentHandler = new CommentHandler(deps);
    this.quoteHandler = new QuoteHandler(deps);
    this.catchupHandler = new CatchupHandler(deps);

    this.heartbeatHandler.setRequestCatchup((socket) => {
      const stats = this.pingStore.getStats();
      const since = stats.oldestTimestamp || Date.now() - 3600000;
      this.catchupHandler.sendCatchupRequest(socket, since);
    });
  }

  setGetSwarmFilter(fn) {
    this.getSwarmFilter = fn;
  }

  handleMessage(msg, sourceSocket) {
    if (!validateMessage(msg)) {
      this.diagnostics.increment("invalidMessages");
      return;
    }

    switch (msg.type) {
      case "HEARTBEAT":
        this.heartbeatHandler.handle(msg, sourceSocket);
        break;
      case "PING":
        this.pingHandler.handle(msg, sourceSocket);
        break;
      case "LEAVE":
        this.leaveHandler.handle(msg, sourceSocket);
        break;
      case "AMPLIFY":
        this.amplifyHandler.handle(msg, sourceSocket);
        break;
      case "QUOTE":
        this.quoteHandler.handle(msg, sourceSocket);
        break;
      case "COMMENT":
        this.commentHandler.handle(msg, sourceSocket);
        break;
      case "CATCHUP_REQUEST":
        this.catchupHandler.handleRequest(msg, sourceSocket);
        break;
      case "CATCHUP_RESPONSE":
        this.catchupHandler.handleResponse(msg, sourceSocket);
        break;
    }
  }

  cleanup() {
    if (this.rateLimitCleanup) {
      clearInterval(this.rateLimitCleanup);
      this.rateLimitCleanup = null;
    }
    this.bloomFilter.stop();
    this.rateLimits.clear();
  }
}

module.exports = { MessageHandler, validateMessage };
