/**
 * Tokenizes a PI AF Analysis Expression and tracks character coordinates.
 * @param {string} input 
 * @returns {Array<{type: string, value: string, quote?: string, start: number, end: number}>}
 */
function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
        const char = input[i];

        // 1. Whitespace
        if (/\s/.test(char)) {
            const start = i;
            let value = '';
            while (i < input.length && /\s/.test(input[i])) {
                value += input[i];
                i++;
            }
            tokens.push({ type: 'whitespace', value, start, end: i });
            continue;
        }

        // 2. Line comment
        if (char === '/' && input[i + 1] === '/') {
            const start = i;
            let value = '';
            while (i < input.length && input[i] !== '\n') {
                value += input[i];
                i++;
            }
            tokens.push({ type: 'comment', value, start, end: i });
            continue;
        }

        // 3. Block comment
        if (char === '/' && input[i + 1] === '*') {
            const start = i;
            let value = '/*';
            i += 2;
            while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) {
                value += input[i];
                i++;
            }
            if (i < input.length) {
                value += '*/';
                i += 2;
            }
            tokens.push({ type: 'comment', value, start, end: i });
            continue;
        }

        // 4. Double quoted string
        if (char === '"') {
            const start = i;
            let value = '"';
            i++;
            while (i < input.length && input[i] !== '"') {
                if (input[i] === '\\') {
                    value += '\\' + (input[i + 1] || '');
                    i += 2;
                } else {
                    value += input[i];
                    i++;
                }
            }
            if (i < input.length) {
                value += '"';
                i++;
            }
            tokens.push({ type: 'string', value, quote: 'double', start, end: i });
            continue;
        }

        // 5. Single quoted string
        if (char === "'") {
            const start = i;
            let value = "'";
            i++;
            while (i < input.length && input[i] !== "'") {
                if (input[i] === '\\') {
                    value += '\\' + (input[i + 1] || '');
                    i += 2;
                } else {
                    value += input[i];
                    i++;
                }
            }
            if (i < input.length) {
                value += "'";
                i++;
            }
            tokens.push({ type: 'string', value, quote: 'single', start, end: i });
            continue;
        }

        // 6. Multi-character operators
        const start = i;
        const multiOp2 = input.substr(i, 2);
        if (['<=', '>=', '<>', '==', '!='].includes(multiOp2)) {
            tokens.push({ type: 'operator', value: multiOp2, start, end: i + 2 });
            i += 2;
            continue;
        }

        // 7. Single-character operators
        if (['=', '<', '>', '+', '-', '*', '/', '^'].includes(char)) {
            tokens.push({ type: 'operator', value: char, start, end: i + 1 });
            i++;
            continue;
        }

        // 8. Punctuation
        if (['(', ')', ','].includes(char)) {
            tokens.push({ type: 'punctuation', value: char, start, end: i + 1 });
            i++;
            continue;
        }

        // 9. Numbers (including decimals)
        if (/[0-9]/.test(char)) {
            let value = '';
            while (i < input.length && /[0-9.]/.test(input[i])) {
                value += input[i];
                i++;
            }
            tokens.push({ type: 'number', value, start, end: i });
            continue;
        }

        // 10. Identifiers & Keywords
        if (/[A-Za-z_]/.test(char)) {
            let value = '';
            while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) {
                value += input[i];
                i++;
            }
            const upper = value.toUpperCase();
            if (['IF', 'THEN', 'ELSE', 'AND', 'OR', 'NOT', 'EXIT', 'IN'].includes(upper)) {
                tokens.push({ type: 'keyword', value, start, end: i });
            } else {
                tokens.push({ type: 'identifier', value, start, end: i });
            }
            continue;
        }

        // 11. Any other character
        tokens.push({ type: 'unknown', value: char, start, end: i + 1 });
        i++;
    }
    return tokens;
}

module.exports = { tokenize };