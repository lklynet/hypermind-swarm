const adjectives = require("./adjectives.json");
const nouns = require("./nouns.json");

const hashStr = (str) => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return hash >>> 0;
};

class SeededRandom {
    constructor(seedStr) {
        this.seed = hashStr(seedStr);
    }

    next() {
        const x = Math.sin(this.seed++) * 10000;
        return x - Math.floor(x);
    }

    range(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
    
    bool(p = 0.5) {
        return this.next() < p;
    }
    
    pick(array) {
        return array[this.range(0, array.length - 1)];
    }
}

const toLeet = (str, rng) => {
    const map = {
        'a': '4', 'e': '3', 'i': '1', 'o': '0', 's': '5', 't': '7'
    };
    
    return str.split('').map(char => {
        const lower = char.toLowerCase();

        if (map[lower] && rng.bool(0.5)) {
            return map[lower];
        }

        if (rng.bool(0.3)) {
            return char.toUpperCase();
        }
        return char;
    }).join('');
};

const generateScreenname = (id) => {
    if (!id) return "Guest_" + Math.floor(Math.random() * 1000);
    
    const rng = new SeededRandom(id);
    
    const adj = rng.pick(adjectives);
    const noun = rng.pick(nouns);
    
    let name = "";
    
    const strategy = rng.range(0, 2);
    
    if (strategy === 0) {
        name = `${adj}_${noun}`;
    } else if (strategy === 1) {
        name = `${adj}${noun.charAt(0).toUpperCase() + noun.slice(1)}`;
    } else {
        name = `${adj.toUpperCase()}_${noun}`;
    }
    
    if (rng.bool(0.4)) {
        name = toLeet(name, rng);
    }
    
    const wrapStrategy = rng.range(0, 4);
    if (wrapStrategy === 0) {
        name = `xX${name}Xx`;
    } else if (wrapStrategy === 1) {
        name = `_${name}_`;
    } else if (wrapStrategy === 2) {

        name = `${name}${rng.range(1, 999)}`;
    }
    
    return name;
};

module.exports = { generateScreenname };
