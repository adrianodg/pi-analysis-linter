/**
 * Lightweight Recursive Descent Parser for PI AF Analysis Expressions.
 */

class Parser {
    /**
     * @param {Array<object>} tokens Tokens produced by the tokenizer.
     */
    constructor(tokens) {
        // Filter out whitespace and comments to simplify logic
        this.tokens = tokens.filter(
            (t) => t.type !== 'whitespace' && t.type !== 'comment'
        );
        this.index = 0;
        this.errors = [];
    }

    /**
     * Look ahead in the token stream.
     * @param {number} offset 
     * @returns {object|null}
     */
    peek(offset = 0) {
        const target = this.index + offset;
        if (target >= this.tokens.length) {
            return null;
        }
        return this.tokens[target];
    }

    /**
     * Consume the current token and advance.
     * @returns {object|null}
     */
    consume() {
        const token = this.peek();
        if (token) {
            this.index += 1;
        }
        return token;
    }

    /**
     * Checks if current token matches a specific token type.
     */
    matchType(type) {
        const token = this.peek();
        return token && token.type === type;
    }

    /**
     * Checks if current token is a keyword matching value (case-insensitive).
     */
    matchKeyword(value) {
        const token = this.peek();
        return (
            token &&
            token.type === 'keyword' &&
            token.value.toUpperCase() === value.toUpperCase()
        );
    }

    /**
     * Checks if current token matches a specific punctuation character.
     */
    matchPunctuation(char) {
        const token = this.peek();
        return token && token.type === 'punctuation' && token.value === char;
    }

    /**
     * Checks if current token matches a specific operator.
     */
    matchOperator(op) {
        const token = this.peek();
        return token && token.type === 'operator' && token.value === op;
    }

    /**
     * Checks if current token is one of the target operators.
     */
    matchOperators(ops) {
        const token = this.peek();
        return token && token.type === 'operator' && ops.includes(token.value);
    }

    /**
     * Consume token if it matches, otherwise register diagnostic error.
     */
    expectKeyword(value) {
        if (this.matchKeyword(value)) {
            return this.consume();
        }
        const token = this.peek();
        const msg = `Expected keyword '${value.toUpperCase()}' but found '${token ? token.value : 'EOF'}'.`;
        this.error(msg, token);
        return null;
    }

    expectPunctuation(char) {
        if (this.matchPunctuation(char)) {
            return this.consume();
        }
        const token = this.peek();
        const msg = `Expected '${char}' but found '${token ? token.value : 'EOF'}'.`;
        this.error(msg, token);
        return null;
    }

    /**
     * Record syntax errors for VS Code Diagnostic reporting.
     */
    error(message, token) {
        const start = token ? token.start : (this.tokens.length > 0 ? this.tokens[this.tokens.length - 1].end : 0);
        const end = token ? token.end : (this.tokens.length > 0 ? this.tokens[this.tokens.length - 1].end : 0);
        this.errors.push({ message, start, end });
    }

    /**
     * Main parse entry point.
     */
    parseExpression() {
        return this.parseIf();
    }

    /**
     * IF expression precedence
     * IF test THEN consequent ELSE alternate
     */
    parseIf() {
        if (this.matchKeyword('IF')) {
            const ifToken = this.consume();
            const test = this.parseExpression();

            this.expectKeyword('THEN');
            const consequent = this.parseExpression();

            this.expectKeyword('ELSE');
            const alternate = this.parseExpression();

            return {
                type: 'IfExpression',
                test,
                consequent,
                alternate: alternate || {
                    type: 'ErrorNode',
                    start: consequent ? consequent.end : ifToken.end,
                    end: consequent ? consequent.end : ifToken.end
                },
                start: ifToken.start,
                end: alternate ? alternate.end : (consequent ? consequent.end : ifToken.end)
            };
        }

        return this.parseLogicalOr();
    }

    /**
     * Logical OR Precedence (Left-associative)
     */
    parseLogicalOr() {
        let left = this.parseLogicalAnd();

        while (this.matchKeyword('OR')) {
            const opToken = this.consume();
            const right = this.parseLogicalAnd();
            left = {
                type: 'BinaryExpression',
                operator: opToken.value,
                left,
                right,
                start: left.start,
                end: right ? right.end : opToken.end
            };
        }

        return left;
    }

    /**
     * Logical AND Precedence (Left-associative)
     */
    parseLogicalAnd() {
        let left = this.parseLogicalNot();

        while (this.matchKeyword('AND')) {
            const opToken = this.consume();
            const right = this.parseLogicalNot();
            left = {
                type: 'BinaryExpression',
                operator: opToken.value,
                left,
                right,
                start: left.start,
                end: right ? right.end : opToken.end
            };
        }

        return left;
    }

    /**
     * Unary Logical NOT Precedence (Right-associative)
     */
    parseLogicalNot() {
        if (this.matchKeyword('NOT')) {
            const opToken = this.consume();
            const argument = this.parseLogicalNot();
            return {
                type: 'UnaryExpression',
                operator: opToken.value,
                argument,
                prefix: true,
                start: opToken.start,
                end: argument ? argument.end : opToken.end
            };
        }

        return this.parseComparison();
    }

    /**
     * Comparisons Precedence (Left-associative)
     * Ops: =, <>, <, >, <=, >=, !=, ==
     */
    parseComparison() {
        let left = this.parseAdditive();
        const compOps = ['=', '<>', '<', '>', '<=', '>=', '!=', '=='];

        while (this.matchOperators(compOps)) {
            const opToken = this.consume();
            const right = this.parseAdditive();
            left = {
                type: 'BinaryExpression',
                operator: opToken.value,
                left,
                right,
                start: left.start,
                end: right ? right.end : opToken.end
            };
        }

        return left;
    }

    /**
     * Additive Precedence (Left-associative)
     * Ops: +, -
     */
    parseAdditive() {
        let left = this.parseMultiplicative();

        while (this.matchOperators(['+', '-'])) {
            const opToken = this.consume();
            const right = this.parseMultiplicative();
            left = {
                type: 'BinaryExpression',
                operator: opToken.value,
                left,
                right,
                start: left.start,
                end: right ? right.end : opToken.end
            };
        }

        return left;
    }

    /**
     * Multiplicative Precedence (Left-associative)
     * Ops: *, /
     */
    parseMultiplicative() {
        let left = this.parseExponential();

        while (this.matchOperators(['*', '/'])) {
            const opToken = this.consume();
            const right = this.parseExponential();
            left = {
                type: 'BinaryExpression',
                operator: opToken.value,
                left,
                right,
                start: left.start,
                end: right ? right.end : opToken.end
            };
        }

        return left;
    }

    /**
     * Exponential Precedence (Right-associative)
     * Ops: ^
     */
    parseExponential() {
        let left = this.parseUnaryMinus();

        if (this.matchOperator('^')) {
            const opToken = this.consume();
            const right = this.parseExponential();
            return {
                type: 'BinaryExpression',
                operator: opToken.value,
                left,
                right,
                start: left.start,
                end: right ? right.end : opToken.end
            };
        }

        return left;
    }

    /**
     * Unary Minus Precedence (Right-associative)
     */
    parseUnaryMinus() {
        if (this.matchOperator('-')) {
            const opToken = this.consume();
            const argument = this.parseUnaryMinus();
            return {
                type: 'UnaryExpression',
                operator: opToken.value,
                argument,
                prefix: true,
                start: opToken.start,
                end: argument ? argument.end : opToken.end
            };
        }

        return this.parsePrimary();
    }

    /**
     * Primary Expressions (Identifiers, Functions, Literals, Parenthesized Groups)
     */
    parsePrimary() {
        if (this.matchPunctuation('(')) {
            const openParen = this.consume();
            const expr = this.parseExpression();
            const closeParen = this.expectPunctuation(')');
            return {
                type: 'GroupExpression',
                expression: expr,
                start: openParen.start,
                end: closeParen ? closeParen.end : (expr ? expr.end : openParen.end)
            };
        }

        if (this.matchType('string') || this.matchType('number')) {
            const token = this.consume();
            return {
                type: 'Literal',
                value: token.value,
                raw: token.value,
                quote: token.quote || null,
                start: token.start,
                end: token.end
            };
        }

        if (this.matchType('identifier')) {
            const idToken = this.consume();
            const idNode = {
                type: 'Identifier',
                name: idToken.value,
                start: idToken.start,
                end: idToken.end
            };

            // Check if this identifier represents a Function Call
            if (this.matchPunctuation('(')) {
                this.consume(); // Consume '('
                const args = [];

                if (!this.matchPunctuation(')')) {
                    args.push(this.parseExpression());
                    while (this.matchPunctuation(',')) {
                        this.consume(); // Consume ','
                        args.push(this.parseExpression());
                    }
                }

                const closeParen = this.expectPunctuation(')');
                return {
                    type: 'FunctionCall',
                    callee: idNode,
                    arguments: args,
                    start: idNode.start,
                    end: closeParen ? closeParen.end : (args.length > 0 ? args[args.length - 1].end : idNode.end)
                };
            }

            return idNode;
        }

        // Error fallback context: Skip this token to prevent infinite syntax loops
        const token = this.peek();
        this.error(`Unexpected token: '${token ? token.value : 'EOF'}'`, token);
        if (token) {
            this.consume();
        }

        return {
            type: 'ErrorNode',
            start: token ? token.start : 0,
            end: token ? token.end : 0
        };
    }
}

/**
 * Parsing Entry Interface
 * @param {Array<object>} tokens List of tokens.
 * @returns {{ ast: object|null, errors: Array<object> }} AST Root and Parsing Errors.
 */
function parse(tokens) {
    const parser = new Parser(tokens);
    let ast = null;

    try {
        ast = parser.parseExpression();

        // Catch trailing characters that were ignored (e.g. extraneous parentheses)
        if (parser.index < parser.tokens.length) {
            const extraToken = parser.peek();
            parser.error(`Unexpected trailing token: '${extraToken.value}'`, extraToken);
        }
    } catch (e) {
        parser.error(`Internal Parsing Exception: ${e.message}`, null);
    }

    return {
        ast,
        errors: parser.errors
    };
}

module.exports = {
    parse
};