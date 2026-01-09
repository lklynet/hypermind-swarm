const fs = require('fs');
const content = fs.readFileSync('/Users/leekelly/Sync/hypermind-swarm/public/style.css', 'utf8');

let stack = [];
let lines = content.split('\n');
let error = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') {
            stack.push({char, line: i + 1});
        } else if (char === '}') {
            if (stack.length === 0) {
                console.log(`Error: Unexpected '}' at line ${i + 1}`);
                error = true;
            } else {
                stack.pop();
            }
        }
    }
}

if (stack.length > 0) {
    console.log(`Error: Unclosed '{' at line ${stack[0].line}`);
    error = true;
}

if (!error) {
    console.log('Braces are balanced.');
}
