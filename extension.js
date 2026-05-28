const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const { formatDocument } = require('./formatter/formatter');
const { PiAnalysisHoverProvider } = require('./providers/hoverProvider');
const { updateDiagnostics } = require('./linter/linter');

/**
 * Activates the PI Analysis extension.
 *
 * @param {vscode.ExtensionContext} context The VS Code extension context.
 */
function activate(context) {
    const functionMetadata = loadFunctionMetadata(context);

    const diagnosticCollection = vscode.languages.createDiagnosticCollection(
        'pi-analysis'
    );

    context.subscriptions.push(diagnosticCollection);

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            updateDiagnostics(
                event.document,
                diagnosticCollection,
                functionMetadata
            );
        }),
        vscode.workspace.onDidOpenTextDocument((document) => {
            updateDiagnostics(
                document,
                diagnosticCollection,
                functionMetadata
            );
        }),
        vscode.workspace.onDidCloseTextDocument((document) => {
            diagnosticCollection.delete(document.uri);
        })
    );

    vscode.workspace.textDocuments.forEach((document) => {
        updateDiagnostics(document, diagnosticCollection, functionMetadata);
    });

    const hoverProvider = vscode.languages.registerHoverProvider(
        'pi-analysis',
        new PiAnalysisHoverProvider(functionMetadata)
    );

    context.subscriptions.push(hoverProvider);

    const formattingProvider =
        vscode.languages.registerDocumentFormattingEditProvider(
            'pi-analysis',
            {
                provideDocumentFormattingEdits(document) {
                    const config =
                        vscode.workspace.getConfiguration('piAnalysis');

                    const maxLineLength = config.get(
                        'formatter.maxLineLength',
                        100
                    );

                    const formatted = formatDocument(document.getText(), {
                        maxLineLength
                    });

                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(document.getText().length)
                    );

                    return [vscode.TextEdit.replace(fullRange, formatted)];
                }
            }
        );

    context.subscriptions.push(formattingProvider);
}

/**
 * Loads PI Analysis function metadata from JSON files.
 *
 * @param {vscode.ExtensionContext} context The VS Code extension context.
 * @returns {Record<string, object>} Function metadata indexed by lowercase name.
 */
function loadFunctionMetadata(context) {
    const dir = path.join(context.extensionPath, 'function_examples');
    const metadata = {};

    try {
        if (!fs.existsSync(dir)) {
            return metadata;
        }

        const files = fs.readdirSync(dir);

        files.forEach((file) => {
            if (!file.endsWith('.json')) {
                return;
            }

            const filePath = path.join(dir, file);
            const rawContent = fs.readFileSync(filePath, 'utf8');
            const content = JSON.parse(rawContent);

            if (!content.Name) {
                return;
            }

            metadata[content.Name.toLowerCase()] = content;
        });
    } catch (error) {
        console.error('Error loading PI Analysis metadata:', error);
    }

    return metadata;
}

/**
 * Deactivates the PI Analysis extension.
 */
function deactivate() {}

module.exports = {
    activate,
    deactivate
};