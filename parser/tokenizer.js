const KEYWORDS = new Set([
    'IF',
    'THEN',
    'ELSE',
    'AND',
    'OR',
    'NOT',
    'EXIT',
    'IN'
]);

const TWO_CHAR_OPERATORS = new Set([
    '<=',
    '>=',
    '<>',
    '!=',
    '=='
]);

const ONE_CHAR_OPERATORS = new Set([
    '=',
    '<',
    '>',
    '+',
    '-',
    '*',
    '/',
    '^'
]);

const PUNCTUATION = new Set([
    '(',
    ')',
    ','
]);

/**
 * Tokenizes a PI AF Analysis expression.
 *
 * @param {string} input The PI AF Analysis expression.
 * @returns {Array<object>} Tokens with type, value, start, and end positions.
 */
function tokenize(input) {
    const tokens = [];
    let index = 0;

    while (index < input.length) {
        const char = input[index];

        if (isWhitespace(char)) {
            index = readWhitespace(input, index, tokens);
            continue;
        }

        if (startsWithLineComment(input, index)) {
            index = readLineComment(input, index, tokens);
            continue;
        }

        if (startsWithBlockComment(input, index)) {
            index = readBlockComment(input, index, tokens);
            continue;
        }

        if (char === "'" || char === '"') {
            index = readString(input, index, tokens);
            continue;
        }

        if (isDigit(char) || isNumberStartingWithDot(input, index)) {
            index = readNumber(input, index, tokens);
            continue;
        }

        if (isIdentifierStart(char)) {
            index = readIdentifierOrKeyword(input, index, tokens);
            continue;
        }

        if (index + 1 < input.length) {
            const twoChars = input.slice(index, index + 2);

            if (TWO_CHAR_OPERATORS.has(twoChars)) {
                tokens.push({
                    type: 'operator',
                    value: twoChars,
                    start: index,
                    end: index + 2
                });

                index += 2;
                continue;
            }
        }

        if (ONE_CHAR_OPERATORS.has(char)) {
            tokens.push({
                type: 'operator',
                value: char,
                start: index,
                end: index + 1
            });

            index += 1;
            continue;
        }

        if (PUNCTUATION.has(char)) {
            tokens.push({
                type: 'punctuation',
                value: char,
                start: index,
                end: index + 1
            });

            index += 1;
            continue;
        }

        tokens.push({
            type: 'unknown',
            value: char,
            start: index,
            end: index + 1
        });

        index += 1;
    }

    return tokens;
}

/**
 * Checks whether a character is whitespace.
 *
 * @param {string} char The character to validate.
 * @returns {boolean} True when the character is whitespace.
 */
function isWhitespace(char) {
    return /\s/.test(char);
}

/**
 * Checks whether a character is a digit.
 *
 * @param {string} char The character to validate.
 * @returns {boolean} True when the character is a digit.
 */
function isDigit(char) {
    return /[0-9]/.test(char);
}

/**
 * Checks whether a character can start an identifier.
 *
 * @param {string} char The character to validate.
 * @returns {boolean} True when the character can start an identifier.
 */
function isIdentifierStart(char) {
    return /[A-Za-z_]/.test(char);
}

/**
 * Checks whether a character can be part of an identifier.
 *
 * @param {string} char The character to validate.
 * @returns {boolean} True when the character can be part of an identifier.
 */
function isIdentifierPart(char) {
    return /[A-Za-z0-9_]/.test(char);
}

/**
 * Checks whether the current position starts a decimal number like ".5".
 *
 * @param {string} input The full input text.
 * @param {number} index The current index.
 * @returns {boolean} True when the current position starts a dot number.
 */
function isNumberStartingWithDot(input, index) {
    return (
        input[index] === '.'
        && index + 1 < input.length
        && isDigit(input[index + 1])
    );
}

/**
 * Reads a whitespace sequence.
 *
 * @param {string} input The full input text.
 * @param {number} start The starting index.
 * @param {Array<object>} tokens The token accumulator.
 * @returns {number} The next unread index.
 */
function readWhitespace(input, start, tokens) {
    let index = start;

    while (index < input.length && isWhitespace(input[index])) {
        index += 1;
    }

    tokens.push({
        type: 'whitespace',
        value: input.slice(start, index),
        start,
        end: index
    });

    return index;
}

/**
 * Checks whether the current index starts a line comment.
 *
 * @param {string} input The full input text.
 * @param {number} index The current index.
 * @returns {boolean} True when a line comment starts at the index.
 */
function startsWithLineComment(input, index) {
    return input.startsWith('//', index);
}

/**
 * Reads a line comment.
 *
 * @param {string} input The full input text.
 * @param {number} start The starting index.
 * @param {Array<object>} tokens The token accumulator.
 * @returns {number} The next unread index.
 */
function readLineComment(input, start, tokens) {
    let index = start;

    while (index < input.length && input[index] !== '\n') {
        index += 1;
    }

    tokens.push({
        type: 'comment',
        value: input.slice(start, index),
        start,
        end: index
    });

    return index;
}

/**
 * Checks whether the current index starts a block comment.
 *
 * Supports both PI-style "/_ ... _/" and C-style "/* ... *\/".
 *
 * @param {string} input The full input text.
 * @param {number} index The current index.
 * @returns {boolean} True when a block comment starts at the index.
 */
function startsWithBlockComment(input, index) {
    return input.startsWith('/_', index) || input.startsWith('/*', index);
}

/**
 * Reads a block comment.
 *
 * @param {string} input The full input text.
 * @param {number} start The starting index.
 * @param {Array<object>} tokens The token accumulator.
 * @returns {number} The next unread index.
 */
function readBlockComment(input, start, tokens) {
    const endMarker = input.startsWith('/_', start) ? '_/' : '*/';
    const endIndex = input.indexOf(endMarker, start + 2);

    const index = endIndex === -1
        ? input.length
        : endIndex + endMarker.length;

    tokens.push({
        type: 'comment',
        value: input.slice(start, index),
        start,
        end: index
    });

    return index;
}

/**
 * Reads a single-quoted or double-quoted string.
 *
 * @param {string} input The full input text.
 * @param {number} start The starting index.
 * @param {Array<object>} tokens The token accumulator.
 * @returns {number} The next unread index.
 */
function readString(input, start, tokens) {
    const quoteChar = input[start];
    const quote = quoteChar === "'" ? 'single' : 'double';

    let index = start + 1;
    let closed = false;

    while (index < input.length) {
        const char = input[index];

        if (char === '\\') {
            index += 2;
            continue;
        }

        if (char === quoteChar) {
            index += 1;
            closed = true;
            break;
        }

        index += 1;
    }

    tokens.push({
        type: 'string',
        value: input.slice(start, index),
        quote,
        closed,
        start,
        end: index
    });

    return index;
}

/**
 * Reads a numeric literal.
 *
 * Supports integers, decimals, and scientific notation.
 *
 * @param {string} input The full input text.
 * @param {number} start The starting index.
 * @param {Array<object>} tokens The token accumulator.
 * @returns {number} The next unread index.
 */
function readNumber(input, start, tokens) {
    let index = start;
    let hasDot = false;

    if (input[index] === '.') {
        hasDot = true;
        index += 1;
    }

    while (index < input.length && isDigit(input[index])) {
        index += 1;
    }

    if (!hasDot && input[index] === '.') {
        hasDot = true;
        index += 1;

        while (index < input.length && isDigit(input[index])) {
            index += 1;
        }
    }

    if (input[index] === 'e' || input[index] === 'E') {
        const exponentStart = index;
        index += 1;

        if (input[index] === '+' || input[index] === '-') {
            index += 1;
        }

        const digitStart = index;

        while (index < input.length && isDigit(input[index])) {
            index += 1;
        }

        if (digitStart === index) {
            index = exponentStart;
        }
    }

    tokens.push({
        type: 'number',
        value: input.slice(start, index),
        start,
        end: index
    });

    return index;
}

/**
 * Reads an identifier or keyword.
 *
 * @param {string} input The full input text.
 * @param {number} start The starting index.
 * @param {Array<object>} tokens The token accumulator.
 * @returns {number} The next unread index.
 */
function readIdentifierOrKeyword(input, start, tokens) {
    let index = start;

    while (index < input.length && isIdentifierPart(input[index])) {
        index += 1;
    }

    const value = input.slice(start, index);
    const upperValue = value.toUpperCase();

    tokens.push({
        type: KEYWORDS.has(upperValue) ? 'keyword' : 'identifier',
        value,
        start,
        end: index
    });

    return index;
}

module.exports = {
    tokenize
};