import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { fileExists, substitutePath } from './pathUtil';
import { userOrDefaultSetting } from './userSettings';
import { output } from './extension';

import { getEdits } from '../src/diffUtils';

import {
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticCollection,
  TextDocument,
  Position,
  FormattingOptions,
  TextEdit,
} from 'vscode';
import * as editorconfig from 'editorconfig';

import { getDestPath } from './downloader';
import { prepareShfmt } from './shfmtFlags';
export const configurationPrefix = 'shellformat';

export enum ConfigItemName {
  Flag = 'flag',
  Path = 'path',
  EffectLanguages = 'effectLanguages',
}

export class Formatter {
  diagnosticCollection: DiagnosticCollection;

  constructor(public context: vscode.ExtensionContext) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('shell-format');
  }

  getShfmtPath() {
    return getDestPath(this.context);
  }

  public formatDocument(document: TextDocument, options?: FormattingOptions): Thenable<TextEdit[]> {
    const start = new Position(0, 0);
    const end = new vscode.Position(
      document.lineCount - 1,
      document.lineAt(document.lineCount - 1).text.length
    );
    const range = new vscode.Range(start, end);
    const content = document.getText(range);
    return this.formatDocumentWithContent(content, document, options);
  }

  public formatDocumentWithContent(
    content: string,
    document: TextDocument,
    options?: vscode.FormattingOptions
  ): Thenable<vscode.TextEdit[]> {
    return new Promise((resolve, reject) => {
      try {
        let settings = vscode.workspace.getConfiguration(configurationPrefix);
        let binPath: string = getSettings('path');
        let flag: string = getSettings('flag');
        const useEditorConfig = Boolean(settings.useEditorConfig);
        const edcfgOptions = useEditorConfig ? editorconfig.parseSync(document.fileName) : {};
        if (useEditorConfig) {
          if (flag) {
            output.appendLine('shfmt flags will be ignored as EditorConfig mode is enabled.');
          }
          output.appendLine(
            `EditorConfig for file "${document.fileName}": ${JSON.stringify(edcfgOptions)}`
          );
        }

        const prep = prepareShfmt({
          fileName: document.fileName,
          binPath,
          flag,
          useEditorConfig,
          editorConfig: edcfgOptions,
          defaultCommand: this.getShfmtPath(),
          pathExists: binPath ? fileExists(binPath) : true,
          options,
        });
        switch (prep.kind) {
          case 'invalid-path':
            vscode.window.showErrorMessage(prep.message);
            reject(prep.message);
            return;
          case 'write-flag':
            vscode.window.showWarningMessage(prep.message);
            reject(prep.message);
            return;
          case 'run':
            break;
          default: {
            const unused: never = prep;
            return unused;
          }
        }

        output.appendLine(`Effective shfmt flags: ${prep.flags}`);

        let shfmt = child_process.spawn(prep.command, prep.flags);

        let shfmtOut: Buffer[] = [];
        shfmt.stdout.on('data', (chunk) => {
          let bc: Buffer;
          if (chunk instanceof Buffer) {
            bc = chunk;
          } else {
            bc = Buffer.from(chunk);
          }
          shfmtOut.push(bc);
        });
        let shfmtErr: Buffer[] = [];
        shfmt.stderr.on('data', (chunk) => {
          let bc: Buffer;
          if (chunk instanceof Buffer) {
            bc = chunk;
          } else {
            bc = Buffer.from(chunk);
          }
          shfmtErr.push(bc);
        });

        let textEdits: TextEdit[] = [];
        shfmt.on('close', (code, signal) => {
          if (code == 0) {
            this.diagnosticCollection.delete(document.uri);

            if (shfmtOut.length != 0) {
              let result = Buffer.concat(shfmtOut).toString();
              let filePatch = getEdits(document.fileName, content, result);

              filePatch.edits.forEach((edit) => {
                textEdits.push(edit.apply());
              });

              resolve(textEdits);
            } else {
              resolve(null);
            }
          } else {
            let errMsg = '';

            if (shfmtErr.length != 0) {
              errMsg = Buffer.concat(shfmtErr).toString();

              // https://regex101.com/r/uPoLKg/2/
              let errLoc = /^<standard input>:(\d+):(\d+):/.exec(errMsg);

              if (errLoc !== null && errLoc.length > 2) {
                let line = parseInt(errLoc[1]);
                let column = parseInt(errLoc[2]);

                const diag: Diagnostic = {
                  range: new vscode.Range(
                    new vscode.Position(line, column),
                    new vscode.Position(line, column)
                  ),
                  message: errMsg.slice('<standard input>:'.length, errMsg.length),
                  severity: DiagnosticSeverity.Error,
                };

                this.diagnosticCollection.delete(document.uri);
                this.diagnosticCollection.set(document.uri, [diag]);
              }
            }

            reject(errMsg);
          }
        });

        shfmt.stdin.write(content);
        shfmt.stdin.end();
      } catch (e) {
        reject(`Fatal error calling shfmt: ${e}`);
      }
    });
  }
}

export class ShellDocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
  constructor(public formatter: Formatter) {}

  public provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): Thenable<vscode.TextEdit[]> {
    return this.formatter.formatDocument(document, options);
  }
}

export function getSettings(key: 'path' | 'flag') {
  const settings = vscode.workspace.getConfiguration(configurationPrefix);
  const picked = userOrDefaultSetting(settings.inspect<string | null>(key));
  if (key === ConfigItemName.Path && picked) {
    return substitutePath(picked);
  }
  return picked ?? null;
}
