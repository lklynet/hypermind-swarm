const { signMessage, verifySignature, createPublicKey } = require("../../core/security");
const {
  MEGA_CATCHUP_BATCH_SIZE,
  MEGA_MAX_CATCHUP_MESSAGES,
} = require("../../config/constants");

class CatchupHandler {
  constructor(deps) {
    this.peerManager = deps.peerManager;
    this.diagnostics = deps.diagnostics;
    this.pingStore = deps.pingStore;
    this.relayCallback = deps.relayCallback;
    this.pingCallback = deps.pingCallback;
    this.persistenceManager = deps.persistenceManager;
    this.isMegaNode = deps.isMegaNode;
    this.identity = deps.identity;
    this.catchupSince = new Map();
    this.catchupMessageCount = new Map();
  }

  handleRequest(msg, sourceSocket) {
    if (!this.isMegaNode) return;

    const { id, since, cursor, sig } = msg;

    const signPayload = `catchup:request:${id}:${since}:${cursor || 0}`;
    const key = createPublicKey(id);
    if (!verifySignature(signPayload, sig, key)) {
      this.diagnostics.increment("invalidSig");
      return;
    }

    const batchSize = MEGA_CATCHUP_BATCH_SIZE;

    const { messages, cursor: nextCursor, hasMore: more } = this.pingStore.getMessagesSince(
      since,
      cursor,
      batchSize,
      null
    );

    let finalCursor = nextCursor;
    let finalHasMore = more;

    {
      const sessionKey = `${id}:${since}`;
      const totalSoFar = (this.catchupMessageCount.get(sessionKey) || 0) + messages.length;
      if (totalSoFar > MEGA_MAX_CATCHUP_MESSAGES || !finalHasMore) {
        this.catchupMessageCount.delete(sessionKey);
        if (totalSoFar > MEGA_MAX_CATCHUP_MESSAGES) {
          finalCursor = null;
          finalHasMore = false;
        }
      } else {
        this.catchupMessageCount.set(sessionKey, totalSoFar);
      }
    }

    const responseSignPayload = `catchup:response:${this.identity.id}:${finalCursor || 0}`;
    const responseSig = signMessage(responseSignPayload, this.identity.privateKey);

    const response = {
      type: "CATCHUP_RESPONSE",
      id: this.identity.id,
      messages,
      cursor: finalCursor,
      hasMore: finalHasMore,
      sig: responseSig,
    };

    const responseStr = JSON.stringify(response) + "\n";
    sourceSocket.write(responseStr);
    this.diagnostics.increment("bytesSent", responseStr.length);
  }

  handleResponse(msg, sourceSocket) {
    if (this.isMegaNode) return;

    const { id, messages, cursor, hasMore, sig } = msg;

    const responseSignPayload = `catchup:response:${id}:${cursor || 0}`;
    const key = createPublicKey(id);
    if (!verifySignature(responseSignPayload, sig, key)) {
      this.diagnostics.increment("invalidSig");
      return;
    }

    for (const pingMsg of messages) {
      if (pingMsg.type === "PING") {
        const isNew = this.pingStore.add(pingMsg);
        if (isNew) {
          if (this.pingCallback) {
            this.pingCallback(this.pingStore.serializePing(this.pingStore.get(pingMsg.id)));
          }
          const pingTtl = typeof pingMsg.ttl === "number" ? pingMsg.ttl : 10;
          if (pingTtl > 0) {
            this.relayCallback({ ...pingMsg, ttl: pingTtl - 1, hops: (pingMsg.hops || 0) }, sourceSocket);
          }
        }
      } else if (pingMsg.type === "AMPLIFY") {
        if (pingMsg.originalPing && !this.pingStore.has(pingMsg.originalPing.id)) {
          this.pingStore.add(pingMsg.originalPing);
        }
        const wasAmplified = this.pingStore.addAmplify(pingMsg.originalPing.id, pingMsg.amplifier, {
          username: pingMsg.username,
          timestamp: pingMsg.timestamp,
        });
        const updatedPing = this.pingStore.get(pingMsg.originalPing.id);
        if (updatedPing && this.pingCallback) {
          this.pingCallback(this.pingStore.serializePing(updatedPing));
        }
        if (wasAmplified) {
          const ampTtl = typeof pingMsg.ttl === "number" ? pingMsg.ttl : 10;
          if (ampTtl > 0) {
            this.relayCallback({ ...pingMsg, ttl: ampTtl - 1 }, sourceSocket);
          }
        }
      } else if (pingMsg.type === "COMMENT") {
        const wasCommentAdded = this.pingStore.addComment(pingMsg.pingId, pingMsg);
        const updatedPing = this.pingStore.get(pingMsg.pingId);
        if (updatedPing && this.pingCallback) {
          this.pingCallback(this.pingStore.serializePing(updatedPing));
        }
        if (wasCommentAdded) {
          const commentTtl = typeof pingMsg.ttl === "number" ? pingMsg.ttl : 6;
          if (commentTtl > 0) {
            this.relayCallback({ ...pingMsg, ttl: commentTtl - 1 }, sourceSocket);
          }
        }
      } else if (pingMsg.type === "QUOTE") {
        if (pingMsg.quotedPing && !this.pingStore.has(pingMsg.quotedPing.id)) {
          this.pingStore.add(pingMsg.quotedPing);
        }
        const wasNoteAdded = this.pingStore.addQuote(pingMsg.quoteOf, pingMsg);
        if (this.pingStore.has(pingMsg.id) && this.pingCallback) {
          this.pingCallback(this.pingStore.serializePing(this.pingStore.get(pingMsg.id)));
        }
        const updatedOriginal = this.pingStore.get(pingMsg.quoteOf);
        if (updatedOriginal && this.pingCallback) {
          this.pingCallback(this.pingStore.serializePing(updatedOriginal));
        }
        if (wasNoteAdded) {
          const quoteTtl = typeof pingMsg.ttl === "number" ? pingMsg.ttl : 10;
          if (quoteTtl > 0) {
            this.relayCallback({ ...pingMsg, ttl: quoteTtl - 1, hops: (pingMsg.hops || 0) }, sourceSocket);
          }
        }
      }
    }

    const sessionKey = sourceSocket.peerId
      ? `${sourceSocket.peerId}:catchup-since`
      : `${sourceSocket.remoteAddress}:catchup-since`;

    if (hasMore && cursor !== null) {
      const sinceValue = this.catchupSince.get(sessionKey);
      if (sinceValue !== undefined) {
        this.sendCatchupRequest(sourceSocket, sinceValue, cursor);
      }
    } else {
      this.catchupSince.delete(sessionKey);
    }

    this.diagnostics.increment("catchupBatchReceived");
  }

  sendCatchupRequest(socket, since, cursor = null) {
    if (this.isMegaNode) return;

    const sessionKey = socket.peerId
      ? `${socket.peerId}:catchup-since`
      : `${socket.remoteAddress}:catchup-since`;
    this.catchupSince.set(sessionKey, since);

    const signPayload = `catchup:request:${this.identity.id}:${since}:${cursor || 0}`;
    const sig = signMessage(signPayload, this.identity.privateKey);

    const request = {
      type: "CATCHUP_REQUEST",
      id: this.identity.id,
      since,
      cursor,
      sig,
    };

    const requestStr = JSON.stringify(request) + "\n";
    socket.write(requestStr);
    this.diagnostics.increment("bytesSent", requestStr.length);
  }
}

module.exports = { CatchupHandler };
