import { Position, Range, TextEdit } from 'vscode';

import jsDiff = require('diff');

export enum EditTypes {
  EDIT_DELETE,
  EDIT_INSERT,
  EDIT_REPLACE,
}

export class Edit {
  action: number;
  start: Position;
  end: Position;
  text: string;

  constructor(action: number, start: Position) {
    this.action = action;
    this.start = start;
    this.text = '';
  }

  // Creates TextEdit for current Edit
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

/**
 * Uses diff module to parse given array of IUniDiff objects and returns edits for files
 *
 * @param diffOutput jsDiff.ParsedDiff[]
 *
 * @returns Array of FilePatch objects, one for each file
 */
function parseUniDiffs(diffOutput: jsDiff.ParsedDiff[]): FilePatch[] {
  let filePatches: FilePatch[] = [];
  diffOutput.forEach((uniDiff: jsDiff.ParsedDiff) => {
    let edit: Edit = null;
    let edits: Edit[] = [];
    uniDiff.hunks.forEach((hunk: jsDiff.Hunk) => {
      let startLine = hunk.oldStart;
      hunk.lines.forEach((line) => {
        switch (line.substr(0, 1)) {
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
            edit.text += line.substr(1) + '\n';
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

/**
 * Returns a FilePatch object by generating diffs between given oldStr and newStr using the diff module
 *
 * @param fileName string: Name of the file to which edits should be applied
 * @param oldStr string
 * @param newStr string
 *
 * @returns A single FilePatch object
 */
export function getEdits(fileName: string, oldStr: string, newStr: string): FilePatch {
  if (process.platform === 'win32') {
    oldStr = oldStr.split('\r\n').join('\n');
    newStr = newStr.split('\r\n').join('\n');
  }
  let unifiedDiffs: jsDiff.ParsedDiff = jsDiff.structuredPatch(
    fileName,
    fileName,
    oldStr,
    newStr,
    '',
    ''
  );
  let filePatches: FilePatch[] = parseUniDiffs([unifiedDiffs]);
  return filePatches[0];
}
