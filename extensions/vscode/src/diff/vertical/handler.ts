import { ApplyState } from "core/protocol/ideWebview";
import * as vscode from "vscode";

import {
  DecorationTypeRangeManager,
  belowIndexDecorationType,
  greenDecorationType,
  indexDecorationType,
  redDecorationType,
} from "./decorations";

import type { VerticalDiffCodeLens } from "./manager";
import type { DiffLine } from "core";

export interface VerticalDiffHandlerOptions {
  input?: string;
  instant?: boolean;
  onStatusUpdate: (
    status?: ApplyState["status"],
    numDiffs?: ApplyState["numDiffs"],
  ) => void;
}

export class VerticalDiffHandler implements vscode.Disposable {
  private currentLineIndex: number;
  private cancelled = false;
  private newLinesAdded = 0;
  private get diffBlocks() {
    console.log('vertical/handler.ts VerticalDiffHandler diffBlocks()')
    let blocks = this.editorToVerticalDiffCodeLens.get(this.filepath);
    if (!blocks) {
      blocks = [];
      this.editorToVerticalDiffCodeLens.set(this.filepath, blocks);
    }
    console.log('Current blocks:', blocks);
    return blocks;
  }
  public get range(): vscode.Range {
    const startLine = Math.min(this.startLine, this.endLine);
    const endLine = Math.max(this.startLine, this.endLine);
    return new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
  }

  constructor(
    private startLine: number,
    private endLine: number,
    private editor: vscode.TextEditor,
    private readonly editorToVerticalDiffCodeLens: Map<
      string,
      VerticalDiffCodeLens[]
    >,
    private readonly clearForFilepath: (
      filepath: string | undefined,
      accept: boolean,
    ) => void,
    private readonly refreshCodeLens: () => void,
    public options: VerticalDiffHandlerOptions,
  ) {
    this.currentLineIndex = startLine;

    this.redDecorationManager = new DecorationTypeRangeManager(
      redDecorationType,
      this.editor,
    );

    this.greenDecorationManager = new DecorationTypeRangeManager(
      greenDecorationType,
      this.editor,
    );

    const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
      // When we switch away and back to this editor, need to re-draw decorations
      if (editor?.document.uri.fsPath === this.filepath) {
        this.editor = editor;
        this.redDecorationManager.applyToNewEditor(editor);
        this.greenDecorationManager.applyToNewEditor(editor);
        this.updateIndexLineDecorations();
        this.refreshCodeLens();

        // Handle any lines received while editor was closed
        this.queueDiffLine(undefined);
      }
    });
    this.disposables.push(disposable);
  }

  private get filepath() {
    return this.editor.document.uri.fsPath;
  }

  private deletionBuffer: string[] = [];
  private redDecorationManager: DecorationTypeRangeManager;
  insertedInCurrentBlock = 0;

  private async insertDeletionBuffer() {
    // Don't remove trailing whitespace line
    const totalDeletedContent = this.deletionBuffer.join("\n");

    if (
      totalDeletedContent === "" &&
      this.currentLineIndex >= this.endLine + this.newLinesAdded &&
      this.insertedInCurrentBlock === 0
    ) {
      return;
    }

    if (this.deletionBuffer.length || this.insertedInCurrentBlock > 0) {
      const block = {
        start: this.currentLineIndex - this.insertedInCurrentBlock,
        numRed: this.deletionBuffer.length,
        numGreen: this.insertedInCurrentBlock,
      };
      console.log('vertical/handler.ts insertDeletionBuffer() Adding diff block:', block);
      this.diffBlocks.push(block);
      this.editorToVerticalDiffCodeLens.set(this.filepath, this.diffBlocks);
      console.log('Map after update:', this.editorToVerticalDiffCodeLens);
    }

    if (this.deletionBuffer.length === 0) {
      this.insertedInCurrentBlock = 0;
      return;
    }

    // Insert the block of deleted lines
    await this.insertTextAboveLine(
      this.currentLineIndex - this.insertedInCurrentBlock,
      totalDeletedContent,
    );

    this.redDecorationManager.addLines(
      this.currentLineIndex - this.insertedInCurrentBlock,
      this.deletionBuffer.length,
    );

    // Shift green decorations downward
    this.greenDecorationManager.shiftDownAfterLine(
      this.currentLineIndex - this.insertedInCurrentBlock,
      this.deletionBuffer.length,
    );

    // Update line index, clear buffer
    for (let i = 0; i < this.deletionBuffer.length; i++) {
      this.incrementCurrentLineIndex();
    }

    this.deletionBuffer = [];
    this.insertedInCurrentBlock = 0;
    this.refreshCodeLens();
  }

  private incrementCurrentLineIndex() {
    this.currentLineIndex++;
    this.updateIndexLineDecorations();
  }

  private greenDecorationManager: DecorationTypeRangeManager;

  private async insertTextAboveLine(index: number, text: string) {
    console.log('vertical/handler.ts insertTextAboveLine(): ', index, text)
    await this.editor.edit(
      (editBuilder) => {
        const lineCount = this.editor.document.lineCount;
        if (index >= lineCount) {
          // Append to end of file
          editBuilder.insert(
            new vscode.Position(
              lineCount,
              this.editor.document.lineAt(lineCount - 1).text.length,
            ),
            `\n${text}`,
          );
        } else {
          editBuilder.insert(new vscode.Position(index, 0), `${text}\n`);
        }
      },
      {
        undoStopAfter: false,
        undoStopBefore: false,
      },
    );
  }

  private async insertLineAboveIndex(index: number, line: string) {
    await this.insertTextAboveLine(index, line);
    this.greenDecorationManager.addLine(index);
    this.newLinesAdded++;
  }

  private async deleteLinesAt(index: number, numLines = 1) {
    console.log('vertical/handler.ts deleteLinesAt(): ', index, numLines)
    const startLine = new vscode.Position(index, 0);
    await this.editor.edit(
      (editBuilder) => {
        editBuilder.delete(
          new vscode.Range(startLine, startLine.translate(numLines)),
        );
      },
      {
        undoStopAfter: false,
        undoStopBefore: false,
      },
    );
  }

  private updateIndexLineDecorations() {
    if (this.options.instant) {
      // We don't show progress on instant apply
      return;
    }

    // Highlight the line at the currentLineIndex
    // And lightly highlight all lines between that and endLine
    if (this.currentLineIndex - this.newLinesAdded >= this.endLine) {
      this.editor.setDecorations(indexDecorationType, []);
      this.editor.setDecorations(belowIndexDecorationType, []);
    } else {
      const start = new vscode.Position(this.currentLineIndex, 0);
      this.editor.setDecorations(indexDecorationType, [
        new vscode.Range(
          start,
          new vscode.Position(start.line, Number.MAX_SAFE_INTEGER),
        ),
      ]);
      const end = new vscode.Position(this.endLine, 0);
      this.editor.setDecorations(belowIndexDecorationType, [
        new vscode.Range(start.translate(1), end.translate(this.newLinesAdded)),
      ]);
    }
  }

  private clearIndexLineDecorations() {
    this.editor.setDecorations(belowIndexDecorationType, []);
    this.editor.setDecorations(indexDecorationType, []);
  }

  public getLineDeltaBeforeLine(line: number) {
    // Returns the number of lines removed from a file when the diff currently active is closed
    let totalLineDelta = 0;
    for (const range of this.greenDecorationManager
      .getRanges()
      .sort((a, b) => a.start.line - b.start.line)) {
      if (range.start.line > line) {
        break;
      }

      totalLineDelta -= range.end.line - range.start.line + 1;
    }

    return totalLineDelta;
  }

  async clear(accept: boolean) {
    console.log('vertical/handler.ts clear(): ', accept)
    vscode.commands.executeCommand(
      "setContext",
      "continue.streamingDiff",
      false,
    );
    const rangesToDelete = accept
      ? this.redDecorationManager.getRanges()
      : this.greenDecorationManager.getRanges();

    this.redDecorationManager.clear();
    this.greenDecorationManager.clear();
    this.clearIndexLineDecorations();

    this.editorToVerticalDiffCodeLens.delete(this.filepath);
    console.log('calling this.editor.edit')
    await this.editor.edit(
      (editBuilder) => {
        for (const range of rangesToDelete) {
          editBuilder.delete(
            new vscode.Range(
              range.start,
              new vscode.Position(range.end.line + 1, 0),
            ),
          );
        }
      },
      {
        undoStopAfter: false,
        undoStopBefore: false,
      },
    );

    this.options.onStatusUpdate("closed", this.diffBlocks.length);

    this.cancelled = true;
    this.refreshCodeLens();
    this.dispose();
  }

  disposables: vscode.Disposable[] = [];

  dispose() {
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  get isCancelled() {
    return this.cancelled;
  }

  private _diffLinesQueue: DiffLine[] = [];
  private _queueLock = false;

  async queueDiffLine(diffLine: DiffLine | undefined) {
    if (diffLine) {
      this._diffLinesQueue.push(diffLine);
    }

    if (this._queueLock || this.editor !== vscode.window.activeTextEditor) {
      return;
    }

    this._queueLock = true;

    while (this._diffLinesQueue.length) {
      const line = this._diffLinesQueue.shift();
      if (!line) {
        break;
      }

      try {
        await this._handleDiffLine(line);
      } catch (e) {
        // If editor is switched between calling _handleDiffLine and the edit actually being executed
        this._diffLinesQueue.push(line);
        break;
      }
    }

    this._queueLock = false;
  }

  private async _handleDiffLine(diffLine: DiffLine) {
    switch (diffLine.type) {
      case "same":
        await this.insertDeletionBuffer();
        this.incrementCurrentLineIndex();
        break;
      case "old":
        // Add to deletion buffer and delete the line for now
        this.deletionBuffer.push(diffLine.line);
        await this.deleteLinesAt(this.currentLineIndex);
        break;
      case "new":
        await this.insertLineAboveIndex(this.currentLineIndex, diffLine.line);
        this.incrementCurrentLineIndex();
        this.insertedInCurrentBlock++;
        break;
    }
  }

  async run(diffLineGenerator: AsyncGenerator<DiffLine>) {
    let diffLines = [];
    try {
      // As an indicator of loading
      this.updateIndexLineDecorations();

      for await (const diffLine of diffLineGenerator) {
        if (this.isCancelled) {
          return;
        }
        diffLines.push(diffLine);
        await this.queueDiffLine(diffLine);
      }

      // Clear deletion buffer
      await this.insertDeletionBuffer();
      this.clearIndexLineDecorations();

      this.refreshCodeLens();

      this.options.onStatusUpdate("done", this.diffBlocks.length);

      // Reject on user typing
      // const listener = vscode.workspace.onDidChangeTextDocument((e) => {
      //   if (e.document.uri.fsPath === this.filepath) {
      //     this.clear(false);
      //     listener.dispose();
      //   }
      // });
    } catch (e) {
      this.clearForFilepath(this.filepath, false);
      throw e;
    }
    return diffLines;
  }

  async acceptRejectBlock(
    accept: boolean,
    startLine: number,
    numGreen: number,
    numRed: number,
  ) {
    console.log('vertical/handler.ts acceptRejectBlock()', accept, startLine, numGreen, numRed)
    // Delete the editor decorations first (these don't affect undo history)
    if (numGreen > 0) {
      this.greenDecorationManager.deleteRangeStartingAt(startLine + numRed);
    }
    if (numRed > 0) {
      this.redDecorationManager.deleteRangeStartingAt(startLine);
    }

    // Combine all edits into a single operation
    await this.editor.edit(
      (editBuilder) => {
        console.log('making edits...')
        if (accept) {
          // If accepting, delete the red (old) lines
          if (numRed > 0) {
            editBuilder.delete(new vscode.Range(
              new vscode.Position(startLine, 0),
              new vscode.Position(startLine + numRed, 0)
            ));
          }
        } else {
          // If rejecting, delete the green (new) lines
          if (numGreen > 0) {
            // include the line ending of the last line
            const document = this.editor.document;
            const endLine = startLine + numRed + numGreen;
            const endPosition = endLine < document.lineCount ? 
              new vscode.Position(endLine, 0) :
              new vscode.Position(endLine - 1, document.lineAt(endLine - 1).text.length);

            editBuilder.delete(new vscode.Range(
              new vscode.Position(startLine + numRed, 0),
              endPosition
            ));
          }
        }
      },
      {
        undoStopBefore: false,
        undoStopAfter: false,
      }
    );

    // Shift everything below upward
    const offset = -(accept ? numRed : numGreen);
    this.redDecorationManager.shiftDownAfterLine(startLine, offset);
    this.greenDecorationManager.shiftDownAfterLine(startLine, offset);

    // Update codelens
    this.shiftCodeLensObjects(startLine, offset);

    const status = this.diffBlocks.length === 0 ? "closed" : undefined;
    this.options.onStatusUpdate(status, this.diffBlocks.length);
  }

  private shiftCodeLensObjects(startLine: number, offset: number) {
    // Shift the codelens objects
    const blocks =
      this.editorToVerticalDiffCodeLens
        .get(this.filepath)
        ?.filter((x) => x.start !== startLine)
        .map((x) => {
          if (x.start > startLine) {
            return { ...x, start: x.start + offset };
          }
          return x;
        }) || [];
    this.editorToVerticalDiffCodeLens.set(this.filepath, blocks);

    this.refreshCodeLens();
  }

  public updateLineDelta(
    filepath: string,
    startLine: number,
    lineDelta: number,
  ) {
    // Retrieve the diff blocks for the given file
    const blocks = this.editorToVerticalDiffCodeLens.get(filepath);
    if (!blocks) {
      return;
    }

    //update decorations
    this.redDecorationManager.shiftDownAfterLine(startLine, lineDelta);
    this.greenDecorationManager.shiftDownAfterLine(startLine, lineDelta);

    //update code lens
    this.shiftCodeLensObjects(startLine, lineDelta);
  }

  public hasDiffForCurrentFile(): boolean {
    return this.diffBlocks.length > 0;
  }
}
