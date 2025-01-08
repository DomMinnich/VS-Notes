/* ------------------------------------------------------------------------------------
 * VS-QuickNotes
 * v2.2.0
 *
 * CHANGES:
 *  1) Replaces old "Global Search" with a live QuickPick-based search that filters
 *     both filenames and file content in real time as you type.
 *  2) Maintains pinned/regular notes, quick templates, rename, delete, etc.
 * 
 * Developer:
 *  - Dominic Minnich (GitHub: @DomMinnich)
 * ------------------------------------------------------------------------------------
 */

import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    const notesProvider = new NotesProvider(context);
    vscode.window.registerTreeDataProvider('vsNotesView', notesProvider);

    // Create a new note
    context.subscriptions.push(
        vscode.commands.registerCommand('VS-Notes.newNote', async () => {
            const noteName = await vscode.window.showInputBox({
                prompt: 'Enter the name of the new note (include .md for Markdown)',
                placeHolder: 'Note name',
            });

            if (!noteName) {
                return;
            }

            const hasExtension = noteName.endsWith('.txt') || noteName.endsWith('.md');
            const noteFileName = hasExtension ? noteName : `${noteName}.txt`;
            const notesUri = vscode.Uri.file(path.join(context.globalStorageUri.fsPath, noteFileName));

            await vscode.workspace.fs.writeFile(notesUri, new Uint8Array());
            notesProvider.refresh();
        })
    );

    // Open a note
    context.subscriptions.push(
        vscode.commands.registerCommand('VS-Notes.openNote', async (noteUri: vscode.Uri) => {
            const document = await vscode.workspace.openTextDocument(noteUri);
            await vscode.window.showTextDocument(document);
        })
    );

    // Rename note
    context.subscriptions.push(
        vscode.commands.registerCommand('VS-Notes.renameNote', async (note: NoteItem) => {
            const newName = await vscode.window.showInputBox({
                prompt: 'Enter new name (include .md for Markdown)',
                // If label is a string or TreeItemLabel, extract the text portion
                value: typeof note.label === 'string'
                    ? note.label
                    : (note.label as vscode.TreeItemLabel)?.label
            });

            if (!newName) {
                return;
            }

            const oldUri = note.resourceUri;
            if (!oldUri) {
                vscode.window.showErrorMessage('Could not rename note (missing URI).');
                return;
            }

            const hasExtension = newName.endsWith('.txt') || newName.endsWith('.md');
            const finalName = hasExtension ? newName : `${newName}.txt`;
            const newUri = vscode.Uri.file(path.join(note.extensionContext.globalStorageUri.fsPath, finalName));

            try {
                await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });

                // If it was pinned, update the pinned list
                const pinnedNotes = note.extensionContext.globalState.get<string[]>('pinnedNotes') || [];
                const index = pinnedNotes.indexOf(path.basename(oldUri.fsPath));
                if (index !== -1) {
                    pinnedNotes[index] = finalName;
                    await note.extensionContext.globalState.update('pinnedNotes', pinnedNotes);
                }

                notesProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Rename failed: ${(error as Error).message}`);
            }
        })
    );

    // Delete note
    context.subscriptions.push(
        vscode.commands.registerCommand('VS-Notes.deleteNote', async (note: NoteItem) => {
            const shouldDelete = await vscode.window.showWarningMessage(
                `Are you sure you want to delete "${note.label}"?`,
                { modal: true },
                'Delete'
            );

            if (shouldDelete !== 'Delete') {
                return;
            }

            const noteUri = note.resourceUri;
            if (!noteUri) {
                vscode.window.showErrorMessage('Could not delete note (missing URI).');
                return;
            }

            try {
                // If pinned, remove from pinned list
                const pinnedNotes = note.extensionContext.globalState.get<string[]>('pinnedNotes') || [];
                const index = pinnedNotes.indexOf(path.basename(noteUri.fsPath));
                if (index !== -1) {
                    pinnedNotes.splice(index, 1);
                    await note.extensionContext.globalState.update('pinnedNotes', pinnedNotes);
                }

                await vscode.workspace.fs.delete(noteUri, { useTrash: true });
                notesProvider.refresh();
            } catch (err) {
                vscode.window.showErrorMessage(`Could not delete note: ${(err as Error).message}`);
            }
        })
    );

    // Pin note
    context.subscriptions.push(
        vscode.commands.registerCommand('VS-Notes.pinNote', async (note: NoteItem) => {
            const pinnedNotes = note.extensionContext.globalState.get<string[]>('pinnedNotes') || [];
            const noteBaseName = path.basename(note.resourceUri?.fsPath || '');
            if (!pinnedNotes.includes(noteBaseName)) {
                pinnedNotes.push(noteBaseName);
                await note.extensionContext.globalState.update('pinnedNotes', pinnedNotes);
            }
            notesProvider.refresh();
        })
    );

    // Unpin note
    context.subscriptions.push(
        vscode.commands.registerCommand('VS-Notes.unpinNote', async (note: NoteItem) => {
            const pinnedNotes = note.extensionContext.globalState.get<string[]>('pinnedNotes') || [];
            const noteBaseName = path.basename(note.resourceUri?.fsPath || '');
            const index = pinnedNotes.indexOf(noteBaseName);
            if (index !== -1) {
                pinnedNotes.splice(index, 1);
                await note.extensionContext.globalState.update('pinnedNotes', pinnedNotes);
            }
            notesProvider.refresh();
        })
    );

    // Quick Templates
    context.subscriptions.push(
        vscode.commands.registerCommand('VS-Notes.quickTemplate', async () => {
            const templates: { label: string; detail: string; content: string; extension: string }[] = [
                {
                    label: 'TODO Template',
                    detail: 'Creates a TODO note (.txt)',
                    content: 'TODO:\n- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3\n',
                    extension: '.txt'
                },
                {
                    label: 'Meeting Notes Template',
                    detail: 'Creates a meeting notes file (.md)',
                    content: '# Meeting Notes\n\n**Date**: \n\n**Attendees**:\n- \n\n**Agenda**:\n\n1. \n2. \n3. \n',
                    extension: '.md'
                },
                {
                    label: 'Code Snippet Template',
                    detail: 'Creates a code snippet note (.txt)',
                    content: '// Code Snippet\nfunction example() {\n    console.log("Hello World");\n}\n',
                    extension: '.txt'
                },
                {
                    label: 'Markdown Document Template',
                    detail: 'Creates a generic markdown document (.md)',
                    content: '# Title\n\nWrite your content here...\n',
                    extension: '.md'
                }
            ];

            const pick = await vscode.window.showQuickPick(templates, {
                placeHolder: 'Select a template to create a new note'
            });

            if (!pick) {
                return;
            }

            const fileName = await vscode.window.showInputBox({
                prompt: `Enter a name for your new note (saved as ${pick.extension})`
            });

            if (!fileName) {
                return;
            }

            const finalFileName = fileName.endsWith(pick.extension) ? fileName : `${fileName}${pick.extension}`;
            const notesUri = vscode.Uri.file(path.join(context.globalStorageUri.fsPath, finalFileName));

            // Write template content
            await vscode.workspace.fs.writeFile(notesUri, Buffer.from(pick.content, 'utf8'));
            notesProvider.refresh();

            // Open the new note
            const document = await vscode.workspace.openTextDocument(notesUri);
            await vscode.window.showTextDocument(document);
        })
    );

    /**
     * Command: "VS-Notes.searchNotes" - Live QuickPick-based search for .txt / .md
     * - Reads all note contents upfront
     * - Then uses quickPick.onDidChangeValue to filter them in real-time
     * - On selection, opens the chosen note
     */
    context.subscriptions.push(
        vscode.commands.registerCommand('VS-Notes.searchNotes', async () => {
            // 1) Gather all .txt / .md notes from globalStorage
            const readDir = await vscode.workspace.fs.readDirectory(context.globalStorageUri);
            const noteFileNames = readDir
                .filter(([name, fileType]) => fileType === vscode.FileType.File && (name.endsWith('.txt') || name.endsWith('.md')))
                .map(([name]) => name);

            if (noteFileNames.length === 0) {
                vscode.window.showInformationMessage(`No .txt or .md notes found in ${context.globalStorageUri.fsPath}`);
                return;
            }

            // 2) Load each note's content
            interface NoteData {
                fileName: string;
                uri: vscode.Uri;
                content: string;
            }
            const allNotes: NoteData[] = [];
            for (const fileName of noteFileNames) {
                const noteUri = vscode.Uri.file(path.join(context.globalStorageUri.fsPath, fileName));
                const contentBytes = await vscode.workspace.fs.readFile(noteUri);
                const content = contentBytes.toString();
                allNotes.push({ fileName, uri: noteUri, content });
            }

            // 3) Create a QuickPick
            const quickPick = vscode.window.createQuickPick();
            quickPick.placeholder = 'Type to search note filenames & 10000 char contents...';
            quickPick.matchOnDescription = true;
            quickPick.matchOnDetail = true;

            // Helper to update QuickPick items based on user input
            function updateItems(search: string) {
                const term = search.toLowerCase().trim();
                // If empty, show all
                const filtered = term
                    ? allNotes.filter(note =>
                        note.fileName.toLowerCase().includes(term) ||
                        note.content.toLowerCase().includes(term)
                    )
                    : allNotes;

                // Map to QuickPickItem
                quickPick.items = filtered.map(note => {
                    // Optionally show a snippet from the note as "detail" or "description"
                    const snippet = note.content.length > 10000
                        ? note.content.substring(0, 10000).replace(/\r?\n/g, ' ') + '...'
                        : note.content.replace(/\r?\n/g, ' ');
                    return {
                        label: note.fileName,
                        description: '',
                        detail: snippet
                    };
                });
            }

            // Initialize items (all notes)
            updateItems('');

            // As user types, filter in real-time
            quickPick.onDidChangeValue(value => updateItems(value));

            // When user picks a note, open it
            quickPick.onDidAccept(async () => {
                const selection = quickPick.selectedItems[0];
                if (!selection) {
                    return;
                }
                // Find the chosen note
                const pickedNote = allNotes.find(n => n.fileName === selection.label);
                if (pickedNote) {
                    const doc = await vscode.workspace.openTextDocument(pickedNote.uri);
                    await vscode.window.showTextDocument(doc);
                }
                quickPick.hide();
            });

            // Show the QuickPick
            quickPick.show();
        })
    );
}

export function deactivate() {}

/**
 * NotesProvider: pinned/regular notes tree
 */
class NotesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> =
        new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        // Root items: "New Note" button, "Search" button, pinned section, regular section
        if (!element) {
            const pinnedItem = new PinnedSectionItem('Pinned Notes', vscode.TreeItemCollapsibleState.Collapsed);
            const regularItem = new RegularSectionItem('Regular Notes', vscode.TreeItemCollapsibleState.Collapsed);

            return [
                new NewNoteButton(),
                new SearchNotesButton(),
                pinnedItem,
                regularItem
            ];
        }

        // If pinned section => show pinned notes
        if (element instanceof PinnedSectionItem) {
            const pinnedNames = this.context.globalState.get<string[]>('pinnedNotes') || [];
            const readDir = await vscode.workspace.fs.readDirectory(this.context.globalStorageUri);

            const pinnedFiles = readDir
                .filter(([name, fileType]) => fileType === vscode.FileType.File && pinnedNames.includes(name))
                .map(([name]) => name)
                .sort();

            return pinnedFiles.map(fileName => {
                const fileUri = vscode.Uri.file(path.join(this.context.globalStorageUri.fsPath, fileName));
                return new NoteItem(fileName, fileUri, this.context, true);
            });
        }

        // If regular section => show non-pinned .txt/.md
        if (element instanceof RegularSectionItem) {
            const pinnedNames = this.context.globalState.get<string[]>('pinnedNotes') || [];
            const readDir = await vscode.workspace.fs.readDirectory(this.context.globalStorageUri);

            const regularFiles = readDir
                .filter(([name, fileType]) => {
                    if (fileType !== vscode.FileType.File) return false;
                    if (!name.endsWith('.txt') && !name.endsWith('.md')) return false;
                    if (pinnedNames.includes(name)) return false;
                    return true;
                })
                .map(([name]) => name)
                .sort();

            return regularFiles.map(fileName => {
                const fileUri = vscode.Uri.file(path.join(this.context.globalStorageUri.fsPath, fileName));
                return new NoteItem(fileName, fileUri, this.context, false);
            });
        }

        return [];
    }
}

/**
 * Represents the pinned notes section
 */
class PinnedSectionItem extends vscode.TreeItem {
    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState);
        this.iconPath = new vscode.ThemeIcon('pin');
        this.contextValue = 'pinnedSection';
        this.description = 'All your pinned notes here.';
    }
}

/**
 * Represents the regular notes section
 */
class RegularSectionItem extends vscode.TreeItem {
    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState);
        this.iconPath = new vscode.ThemeIcon('files');
        this.contextValue = 'regularSection';
        this.description = 'All your regular notes here.';
    }
}

/**
 * Represents a single note item (pinned or regular).
 */
class NoteItem extends vscode.TreeItem {
    constructor(
        public readonly noteName: string,
        public readonly resourceUri: vscode.Uri,
        public readonly extensionContext: vscode.ExtensionContext,
        public readonly pinned: boolean
    ) {
        super(noteName, vscode.TreeItemCollapsibleState.None);

        // Click to open
        this.command = {
            command: 'VS-Notes.openNote',
            title: 'Open Note',
            arguments: [resourceUri]
        };

        if (pinned) {
            // pinned => green pin icon
            this.iconPath = new vscode.ThemeIcon('pin', new vscode.ThemeColor('charts.green'));
            this.tooltip = `Pinned Note: ${this.noteName}`;
            this.contextValue = 'pinnedNoteItem';
        } else {
            // regular => note icon
            this.iconPath = new vscode.ThemeIcon('note');
            this.tooltip = this.noteName;
            this.contextValue = 'regularNoteItem';
        }
    }
}

/**
 * "Create A New Note" button at top
 */
class NewNoteButton extends vscode.TreeItem {
    constructor() {
        super('Create A New Note', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('add');
        this.command = {
            command: 'VS-Notes.newNote',
            title: 'Create A New Note'
        };
        this.contextValue = 'newNoteButton';
    }
}

/**
 * "Search Notes" button at top
 */
class SearchNotesButton extends vscode.TreeItem {
    constructor() {
        super('Live Search In Notes', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('search');
        this.command = {
            command: 'VS-Notes.searchNotes',
            title: 'Live Search Notes'
        };
        this.contextValue = 'searchNotesButton';
    }
}
