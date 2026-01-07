const { LRUCache } = require("./lru");

class TweetStore {
  constructor(capacity = 1000) {
    this.cache = new LRUCache(capacity);
  }

  add(tweet) {
    if (!tweet || !tweet.id) return false;
    if (this.cache.has(tweet.id)) return false;

    this.cache.set(tweet.id, {
      ...tweet,
      likes: tweet.likes || 0,
      amplifiedBy: new Set(tweet.amplifiedBy || []),
      receivedAt: Date.now(),
    });
    return true;
  }

  like(id, userId) {
    const tweet = this.cache.get(id);
    if (!tweet) return false;

    // Ensure amplifiedBy is a Set (in case it was serialized/deserialized differently)
    if (!(tweet.amplifiedBy instanceof Set)) {
      tweet.amplifiedBy = new Set(tweet.amplifiedBy || []);
    }

    if (tweet.amplifiedBy.has(userId)) return false;

    tweet.amplifiedBy.add(userId);
    tweet.likes = (tweet.likes || 0) + 1;
    return true;
  }

  get(id) {
    return this.cache.get(id);
  }

  has(id) {
    return this.cache.has(id);
  }

  getAll() {
    const tweets = [];
    for (const [id, tweet] of this.cache.entries()) {
      // Convert Set to Array for JSON serialization
      tweets.push({
        ...tweet,
        amplifiedBy: Array.from(tweet.amplifiedBy || []),
      });
    }
    // Sort by timestamp descending (newest first)
    return tweets.sort((a, b) => b.timestamp - a.timestamp);
  }
}

module.exports = { TweetStore };
