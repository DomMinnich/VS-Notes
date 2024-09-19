// Dev Dominic Minnich 2024

import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    const notesProvider = new NotesProvider(context);
    vscode.window.registerTreeDataProvider('vsNotesView', notesProvider);

    // Command to create a new note
    vscode.commands.registerCommand('VS-Notes.newNote', async () => {
        const noteName = await vscode.window.showInputBox({
            prompt: 'Enter the name of the new note',
            placeHolder: 'Note name',
        });

        if (noteName) {
            const noteFileName = noteName.endsWith('.txt') ? noteName : `${noteName}.txt`;
            const notesUri = vscode.Uri.file(path.join(context.globalStorageUri.fsPath, noteFileName));
            await vscode.workspace.fs.writeFile(notesUri, new Uint8Array());
            notesProvider.refresh(); // Refresh the notes list
        }
    });

    // Command to open a note
    vscode.commands.registerCommand('VS-Notes.openNote', async (note: vscode.Uri) => {
        const document = await vscode.workspace.openTextDocument(note);
        await vscode.window.showTextDocument(document);
    });

    // Command to rename a note
    vscode.commands.registerCommand('VS-Notes.renameNote', async (note: NoteItem) => {
        const newName = await vscode.window.showInputBox({
            prompt: 'Enter the new name for the note (without extension)',
            placeHolder: 'New note name',
            value: note.label // current note name
        });

        if (newName) {
            const oldUri = note.command?.arguments ? note.command.arguments[0] as vscode.Uri : null;
            const newUri = vscode.Uri.file(path.join(context.globalStorageUri.fsPath, `${newName}.txt`)); // Automatically append .txt

            if (oldUri) {
                try {
                    await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });
                    notesProvider.refresh(); // Refresh the notes list
                } catch (error) {
                    vscode.window.showErrorMessage(`Could not rename note: ${error}`);
                }
            } else {
                vscode.window.showErrorMessage(`Could not rename note: Original note not found.`);
            }
        }
    });

    // Command to delete a note
    vscode.commands.registerCommand('VS-Notes.deleteNote', async (note: NoteItem) => {
        const shouldDelete = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${note.label}"?`,
            { modal: true },
            'Delete'
        );

        if (shouldDelete === 'Delete') {
            const noteUri = note.command?.arguments ? note.command.arguments[0] as vscode.Uri : null;

            if (noteUri) {
                try {
                    await vscode.workspace.fs.delete(noteUri, { useTrash: true });
                    notesProvider.refresh(); // Refresh the notes list
                } catch (error) {
                    vscode.window.showErrorMessage(`Could not delete note: ${error}`);
                }
            } else {
                vscode.window.showErrorMessage(`Could not delete note: File not found.`);
            }
        }
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('VS-Notes.refreshNotes', () => notesProvider.refresh())
    );
}

class NotesProvider implements vscode.TreeDataProvider<NoteItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<NoteItem | undefined | void> = new vscode.EventEmitter<NoteItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<NoteItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: NoteItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<NoteItem[]> {
        const notesUri = await vscode.workspace.fs.readDirectory(this.context.globalStorageUri);
        const noteItems = notesUri
            .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.txt'))
            .map(([name]) => {
                const fileUri = vscode.Uri.file(path.join(this.context.globalStorageUri.fsPath, name));
                return new NoteItem(name, vscode.TreeItemCollapsibleState.None, {
                    command: 'VS-Notes.openNote',
                    title: 'Open Note',
                    arguments: [fileUri],
                }, 'noteItem'); // Only regular notes get this context value
            });

        // Add the "New Note" button, the spacer, and the title
        return [
            new NoteItem('Create A New Note', vscode.TreeItemCollapsibleState.None, {
                command: 'VS-Notes.newNote',
                title: 'New Note',
            }, 'newNoteButton'),  // No rename/delete for this
            new SpacerItem(),  // Spacer
            new TitleItem('Your Notes List:'),  // Title
            ...noteItems
        ];
    }
}

// SpacerItem Class to add spacing
class SpacerItem extends vscode.TreeItem {
    label: string;
    collapsibleState: vscode.TreeItemCollapsibleState;
    iconPath: vscode.ThemeIcon;

    constructor() {
        super(' ', vscode.TreeItemCollapsibleState.None);  // Give the SpacerItem an explicit space label
        this.label = ' ';
        this.contextValue = 'spacer'; // No rename/delete for this
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        this.iconPath = new vscode.ThemeIcon('blank'); // Assign a default icon
    }
}

// TitleItem Class for displaying "Your Notes List:"
class TitleItem extends vscode.TreeItem {
    label: string;
    collapsibleState: vscode.TreeItemCollapsibleState;

    constructor(label: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.contextValue = 'title'; // No rename/delete for this
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }

    iconPath = new vscode.ThemeIcon('list-tree');
}

// NoteItem class for notes
class NoteItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
        public readonly contextValue?: string // Use contextValue for filtering context menus
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
    }

    iconPath = new vscode.ThemeIcon('note');
}

export function deactivate() {}
