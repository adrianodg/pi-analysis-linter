const vscode = require('vscode');
const { tokenize } = require('../parser/tokenizer');
const { parse } = require('../parser/parser');

/**
 * Basic Linter Logic utilizing AST structure.
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
            // Validate functions and parameter counts
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

                    // Exclude variable arguments or helper functions without rigid checks if needed
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
                    }
                }
            },

            // Check THEN and ELSE branches for illegal comparisons/assignments
            IfExpression(node) {
                checkBranchForIllegalComparisons(node.consequent, diagnostics, document);
                checkBranchForIllegalComparisons(node.alternate, diagnostics, document);
            }
        });
    }

    collection.set(document.uri, diagnostics);
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
            // Node types without child branches (e.g. Literal, Identifier, ErrorNode)
            break;
    }
}

/**
 * Validates output expression branches inside conditionals.
 * Reports comparison operators as syntax errors.
 */
function checkBranchForIllegalComparisons(node, diagnostics, document) {
    if (!node) return;

    // Nested IfExpressions will validate their own sub-branches natively
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
    // We ignore arguments inside FunctionCall branches during this context check,
    // as comparisons are perfectly valid inside nested function parameters (e.g. IF A THEN TagMax('b', 'x' = 5) ELSE 0).
}

module.exports = {
    updateDiagnostics
};