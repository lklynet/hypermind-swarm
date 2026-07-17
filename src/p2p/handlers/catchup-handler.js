const {
  compactTransportMessage,
  signProtocolMessage,
  verifyProtocolMessage,
} = require("../validation/message-security");
const {
  MEGA_CATCHUP_BATCH_SIZE,
  MEGA_MAX_CATCHUP_MESSAGES,
  MAX_CATCHUP_MESSAGE_SIZE,
} = require("../../config/constants");

const LEGACY_SOCKET_PAYLOAD_LIMIT = 16 * 1024;

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
    this.catchupMessageCount = new WeakMap();
    this.pendingRequests = new WeakMap();
  }

  handleRequest(msg, sourceSocket) {
    if (!this.isMegaNode) return;

    const { id, since, cursor } = msg;
    if (!sourceSocket.peerId || sourceSocket.peerId !== id) return;
    let session = this.catchupMessageCount.get(sourceSocket);
    if (cursor === null) {
      session = { since, total: 0, expectedCursor: null };
    } else if (!session || session.since !== since || session.expectedCursor !== cursor) {
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

    session.total += messages.length;
    if (session.total > MEGA_MAX_CATCHUP_MESSAGES) {
      finalCursor = null;
      finalHasMore = false;
    }

    const responseMessages = messages.map(compactTransportMessage);
    while (
      responseMessages.length > 1 &&
      Buffer.byteLength(JSON.stringify(responseMessages), "utf8") >
        Math.min(MAX_CATCHUP_MESSAGE_SIZE, LEGACY_SOCKET_PAYLOAD_LIMIT) - 1024
    ) {
      responseMessages.pop();
      finalCursor = (cursor || 0) + responseMessages.length;
      finalHasMore = true;
    }

    if (finalHasMore && finalCursor !== null) {
      session.expectedCursor = finalCursor;
      this.catchupMessageCount.set(sourceSocket, session);
    } else {
      this.catchupMessageCount.delete(sourceSocket);
    }

    const response = signProtocolMessage({
      type: "CATCHUP_RESPONSE",
      id: this.identity.id,
      messages: responseMessages,
      cursor: finalCursor,
      hasMore: finalHasMore,
    }, this.identity.privateKey);

    const responseStr = JSON.stringify(response) + "\n";
    sourceSocket.write(responseStr);
    this.diagnostics.increment("bytesSent", responseStr.length);
  }

  handleResponse(msg, sourceSocket) {
    if (this.isMegaNode) return;

    const { id, messages, cursor, hasMore } = msg;
    const pending = this.pendingRequests.get(sourceSocket);
    if (!pending || !sourceSocket.peerId || sourceSocket.peerId !== id) return;
    this.pendingRequests.delete(sourceSocket);

    for (const rawMessage of messages) {
      const pingMsg = compactTransportMessage(rawMessage);
      if (!verifyProtocolMessage(pingMsg)) {
        this.diagnostics.increment("invalidMessages");
        continue;
      }
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

    const request = signProtocolMessage({
      type: "CATCHUP_REQUEST",
      id: this.identity.id,
      since,
      cursor,
    }, this.identity.privateKey);

    this.pendingRequests.set(socket, { since, cursor, createdAt: Date.now() });

    const requestStr = JSON.stringify(request) + "\n";
    socket.write(requestStr);
    this.diagnostics.increment("bytesSent", requestStr.length);
  }
}

module.exports = { CatchupHandler };
