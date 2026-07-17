const crypto = require("crypto");

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  if (!cookieHeader) return {};
  const cookies = {};
  cookieHeader.split(";").forEach((part) => {
    const [name, ...rest] = part.trim().split("=");
    if (!name) return;
    try {
      cookies[name] = decodeURIComponent(rest.join("=") || "");
    } catch {
      cookies[name] = "";
    }
  });
  return cookies;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

class AuthManager {
  constructor(authConfig = "") {
    this.cookieName = "hm_auth";
    this.sessionTtlMs =
      parseInt(process.env.WEB_AUTH_SESSION_TTL_MS, 10) || 12 * 60 * 60 * 1000;
    this.sessions = new Map();
    this.maxSessions = parseInt(process.env.WEB_AUTH_MAX_SESSIONS, 10) || 128;
    this.enabled = false;
    this.username = "";
    this.passwordHash = "";

    const normalized = (authConfig || "").trim();
    const separatorIndex = normalized.indexOf(":");
    if (separatorIndex <= 0) return;

    const username = normalized.slice(0, separatorIndex).trim();
    const password = normalized.slice(separatorIndex + 1).trim();
    if (!username || !password) return;
    if (password.length < 12) {
      console.warn(
        "Warning: WEB_AUTH password is shorter than the recommended 12 characters"
      );
    }

    this.enabled = true;
    this.username = username;
    this.passwordHash = sha256Hex(password);
  }

  _isSecureRequest(req) {
    return req.secure;
  }

  _getUserAgentHash(req) {
    return sha256Hex(req.headers["user-agent"] || "");
  }

  _cleanupExpiredSessions() {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(key);
      }
    }
  }

  _getSessionTokenFromReq(req) {
    const cookies = parseCookies(req);
    return cookies[this.cookieName] || "";
  }

  _setSessionCookie(res, req, token) {
    const isSecure = this._isSecureRequest(req);
    const maxAge = Math.max(1, Math.floor(this.sessionTtlMs / 1000));
    const flags = [
      `${this.cookieName}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${maxAge}`,
    ];
    if (isSecure) {
      flags.push("Secure");
    }
    res.setHeader("Set-Cookie", flags.join("; "));
  }

  _clearSessionCookie(res, req) {
    const isSecure = this._isSecureRequest(req);
    const flags = [
      `${this.cookieName}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      "Max-Age=0",
    ];
    if (isSecure) {
      flags.push("Secure");
    }
    res.setHeader("Set-Cookie", flags.join("; "));
  }

  createSession(req, res) {
    this._cleanupExpiredSessions();
    while (this.sessions.size >= this.maxSessions) {
      this.sessions.delete(this.sessions.keys().next().value);
    }
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(token);
    this.sessions.set(tokenHash, {
      expiresAt: Date.now() + this.sessionTtlMs,
      userAgentHash: this._getUserAgentHash(req),
    });
    this._setSessionCookie(res, req, token);
    return tokenHash;
  }

  clearSession(req, res) {
    const token = this._getSessionTokenFromReq(req);
    if (token) {
      const tokenHash = sha256Hex(token);
      this.sessions.delete(tokenHash);
    }
    this._clearSessionCookie(res, req);
  }

  isAuthenticated(req) {
    if (!this.enabled) return true;
    this._cleanupExpiredSessions();
    const token = this._getSessionTokenFromReq(req);
    if (!token) return false;
    const tokenHash = sha256Hex(token);
    const session = this.sessions.get(tokenHash);
    if (!session) return false;
    if (session.userAgentHash !== this._getUserAgentHash(req)) {
      this.sessions.delete(tokenHash);
      return false;
    }
    return session.expiresAt > Date.now();
  }

  verifyCredentials(username, password) {
    if (!this.enabled) return true;
    if (typeof username !== "string" || typeof password !== "string") return false;
    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();
    if (!normalizedUsername || !normalizedPassword) return false;
    if (normalizedUsername !== this.username) return false;

    const providedHash = sha256Hex(normalizedPassword);
    const expectedBuffer = Buffer.from(this.passwordHash, "hex");
    const providedBuffer = Buffer.from(providedHash, "hex");
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  }
}

module.exports = { AuthManager };
