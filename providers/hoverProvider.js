const vscode = require('vscode');

class PiAnalysisHoverProvider {
    /**
     * @param {Record<string, any>} metadata The lookup object of loaded function metadata.
     */
    constructor(metadata) {
        this.metadata = metadata;
    }

    /**
     * @param {vscode.TextDocument} document 
     * @param {vscode.Position} position 
     * @returns {vscode.ProviderResult<vscode.Hover>}
     */
    provideHover(document, position) {
        // Get the word at the current mouse position
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
            return null;
        }

        const word = document.getText(range);

        // Check if the word exists in our metadata (case-sensitive check)
        const meta = this.metadata[word];

        if (meta) {
            const markdown = new vscode.MarkdownString();
            
            // Title and Description
            markdown.appendMarkdown(`### ${meta.Name}\n`);
            markdown.appendMarkdown(`${meta.Description}\n\n`);
            
            // Syntax Section
            markdown.appendMarkdown(`**Syntax:**\n`);
            markdown.appendCodeblock(meta.Syntax, 'pi-analysis');

            // Returns Section
            if (meta.Returns) {
                markdown.appendMarkdown(`**Returns:** ${meta.Returns}\n\n`);
            }

            // Example Section
            if (meta.Example && meta.Example.length > 0) {
                markdown.appendMarkdown(`--- \n**Example:**\n`);
                meta.Example.forEach(ex => {
                    markdown.appendCodeblock(ex.code, 'pi-analysis');
                    if (ex.description !== "None") {
                        markdown.appendMarkdown(`*${ex.description}*\n`);
                    }
                });
            }

            return new vscode.Hover(markdown);
        }

        return null; // No hover for this word
    }
}

module.exports = { PiAnalysisHoverProvider };