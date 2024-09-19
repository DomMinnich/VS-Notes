// Dev Dominic Minnich 2024

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "VS-Notes" is now active!');

    // Register the view provider for the activity bar icon
    const viewProvider = new NotesViewProvider(context);
    vscode.window.registerTreeDataProvider('vsNotesView', viewProvider);

    // Command to open the notes
    let disposable = vscode.commands.registerCommand('VS-Notes.openNotes', async () => {
        const notesUri = vscode.Uri.file(`${context.globalStorageUri.fsPath}/notes.txt`);

        try {
            // Check if the file exists
            await vscode.workspace.fs.stat(notesUri);
        } catch {
            // Create a new file if it doesn't exist
            await vscode.workspace.fs.writeFile(notesUri, new Uint8Array());
        }

        const document = await vscode.workspace.openTextDocument(notesUri);
        await vscode.window.showTextDocument(document);
    });

    context.subscriptions.push(disposable);
}

class NotesViewProvider implements vscode.TreeDataProvider<any> {
    constructor(private context: vscode.ExtensionContext) {}

    getTreeItem(element: any): vscode.TreeItem {
        return new vscode.TreeItem('Click to open notes');
    }

    getChildren(element?: any): any[] {
        return [];
    }
}

export function deactivate() {}
