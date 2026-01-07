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
            receivedAt: Date.now()
        });
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
            tweets.push(tweet);
        }
        // Sort by timestamp descending (newest first)
        return tweets.sort((a, b) => b.timestamp - a.timestamp);
    }
}

module.exports = { TweetStore };
