const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { formatDocument } = require('./formatter/formatter');
const { PiAnalysisHoverProvider } = require('./providers/hoverProvider');
const { updateDiagnostics } = require('./linter/linter');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // 1. Load function metadata from the JSON files
    const functionMetadata = loadFunctionMetadata(context);

    // 2. Register the Linter (Diagnostic Collection)
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('pi-analysis');
    context.subscriptions.push(diagnosticCollection);

    // Trigger linter on document events
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => updateDiagnostics(e.document, diagnosticCollection, functionMetadata)),
        vscode.workspace.onDidOpenTextDocument(doc => updateDiagnostics(doc, diagnosticCollection, functionMetadata))
    );

    // 3. Register the Hover Provider
    const hoverProvider = vscode.languages.registerHoverProvider(
        'pi-analysis',
        new PiAnalysisHoverProvider(functionMetadata)
    );
    context.subscriptions.push(hoverProvider);

    // 4. Register the Formatter
    const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider('pi-analysis', {
        provideDocumentFormattingEdits(document) {
            const formatted = formatDocument(document.getText());
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            return [vscode.TextEdit.replace(fullRange, formatted)];
        }
    });

    context.subscriptions.push(formattingProvider);
}


/**
 * Loads all JSON files from the function_examples directory into a lookup object
 */
function loadFunctionMetadata(context) {
    const dir = path.join(context.extensionPath, 'function_examples');
    const metadata = {};
    try {
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (file.endsWith('.json')) {
                    const filePath = path.join(dir, file);
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    metadata[content.Name] = content;
                }
            });
        }
    } catch (e) {
        console.error("Error loading PI Analysis metadata:", e);
    }
    return metadata;
}

function deactivate() {}

module.exports = { activate, deactivate };