const { tokenize } = require('../parser/tokenizer');

/**
 * Formats a full PI Analysis document.
 *
 * @param {string} text The document text.
 * @param {object} options Formatter options.
 * @returns {string} The formatted document.
 */
function formatDocument(text, options = {}) {
    const lines = text.split(/\r?\n/);

    return lines
        .map((line) => formatPiAfAnalysisExpression(line, options))
        .join('\n');
}

/**
 * Formats a single PI Analysis expression.
 *
 * @param {string} input The PI Analysis expression.
 * @param {object} options Formatter options.
 * @returns {string} The formatted expression.
 */
function formatPiAfAnalysisExpression(input, options = {}) {
    if (!input.trim()) {
        return input;
    }

    const maxLineLength = options.maxLineLength || 100;
    const tokens = tokenize(input);
    const formatted = formatTokensInline(tokens);

    if (formatted.length <= maxLineLength) {
        return formatted;
    }

    return formatLongIfExpression(tokens, maxLineLength);
}

/**
 * Formats tokens into a single normalized line.
 *
 * @param {Array<object>} tokens Tokenized expression.
 * @returns {string} The inline formatted expression.
 */
function formatTokensInline(tokens) {
    let result = '';

    tokens.forEach((token, index) => {
        if (token.type === 'whitespace') {
            return;
        }

        if (token.type === 'comment') {
            appendWithSpace(token.value);
            return;
        }

        if (token.type === 'punctuation') {
            handlePunctuation(token);
            return;
        }

        if (token.type === 'operator') {
            handleOperator(tokens, token, index);
            return;
        }

        appendDefault(tokens, token, index);
    });

    return result.trim();

    /**
     * Appends text using default spacing behavior.
     *
     * @param {Array<object>} allTokens All tokens.
     * @param {object} token The current token.
     * @param {number} index Current token index.
     */
    function appendDefault(allTokens, token, index) {
        const previous = getPreviousMeaningfulToken(allTokens, index);

        if (
            previous
            && previous.type === 'identifier'
            && token.value === '('
        ) {
            result += token.value;
            return;
        }

        if (shouldInsertSpaceBefore(result, previous, token)) {
            result += ' ';
        }

        result += token.value;
    }

    /**
     * Handles punctuation spacing.
     *
     * @param {object} token Current punctuation token.
     */
    function handlePunctuation(token) {
        if (token.value === '(') {
            result = result.trimEnd();
            result += '(';
            return;
        }

        if (token.value === ')') {
            result = result.trimEnd();
            result += ')';
            return;
        }

        if (token.value === ',') {
            result = result.trimEnd();
            result += ', ';
        }
    }

    /**
     * Handles operator spacing.
     *
     * @param {Array<object>} allTokens All tokens.
     * @param {object} token Current operator token.
     * @param {number} index Current token index.
     */
    function handleOperator(allTokens, token, index) {
        if (token.value === '-' && isUnaryMinusContext(allTokens, index)) {
            result = result.trimEnd();
            result += '-';
            return;
        }

        result = result.trimEnd();
        result += ` ${token.value} `;
    }

    /**
     * Appends text with a space before it.
     *
     * @param {string} value Text to append.
     */
    function appendWithSpace(value) {
        if (result && !result.endsWith(' ')) {
            result += ' ';
        }

        result += value;
    }
}

/**
 * Performs basic multiline formatting for long IF expressions.
 *
 * @param {Array<object>} tokens Tokenized expression.
 * @param {number} maxLineLength Maximum line length.
 * @returns {string} Formatted expression.
 */
function formatLongIfExpression(tokens, maxLineLength) {
    const inline = formatTokensInline(tokens);

    if (!hasKeyword(tokens, 'IF')) {
        return inline;
    }

    const lines = [];
    let currentTokens = [];

    tokens.forEach((token) => {
        if (token.type === 'whitespace') {
            return;
        }

        if (
            token.type === 'keyword'
            && ['THEN', 'ELSE'].includes(token.value.toUpperCase())
            && currentTokens.length > 0
        ) {
            lines.push(formatTokensInline(currentTokens));
            currentTokens = [token];
            return;
        }

        currentTokens.push(token);
    });

    if (currentTokens.length > 0) {
        lines.push(formatTokensInline(currentTokens));
    }

    const formatted = lines.join('\n');

    if (formatted.length <= maxLineLength * 2) {
        return formatted;
    }

    return inline;
}

/**
 * Checks if the token list contains a keyword.
 *
 * @param {Array<object>} tokens Tokenized expression.
 * @param {string} keyword Keyword to search.
 * @returns {boolean} True when the keyword exists.
 */
function hasKeyword(tokens, keyword) {
    return tokens.some((token) => (
        token.type === 'keyword'
        && token.value.toUpperCase() === keyword.toUpperCase()
    ));
}

/**
 * Gets the previous meaningful token.
 *
 * @param {Array<object>} tokens Tokenized expression.
 * @param {number} index Current index.
 * @returns {object | null} Previous non-whitespace/comment token.
 */
function getPreviousMeaningfulToken(tokens, index) {
    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
        const token = tokens[previousIndex];

        if (token.type !== 'whitespace' && token.type !== 'comment') {
            return token;
        }
    }

    return null;
}

/**
 * Checks whether spacing should be inserted before a token.
 *
 * @param {string} result Current formatted result.
 * @param {object | null} previous Previous meaningful token.
 * @param {object} token Current token.
 * @returns {boolean} True when a space should be inserted.
 */
function shouldInsertSpaceBefore(result, previous, token) {
    if (!result || result.endsWith(' ')) {
        return false;
    }

    if (!previous) {
        return false;
    }

    if (token.type === 'punctuation' && token.value === '(') {
        return false;
    }

    if (previous.type === 'punctuation' && previous.value === '(') {
        return false;
    }

    if (token.type === 'punctuation' && token.value === ')') {
        return false;
    }

    return true;
}

/**
 * Checks whether a minus operator is unary.
 *
 * @param {Array<object>} tokens Tokenized expression.
 * @param {number} index Current token index.
 * @returns {boolean} True when minus is unary.
 */
function isUnaryMinusContext(tokens, index) {
    const previous = getPreviousMeaningfulToken(tokens, index);

    if (!previous) {
        return true;
    }

    if (previous.type === 'operator') {
        return true;
    }

    return (
        previous.type === 'punctuation'
        && ['(', ','].includes(previous.value)
    );
}

module.exports = {
    formatPiAfAnalysisExpression,
    formatDocument
};