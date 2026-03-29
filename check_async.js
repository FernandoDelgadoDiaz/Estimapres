const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');

// Find all function declarations (including arrow functions)
const functionRegex = /(async\s+)?(function\s+\w+\s*\([^)]*\)|const\s+\w+\s*=\s*(async\s*)?\([^)]*\)|\(\s*\)\s*=>|async\s*\([^)]*\)\s*=>)/g;
let match;
let functions = [];
let lastIndex = 0;

while ((match = functionRegex.exec(content)) !== null) {
    functions.push({
        start: match.index,
        end: null, // will find later
        text: match[0],
        isAsync: match[1] !== undefined || match[3] !== undefined || match[0].includes('async')
    });
}

// For each function, find its body end (simplistic: next matching '}' at same brace level)
let braceLevel = 0;
let inFunction = -1;
let functionEnds = [];

for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
        braceLevel++;
        if (inFunction === -1) {
            // Check if we're at a function start
            for (let j = 0; j < functions.length; j++) {
                if (functions[j].start <= i && functions[j].end === null) {
                    inFunction = j;
                    break;
                }
            }
        }
    } else if (content[i] === '}') {
        braceLevel--;
        if (braceLevel === 0 && inFunction !== -1) {
            functions[inFunction].end = i;
            inFunction = -1;
        }
    }
}

// Now find await inside each function
for (const func of functions) {
    if (func.end === null) continue;
    const body = content.substring(func.start, func.end + 1);
    if (body.includes('await')) {
        console.log(`Function ${func.text.substring(0, 50)} ${func.isAsync ? 'IS async' : 'NOT async'}`);
        // Find lines with await
        const lines = body.split('\n');
        lines.forEach((line, idx) => {
            if (line.includes('await')) {
                console.log(`  Line contains await: ${line.trim().substring(0, 80)}`);
            }
        });
        console.log('---');
    }
}

// Also check for any await not inside any function
console.log('\nChecking for await outside functions...');
// Simple check: await not between function start and end
const allText = content;
const awaitRegex = /await/g;
let awaitMatch;
while ((awaitMatch = awaitRegex.exec(allText)) !== null) {
    const pos = awaitMatch.index;
    let inside = false;
    for (const func of functions) {
        if (func.start <= pos && pos <= func.end) {
            inside = true;
            break;
        }
    }
    if (!inside) {
        // Get line number
        const linesUpTo = allText.substring(0, pos).split('\n');
        const lineNum = linesUpTo.length;
        const line = linesUpTo[linesUpTo.length - 1] + allText.substring(pos, allText.indexOf('\n', pos));
        console.log(`Await outside function at line ~${lineNum}: ${line.trim().substring(0, 100)}`);
    }
}