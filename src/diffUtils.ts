import { Position, Range, TextEdit } from 'vscode';

import { structuredPatch, type StructuredPatch, type StructuredPatchHunk } from 'diff';

export enum EditTypes {
  EDIT_DELETE,
  EDIT_INSERT,
  EDIT_REPLACE
}

export class Edit {
  action: EditTypes;
  start: Position;
  end: Position;
  text: string;

  constructor(action: EditTypes, start: Position) {
    this.action = action;
    this.start = start;
    this.end = start;
    this.text = '';
  }

  apply(): TextEdit {
    switch (this.action) {
      case EditTypes.EDIT_INSERT:
        return TextEdit.insert(this.start, this.text);

      case EditTypes.EDIT_DELETE:
        return TextEdit.delete(new Range(this.start, this.end));

      case EditTypes.EDIT_REPLACE:
        return TextEdit.replace(new Range(this.start, this.end), this.text);
    }
  }
}

export interface FilePatch {
  fileName: string;
  edits: Edit[];
}

function parseUniDiffs(diffOutput: StructuredPatch[]): FilePatch[] {
  const filePatches: FilePatch[] = [];
  diffOutput.forEach((uniDiff: StructuredPatch) => {
    let edit: Edit | null = null;
    const edits: Edit[] = [];
    uniDiff.hunks.forEach((hunk: StructuredPatchHunk) => {
      let startLine = hunk.oldStart;
      hunk.lines.forEach(line => {
        switch (line.slice(0, 1)) {
          case '-':
            if (edit == null) {
              edit = new Edit(EditTypes.EDIT_DELETE, new Position(startLine - 1, 0));
            }
            edit.end = new Position(startLine, 0);
            startLine++;
            break;
          case '+':
            if (edit == null) {
              edit = new Edit(EditTypes.EDIT_INSERT, new Position(startLine - 1, 0));
            } else if (edit.action === EditTypes.EDIT_DELETE) {
              edit.action = EditTypes.EDIT_REPLACE;
            }
            edit.text += line.slice(1) + '\n';
            break;
          case ' ':
            startLine++;
            if (edit != null) {
              edits.push(edit);
            }
            edit = null;
            break;
        }
      });
      if (edit != null) {
        edits.push(edit);
      }
    });
    filePatches.push({ fileName: uniDiff.oldFileName ?? '', edits: edits });
  });

  return filePatches;
}

export function getEdits(fileName: string, oldStr: string, newStr: string): FilePatch {
  if (process.platform === 'win32') {
    oldStr = oldStr.split('\r\n').join('\n');
    newStr = newStr.split('\r\n').join('\n');
  }
  const unifiedDiffs: StructuredPatch = structuredPatch(
    fileName,
    fileName,
    oldStr,
    newStr,
    '',
    ''
  );
  const filePatches: FilePatch[] = parseUniDiffs([unifiedDiffs]);
  return filePatches[0];
}
