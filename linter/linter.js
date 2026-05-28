const vscode = require('vscode');
const { tokenize } = require('../parser/tokenizer');
const { parse } = require('../parser/parser');

/**
 * Basic Linter Logic utilizing AST structure and metadata definitions.
 */
function updateDiagnostics(document, collection, metadata) {
    if (document.languageId !== 'pi-analysis') return;

    const diagnostics = [];
    const text = document.getText();

    // 1. Tokenize and parse input
    const tokens = tokenize(text);
    const { ast, errors } = parse(tokens);

    // 2. Report Parser-detected syntax issues (e.g. mismatched parentheses, missing THEN/ELSE)
    errors.forEach((err) => {
        const range = new vscode.Range(
            document.positionAt(err.start),
            document.positionAt(err.end)
        );
        diagnostics.push(
            new vscode.Diagnostic(
                range,
                err.message,
                vscode.DiagnosticSeverity.Error
            )
        );
    });

    // 3. Traverse AST to validate semantic warnings and custom branch rules
    if (ast) {
        traverse(ast, {
            // Validate functions, parameter counts, and parameter types
            FunctionCall(node) {
                const funcName = node.callee.name;
                const meta = metadata[funcName.toLowerCase()];

                if (!meta) {
                    const range = new vscode.Range(
                        document.positionAt(node.callee.start),
                        document.positionAt(node.callee.end)
                    );
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `Unknown function: ${funcName}`,
                            vscode.DiagnosticSeverity.Warning
                        )
                    );
                } else if (meta.Arguments) {
                    const expectedCount = meta.Arguments.length;
                    const actualCount = node.arguments.length;

                    // Argument count diagnostic
                    if (expectedCount > 0 && actualCount !== expectedCount) {
                        const range = new vscode.Range(
                            document.positionAt(node.start),
                            document.positionAt(node.end)
                        );
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                `Function '${meta.Name}' expects ${expectedCount} arguments, but got ${actualCount}.`,
                                vscode.DiagnosticSeverity.Warning
                            )
                        );
                    } else {
                        // Deep semantic parameter validation using schema metadata
                        for (let i = 0; i < node.arguments.length; i++) {
                            const argNode = node.arguments[i];
                            const argMeta = meta.Arguments[i];
                            if (!argMeta) continue;

                            const nameLower = (argMeta.name || '').toLowerCase();
                            const descLower = (argMeta.description || '').toLowerCase();

                            // Rule 1: Attribute name check (must be single-quoted)
                            const isAttrParam = nameLower === 'attname' || (descLower.includes('single quotes') && descLower.includes('attribute'));
                            if (isAttrParam) {
                                if (argNode.type === 'Literal') {
                                    if (argNode.quote !== 'single') {
                                        diagnostics.push(new vscode.Diagnostic(
                                            new vscode.Range(document.positionAt(argNode.start), document.positionAt(argNode.end)),
                                            `Attribute names must be enclosed in single quotes (e.g., 'attribute_name'), not double quotes.`,
                                            vscode.DiagnosticSeverity.Error
                                        ));
                                    }
                                } else if (argNode.type !== 'Identifier') {
                                    diagnostics.push(new vscode.Diagnostic(
                                        new vscode.Range(document.positionAt(argNode.start), document.positionAt(argNode.end)),
                                        `Expected an attribute name enclosed in single quotes (e.g., 'attribute_name').`,
                                        vscode.DiagnosticSeverity.Error
                                    ));
                                }
                            }

                            // Rule 2: Time argument checks (must be single-quoted)
                            const isTimeParam = nameLower === 'starttime' ||
                                nameLower === 'endtime' ||
                                nameLower === 't1' ||
                                nameLower === 't2' ||
                                (descLower.includes('time') && descLower.includes('single quote'));
                            if (isTimeParam) {
                                if (argNode.type === 'Literal') {
                                    if (argNode.quote !== 'single') {
                                        diagnostics.push(new vscode.Diagnostic(
                                            new vscode.Range(document.positionAt(argNode.start), document.positionAt(argNode.end)),
                                            `Time expressions must be enclosed in single quotes (e.g., '*-1h' or 't'), not double quotes.`,
                                            vscode.DiagnosticSeverity.Error
                                        ));
                                    }
                                }
                            }

                            // Rule 3: Numeric expectation type-checking
                            const isNumericParam = nameLower === 'x' || descLower.includes('number') || descLower.includes('integer') || descLower.includes('real');
                            if (isNumericParam && argNode.type === 'Literal' && argNode.quote === 'double') {
                                diagnostics.push(new vscode.Diagnostic(
                                    new vscode.Range(document.positionAt(argNode.start), document.positionAt(argNode.end)),
                                    `Expected a numeric expression or attribute, but received a text literal string (enclosed in double quotes).`,
                                    vscode.DiagnosticSeverity.Error
                                ));
                            }
                        }
                    }
                }
            },

            // Validate THEN and ELSE branches for illegal comparisons
            IfExpression(node) {
                checkBranchForIllegalComparisons(node.consequent, diagnostics, document);
                checkBranchForIllegalComparisons(node.alternate, diagnostics, document);
            },

            // Validate comparison elements for single-quoted string mismatches
            BinaryExpression(node) {
                const comparisonOperators = ['=', '<>', '>', '<', '>=', '<=', '!=', '=='];
                if (comparisonOperators.includes(node.operator)) {
                    checkComparisonOperand(node.left, diagnostics, document);
                    checkComparisonOperand(node.right, diagnostics, document);
                }
            }
        });
    }

    collection.set(document.uri, diagnostics);
}

/**
 * Flags single-quoted string literals that are likely used as string values in a comparison,
 * which the engine would misinterpret as attribute lookups.
 */
function checkComparisonOperand(node, diagnostics, document) {
    if (!node) return;
    if (node.type === 'Literal' && node.quote === 'single') {
        // Exclude common relative time values to prevent false positives in time calculations
        const val = node.value ? node.value.replace(/['"]/g, '') : '';
        const isTimeLike = val === '*' || val === 't' || val === 'y' || /^[*-+]/i.test(val);

        if (!isTimeLike) {
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(document.positionAt(node.start), document.positionAt(node.end)),
                `Single quotes indicate attribute lookups in PI AF. If you intended to match against a literal string value, use double quotes (e.g., "${val}") instead.`,
                vscode.DiagnosticSeverity.Warning
            ));
        }
    }
}

/**
 * Simple AST Traverser / Visitor Utility
 */
function traverse(node, visitor) {
    if (!node) return;

    if (visitor[node.type]) {
        visitor[node.type](node);
    }

    switch (node.type) {
        case 'IfExpression':
            traverse(node.test, visitor);
            traverse(node.consequent, visitor);
            traverse(node.alternate, visitor);
            break;
        case 'BinaryExpression':
            traverse(node.left, visitor);
            traverse(node.right, visitor);
            break;
        case 'UnaryExpression':
            traverse(node.argument, visitor);
            break;
        case 'GroupExpression':
            traverse(node.expression, visitor);
            break;
        case 'FunctionCall':
            traverse(node.callee, visitor);
            if (node.arguments) {
                node.arguments.forEach((arg) => traverse(arg, visitor));
            }
            break;
        default:
            break;
    }
}

/**
 * Validates output expression branches inside conditionals.
 * Reports comparison operators as syntax errors.
 */
function checkBranchForIllegalComparisons(node, diagnostics, document) {
    if (!node) return;

    if (node.type === 'IfExpression') {
        return;
    }

    if (node.type === 'BinaryExpression') {
        const comparisonOperators = ['=', '<>', '>', '<', '>=', '<=', '!=', '=='];
        if (comparisonOperators.includes(node.operator)) {
            const range = new vscode.Range(
                document.positionAt(node.start),
                document.positionAt(node.end)
            );
            diagnostics.push(
                new vscode.Diagnostic(
                    range,
                    `Invalid syntax inside THEN/ELSE branch. Comparisons or assignments ('${node.operator}') are not allowed here. Only operations (e.g., '+', '-') or function calls are permitted.`,
                    vscode.DiagnosticSeverity.Error
                )
            );
        }
        checkBranchForIllegalComparisons(node.left, diagnostics, document);
        checkBranchForIllegalComparisons(node.right, diagnostics, document);
    } else if (node.type === 'UnaryExpression') {
        checkBranchForIllegalComparisons(node.argument, diagnostics, document);
    } else if (node.type === 'GroupExpression') {
        checkBranchForIllegalComparisons(node.expression, diagnostics, document);
    }
}

module.exports = {
    updateDiagnostics
};