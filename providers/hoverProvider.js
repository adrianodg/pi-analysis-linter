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
        // Use a word pattern regex to ensure accurate function/identifier bounds
        const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
        if (!range) {
            return null;
        }

        const word = document.getText(range);

        // Convert the word to lowercase to match keys generated during metadata loading
        const meta = this.metadata[word.toLowerCase()];

        if (meta) {
            const markdown = new vscode.MarkdownString();
            
            // 1. Title and Description
            markdown.appendMarkdown(`## ${meta.Name}\n`);
            if (meta.Description && meta.Description !== "None") {
                markdown.appendMarkdown(`${meta.Description}\n\n`);
            }
            
            // 2. Syntax Section
            if (meta.Syntax && meta.Syntax !== "None") {
                markdown.appendMarkdown(`### Syntax:\n`);
                markdown.appendCodeblock(meta.Syntax, 'pi-analysis');
                markdown.appendMarkdown(`\n`);
            }

            // 3. Arguments Section (Iterates through array of parameter objects)
            if (meta.Arguments && Array.isArray(meta.Arguments) && meta.Arguments.length > 0) {
                // Ignore empty-like descriptions or placeholders
                const validArgs = meta.Arguments.filter(arg => arg.name && arg.name !== "None");
                if (validArgs.length > 0) {
                    markdown.appendMarkdown(`### Arguments:\n`);
                    validArgs.forEach(arg => {
                        markdown.appendMarkdown(`* **${arg.name}**: ${arg.description}\n`);
                    });

                    markdown.appendMarkdown(`\n`);
                }
            }

            // 4. Returns Section
            if (meta.Returns && meta.Returns !== "None") {
                markdown.appendMarkdown(`### Returns:\n`);
                markdown.appendMarkdown(`${meta.Returns}\n\n`);
            }

            // 5. Exceptions Section
            if (meta.Exceptions && meta.Exceptions !== "None") {
                markdown.appendMarkdown(`### Exceptions: ${meta.Exceptions}\n\n`);
            }

            // 6. Notes Section
            if (meta.Notes && meta.Notes !== "None") {
                markdown.appendMarkdown(`### Notes:\n`);
                markdown.appendMarkdown(`${meta.Notes}\n\n`);
            }

            // 7. Example Section
            if (meta.Example && meta.Example.length > 0) {
                markdown.appendMarkdown(`---\n### Example:\n`);
                meta.Example.forEach(ex => {
                    markdown.appendCodeblock(ex.code, 'pi-analysis');
                    if (ex.description && ex.description !== "None") {
                        markdown.appendMarkdown(`*${ex.description}*\n`);
                    }
                });
            }

            return new vscode.Hover(markdown, range);
        }

        return null; // No hover for this word
    }
}

module.exports = { PiAnalysisHoverProvider };