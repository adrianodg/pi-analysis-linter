const { tokenize } = require('../parser/tokenizer');

/**
 * Checks if a string matches the format of a PI relative time string.
 * @param {string} str 
 */
function isRelativeTime(str) {
    const s = str.trim().toLowerCase();
    if (s === '*' || s === 't' || s === 'y' || s === 'today' || s === 'yesterday') {
        return true;
    }
    if (/^[ty\*]\s*[+-]\s*\d+\s*[a-z]+$/i.test(s)) {
        return true;
    }
    if (/^[+-]\s*\d+\s*[a-z]+$/i.test(s)) {
        return true;
    }
    if (/^\*-[0-9]+[a-z]+$/i.test(s) || /^\*[+-][0-9]+[a-z]+$/i.test(s)) {
        return true;
    }
    return false;
}

/**
 * Computes contextual parameters for tokens to differentiate between string literals
 * and attributes/tag names.
 */
function computeContexts(tokens) {
    const stack = [];
    let lastIdentifier = null;
    let lastOperator = null;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.type === 'whitespace' || token.type === 'comment') {
            continue;
        }

        if (token.type === 'identifier') {
            lastIdentifier = token.value;
        }

        if (token.type === 'punctuation' && token.value === '(') {
            stack.push({
                name: lastIdentifier,
                argIndex: 0
            });
            lastIdentifier = null;
        } else if (token.type === 'punctuation' && token.value === ')') {
            stack.pop();
        } else if (token.type === 'punctuation' && token.value === ',') {
            if (stack.length > 0) {
                stack[stack.length - 1].argIndex++;
            }
        }

        if (token.type === 'operator') {
            lastOperator = token.value;
        } else if (token.type !== 'whitespace' && token.type !== 'comment') {
            if (lastOperator) {
                token.rightOfOperator = lastOperator;
                lastOperator = null;
            }
        }

        if (stack.length > 0) {
            const currentFunc = stack[stack.length - 1];
            token.functionName = currentFunc.name;
            token.argumentIndex = currentFunc.argIndex;
        }
    }
}

/**
 * Formats string tokens. Converts single quoted text string literals to double quotes.
 */
function formatStringToken(token) {
    if (token.type !== 'string') return token.value;

    const val = token.value;
    if (token.quote === 'double') {
        return val;
    }

    const content = val.slice(1, -1);

    if (content.includes('|') || content.includes('\\') || content.includes('.')) {
        return val;
    }

    if (isRelativeTime(content)) {
        return val;
    }

    if (content.length === 1 && !token.rightOfOperator) {
        return val;
    }

    if (token.functionName && token.argumentIndex === 0) {
        return val;
    }

    const escapedContent = content.replace(/"/g, '\\"');
    return `"${escapedContent}"`;
}

/**
 * Helper to retrieve the previous non-whitespace token.
 */
function getPrevNonWhitespaceToken(tokens, currentIndex) {
    for (let j = currentIndex - 1; j >= 0; j--) {
        if (tokens[j].type !== 'whitespace') {
            return tokens[j];
        }
    }
    return null;
}

/**
 * Identifies if a minus sign represents a unary negative prefix instead of a binary subtraction.
 */
function isUnaryMinusContext(tokens, index) {
    if (index === 0) return true;
    const prev = getPrevNonWhitespaceToken(tokens, index);
    if (!prev) return true;
    return ['=', '<>', '>', '<', '>=', '<=', '!=', '==', '+', '-', '*', '/', '^', '(', ','].includes(prev.value);
}

/**
 * Formats a list of tokens into a single standardized line while preserving case.
 */
function formatTokensInline(tokens) {
    let result = '';
    
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        
        if (token.type === 'whitespace') {
            continue;
        }
        
        if (token.type === 'comment') {
            result += token.value + ' ';
            continue;
        }
        
        let tokenVal = token.value;
        if (token.type === 'string') {
            tokenVal = formatStringToken(token);
        }
        
        if (result.length > 0) {
            const lastChar = result[result.length - 1];
            const nextChar = tokenVal[0];
            
            let needSpace = false;
            
            const isCompOp = (t) => ['=', '<>', '>', '<', '>=', '<=', '!=', '=='].includes(t);
            const isArithmeticOp = (t) => ['+', '-', '*', '/', '^'].includes(t);
            const isLogicalKeyword = (t) => ['and', 'or', 'not', 'exit', 'in'].includes(t.toLowerCase());
            
            const prevToken = getPrevNonWhitespaceToken(tokens, i);
            
            if (prevToken) {
                const prevValLower = prevToken.value.toLowerCase();
                const tokenValLower = tokenVal.toLowerCase();
                const prevIsUnaryMinus = prevToken.value === '-' && isUnaryMinusContext(tokens, tokens.indexOf(prevToken));
                
                if (prevIsUnaryMinus) {
                    // 1. No space after a unary minus (e.g., -10)
                    needSpace = false;
                } else if (isCompOp(tokenVal) || isCompOp(prevToken.value)) {
                    // 2. Spaces around comparison operators
                    needSpace = true;
                } else if (isLogicalKeyword(tokenVal) || isLogicalKeyword(prevToken.value)) {
                    // 3. Spaces around logical keywords
                    needSpace = true;
                } else if (['then', 'else', 'if'].includes(tokenValLower) || ['then', 'else', 'if'].includes(prevValLower)) {
                    // 4. Spaces around control flow keywords
                    needSpace = true;
                } else if (isArithmeticOp(tokenVal) || isArithmeticOp(prevToken.value)) {
                    // 5. Arithmetic operators (now takes precedence over parentheses checks)
                    const currentIsUnaryMinus = tokenVal === '-' && isUnaryMinusContext(tokens, i);
                    if (currentIsUnaryMinus) {
                        if (prevToken.value === '(' || prevToken.value === ',') {
                            needSpace = false;
                        } else {
                            needSpace = true;
                        }
                    } else {
                        needSpace = true;
                    }
                } else if (tokenVal === ',') {
                    // 6. No space before a comma
                    needSpace = false;
                } else if (prevToken.value === ',') {
                    // 7. Space after a comma
                    needSpace = true;
                } else if (tokenVal === '(' || prevToken.value === '(') {
                    // 8. No space around open parentheses by default
                    needSpace = false;
                } else if (tokenVal === ')' || prevToken.value === ')') {
                    // 9. No space around close parentheses by default
                    needSpace = false;
                } else {
                    // 10. Space between adjacent words/identifiers/numbers
                    if (/[a-zA-Z0-9_]/.test(lastChar) && /[a-zA-Z0-9_]/.test(nextChar)) {
                        needSpace = true;
                    }
                }
            }
            
            if (needSpace && lastChar !== ' ') {
                result += ' ';
            }
        }
        
        result += tokenVal;
    }
    
    return result.trim();
}

/**
 * Separates top-level assignment statements (e.g. "VarName = ...") from the expression.
 */
function separateAssignment(statement) {
    const tokens = tokenize(statement);
    let nonWs = [];
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== 'whitespace') {
            nonWs.push({ token: tokens[i], index: i });
        }
    }
    
    if (nonWs.length >= 2) {
        const first = nonWs[0].token;
        const second = nonWs[1].token;
        
        if (first.type === 'identifier' && second.type === 'operator' && second.value === '=') {
            const splitIndex = nonWs[1].index + 1;
            const prefixTokens = tokens.slice(0, splitIndex);
            const exprTokens = tokens.slice(splitIndex);
            return {
                prefix: formatTokensInline(prefixTokens) + ' ',
                exprTokens: exprTokens
            };
        }
    }
    
    return {
        prefix: '',
        exprTokens: tokens
    };
}

/**
 * Parses expression into top-level logical clauses for conditional logic (IF / THEN / ELSE / ELSE IF).
 */
function parseClauses(tokens) {
    const clauses = [];
    let currentClause = null;
    let parenthesisDepth = 0;
    let i = 0;
    
    let hasTopLevelIf = false;
    for (let j = 0; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.type === 'punctuation' && t.value === '(') parenthesisDepth++;
        if (t.type === 'punctuation' && t.value === ')') parenthesisDepth--;
        if (parenthesisDepth === 0 && t.type === 'keyword' && t.value.toLowerCase() === 'if') {
            hasTopLevelIf = true;
            break;
        }
    }
    
    if (!hasTopLevelIf) {
        return null;
    }
    
    parenthesisDepth = 0;
    let currentPart = 'condition';
    
    while (i < tokens.length) {
        const token = tokens[i];
        
        if (token.type === 'punctuation' && token.value === '(') {
            parenthesisDepth++;
        } else if (token.type === 'punctuation' && token.value === ')') {
            parenthesisDepth--;
        }
        
        if (parenthesisDepth === 0) {
            if (token.type === 'keyword' && token.value.toLowerCase() === 'if') {
                currentClause = { type: 'if', ifToken: token, conditionTokens: [], bodyTokens: [] };
                clauses.push(currentClause);
                currentPart = 'condition';
                i++;
                continue;
            }
            
            if (token.type === 'keyword' && token.value.toLowerCase() === 'else') {
                let nextIdx = i + 1;
                while (nextIdx < tokens.length && (tokens[nextIdx].type === 'whitespace' || tokens[nextIdx].type === 'comment')) {
                    nextIdx++;
                }
                if (nextIdx < tokens.length && tokens[nextIdx].type === 'keyword' && tokens[nextIdx].value.toLowerCase() === 'if') {
                    currentClause = { type: 'else if', elseToken: token, ifToken: tokens[nextIdx], conditionTokens: [], bodyTokens: [] };
                    clauses.push(currentClause);
                    currentPart = 'condition';
                    i = nextIdx + 1;
                    continue;
                } else {
                    currentClause = { type: 'else', elseToken: token, bodyTokens: [] };
                    clauses.push(currentClause);
                    currentPart = 'body';
                    i++;
                    continue;
                }
            }
            
            if (token.type === 'keyword' && token.value.toLowerCase() === 'then') {
                if (currentClause) {
                    currentClause.thenToken = token;
                }
                currentPart = 'body';
                i++;
                continue;
            }
        }
        
        if (currentClause) {
            if (currentPart === 'condition' && currentClause.conditionTokens) {
                currentClause.conditionTokens.push(token);
            } else {
                currentClause.bodyTokens.push(token);
            }
        }
        
        i++;
    }
    
    return clauses;
}

/**
 * Formats and splits conditions at top-level logical AND / OR operators if they exceed max line length constraints.
 */
function formatCondition(prefix, conditionTokens, maxLineLength) {
    const inlineCondition = formatTokensInline(conditionTokens);
    const inlineLine = `${prefix} ${inlineCondition}`;
    
    if (inlineLine.length <= maxLineLength) {
        return [inlineLine];
    }
    
    const segments = [];
    let currentSegment = [];
    let parenthesisDepth = 0;
    
    for (let i = 0; i < conditionTokens.length; i++) {
        const token = conditionTokens[i];
        
        if (token.type === 'punctuation' && token.value === '(') {
            parenthesisDepth++;
        } else if (token.type === 'punctuation' && token.value === ')') {
            parenthesisDepth--;
        }
        
        if (parenthesisDepth === 0 && token.type === 'keyword' && (token.value.toLowerCase() === 'and' || token.value.toLowerCase() === 'or')) {
            if (currentSegment.length > 0) {
                segments.push({ tokens: currentSegment });
            }
            currentSegment = [token];
        } else {
            currentSegment.push(token);
        }
    }
    
    if (currentSegment.length > 0) {
        segments.push({ tokens: currentSegment });
    }
    
    if (segments.length <= 1) {
        return [inlineLine];
    }
    
    const lines = [];
    lines.push(`${prefix} ${formatTokensInline(segments[0].tokens)}`);
    
    for (let j = 1; j < segments.length; j++) {
        lines.push(formatTokensInline(segments[j].tokens));
    }
    
    return lines;
}

/**
 * Formats a single expression segment according to nesting patterns and length constraints.
 */
function formatPiAfAnalysisExpression(input, options = {}) {
    const maxLineLength = options.maxLineLength || 100;

    if (!input.trim()) return input;

    const { prefix, exprTokens } = separateAssignment(input);
    computeContexts(exprTokens);

    const clauses = parseClauses(exprTokens);

    if (!clauses) {
        return prefix + formatTokensInline(exprTokens);
    }

    const hasElseIf = clauses.some(c => c.type === 'else if');
    const isSimpleIf = !hasElseIf;

    const inlineFormatted = formatTokensInline(exprTokens);
    const fullInlineLength = prefix.length + inlineFormatted.length;

    const useMultiline = !isSimpleIf || (fullInlineLength > maxLineLength);

    if (!useMultiline) {
        return prefix + inlineFormatted;
    }

    const lines = [];

    for (let i = 0; i < clauses.length; i++) {
        const clause = clauses[i];

        if (clause.type === 'if') {
            const ifKeyword = clause.ifToken ? clause.ifToken.value : 'if';
            const condLines = formatCondition(ifKeyword, clause.conditionTokens, maxLineLength - prefix.length);
            if (condLines.length > 0) {
                condLines[0] = prefix + condLines[0];
            }
            lines.push(...condLines);

            const thenKeyword = clause.thenToken ? clause.thenToken.value : 'then';
            const bodyInline = formatTokensInline(clause.bodyTokens);
            lines.push(`${thenKeyword} ${bodyInline}`);
        } else if (clause.type === 'else if') {
            const elseKeyword = clause.elseToken ? clause.elseToken.value : 'else';
            const ifKeyword = clause.ifToken ? clause.ifToken.value : 'if';
            const condLines = formatCondition(`${elseKeyword} ${ifKeyword}`, clause.conditionTokens, maxLineLength);
            lines.push(...condLines);

            const thenKeyword = clause.thenToken ? clause.thenToken.value : 'then';
            const bodyInline = formatTokensInline(clause.bodyTokens);
            lines.push(`${thenKeyword} ${bodyInline}`);
        } else if (clause.type === 'else') {
            const elseKeyword = clause.elseToken ? clause.elseToken.value : 'else';
            const bodyInline = formatTokensInline(clause.bodyTokens);
            lines.push(`${elseKeyword} ${bodyInline}`);
        }
    }

    return lines.join('\n');
}

/**
 * Splits document content into separate logical statements to format sequentially.
 */
function splitIntoStatements(text) {
    const rawLines = text.split(/\r?\n/);
    const statements = [];
    let currentStatement = '';

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const trimmed = line.trim();

        if (trimmed === '') {
            if (currentStatement !== '') {
                statements.push(currentStatement);
                currentStatement = '';
            }
            statements.push('');
            continue;
        }

        const isContinuation = /^(then|else|and|or|else\s+if)\b/i.test(trimmed);

        if (isContinuation && currentStatement !== '') {
            currentStatement += ' ' + trimmed;
        } else {
            if (currentStatement !== '') {
                statements.push(currentStatement);
            }
            currentStatement = trimmed;
        }
    }

    if (currentStatement !== '') {
        statements.push(currentStatement);
    }

    return statements;
}

/**
 * Formats a full document containing one or multiple expression declarations.
 */
function formatDocument(text, options = {}) {
    const statements = splitIntoStatements(text);
    const formattedStatements = statements.map(statement => {
        if (statement === '') {
            return '';
        }
        return formatPiAfAnalysisExpression(statement, options);
    });
    return formattedStatements.join('\n');
}

module.exports = {
    formatPiAfAnalysisExpression,
    formatDocument
};