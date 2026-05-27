const vscode = require('vscode');
const { tokenize } = require('../parser/tokenizer');

/**
 * Basic Linter Logic
 */
function updateDiagnostics(document, collection, metadata) {
    if (document.languageId !== 'pi-analysis') return;

    const diagnostics = [];
    const text = document.getText();
    
    // 1. Scan and flag unknown function calls
    const funcRegex = /\b([A-Za-z0-9_]{2,})\s*\(/g;
    let match;
    while ((match = funcRegex.exec(text)) !== null) {
        const funcName = match[1];
        if (!metadata[funcName] && !isKeyword(funcName)) {
            const range = new vscode.Range(
                document.positionAt(match.index),
                document.positionAt(match.index + funcName.length)
            );
            diagnostics.push(new vscode.Diagnostic(
                range, 
                `Unknown function: ${funcName}`, 
                vscode.DiagnosticSeverity.Warning
            ));
        }
    }

    // 2. Validate IF/THEN/ELSE conditional syntax using stack analyzer and branch validators
    validateIfThenElseSyntax(text, diagnostics, document);

    collection.set(document.uri, diagnostics);
}

/**
 * Validates Simple and Nested IF/THEN/ELSE nesting using a stack machine
 */
function validateIfThenElseSyntax(text, diagnostics, document) {
    const tokens = tokenize(text);
    const stack = []; // Elements: { type: 'IF' | 'THEN', start: number, end: number, token: object }

    for (const token of tokens) {
        if (token.type !== 'keyword') continue;

        const valLower = token.value.toLowerCase();

        if (valLower === 'if') {
            stack.push({ type: 'IF', start: token.start, end: token.end, token });
        } else if (valLower === 'then') {
            if (stack.length === 0 || stack[stack.length - 1].type !== 'IF') {
                const range = new vscode.Range(
                    document.positionAt(token.start),
                    document.positionAt(token.end)
                );
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Unexpected THEN keyword. No matching IF found.`,
                    vscode.DiagnosticSeverity.Error
                ));
            } else {
                stack[stack.length - 1].type = 'THEN';
                stack[stack.length - 1].thenStart = token.start;
                stack[stack.length - 1].thenEnd = token.end;
            }
        } else if (valLower === 'else') {
            if (stack.length === 0 || stack[stack.length - 1].type !== 'THEN') {
                const range = new vscode.Range(
                    document.positionAt(token.start),
                    document.positionAt(token.end)
                );
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Unexpected ELSE keyword. No matching THEN found.`,
                    vscode.DiagnosticSeverity.Error
                ));
            } else {
                stack.pop();
            }
        }
    }

    while (stack.length > 0) {
        const item = stack.pop();
        if (item.type === 'IF') {
            const range = new vscode.Range(
                document.positionAt(item.start),
                document.positionAt(item.end)
            );
            diagnostics.push(new vscode.Diagnostic(
                range,
                `IF statement is missing its corresponding THEN block.`,
                vscode.DiagnosticSeverity.Error
            ));
        } else if (item.type === 'THEN') {
            const range = new vscode.Range(
                document.positionAt(item.thenStart),
                document.positionAt(item.thenEnd)
            );
            diagnostics.push(new vscode.Diagnostic(
                range,
                `THEN branch is missing its corresponding ELSE branch. Every IF-THEN block in PI AF Analysis must define an ELSE block.`,
                vscode.DiagnosticSeverity.Error
            ));
        }
    }

    // 3. Scan expression output branches for illegal comparisons/assignments
    const clauses = parseClauses(tokens);
    if (clauses) {
        for (const clause of clauses) {
            checkBodyForComparisons(clause.bodyTokens, diagnostics, document);
        }
    }
}

/**
 * Recursively scans THEN/ELSE bodies, ignoring any nested IF structures' conditions.
 */
function checkBodyForComparisons(bodyTokens, diagnostics, document) {
    const nestedClauses = parseClauses(bodyTokens);
    
    if (nestedClauses) {
        // Recursively validate nested bodies
        for (const clause of nestedClauses) {
            checkBodyForComparisons(clause.bodyTokens, diagnostics, document);
        }
        
        // Isolate and check tokens outside the nested clauses in this body
        const clauseTokenSet = new Set();
        for (const clause of nestedClauses) {
            if (clause.ifToken) clauseTokenSet.add(clause.ifToken);
            if (clause.thenToken) clauseTokenSet.add(clause.thenToken);
            if (clause.elseToken) clauseTokenSet.add(clause.elseToken);
            
            if (clause.conditionTokens) {
                for (const t of clause.conditionTokens) clauseTokenSet.add(t);
            }
            if (clause.bodyTokens) {
                for (const t of clause.bodyTokens) clauseTokenSet.add(t);
            }
        }
        
        for (const token of bodyTokens) {
            if (!clauseTokenSet.has(token)) {
                checkSingleTokenForComparison(token, diagnostics, document);
            }
        }
    } else {
        // Flat body structure
        for (const token of bodyTokens) {
            checkSingleTokenForComparison(token, diagnostics, document);
        }
    }
}

/**
 * Identifies and flags comparison and assignment operators in output scopes
 */
function checkSingleTokenForComparison(token, diagnostics, document) {
    if (token.type === 'operator') {
        const op = token.value;
        if (['=', '<>', '>', '<', '>=', '<=', '!=', '=='].includes(op)) {
            const range = new vscode.Range(
                document.positionAt(token.start),
                document.positionAt(token.end)
            );
            diagnostics.push(new vscode.Diagnostic(
                range,
                `Invalid syntax inside THEN/ELSE branch. Comparisons or assignments ('${op}') are not allowed here. Only operations (e.g., '+', '-') or function calls are permitted.`,
                vscode.DiagnosticSeverity.Error
            ));
        }
    }
}

/**
 * Parses expression into top-level clauses (case-insensitive)
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

function isKeyword(name) {
    return ["IF", "THEN", "ELSE", "AND", "OR", "NOT", "EXIT", "IN"].includes(name.toUpperCase());
}

module.exports = {
    updateDiagnostics
};