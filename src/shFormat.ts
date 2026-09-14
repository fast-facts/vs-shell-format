import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileExists, substitutePath } from './pathUtil';
import { userOrDefaultSetting } from './userSettings';
import * as editorconfig from 'editorconfig';

import { getDestPath, whenInstallReady } from './downloader';
import { prepareShfmt } from './shfmtFlags';
export const configurationPrefix = 'shellformat';
export const output = vscode.window.createOutputChannel('shellformat');

const shfmtTimeoutMs = 30000;
const editorConfigCache = new Map<string, ReturnType<typeof editorconfig.parseSync>>();

export function clearEditorConfigCache(): void {
  editorConfigCache.clear();
}

export function parseEditorConfig(filePath: string): ReturnType<typeof editorconfig.parseSync> {
  const dir = path.dirname(filePath);
  const stamp = [dir];
  let current = dir;
  for (;;) {
    try {
      const st = fs.statSync(path.join(current, '.editorconfig'), { throwIfNoEntry: false });
      if (st !== undefined) {
        stamp.push(`${current}:${st.mtimeMs}`);
      }
    } catch (e) {
      if (e instanceof Error) {
        return editorconfig.parseSync(filePath);
      }
      throw e;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  const key = stamp.join('\0');
  const cached = editorConfigCache.get(key);
  if (cached) {
    return cached;
  }
  const result = editorconfig.parseSync(filePath);
  if (editorConfigCache.size >= 200) {
    editorConfigCache.clear();
  }
  editorConfigCache.set(key, result);
  return result;
}

export function runShfmt(
  command: string,
  flags: string[],
  content: string,
  token?: vscode.CancellationToken,
  timeoutMs = shfmtTimeoutMs
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (token?.isCancellationRequested) {
      reject(new Error('formatting cancelled'));
      return;
    }
    let child: child_process.ChildProcess;
    try {
      child = child_process.spawn(command, flags);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const childStdin = child.stdin;
    const childStdout = child.stdout;
    const childStderr = child.stderr;
    if (!childStdin || !childStdout || !childStderr) {
      reject(new Error(`shfmt pipes unavailable: ${command}`));
      return;
    }
    let settled = false;
    let cancelListener: vscode.Disposable | undefined;
    const done = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cancelListener?.dispose();
      fn();
    };
    const timer = setTimeout(() => {
      child.kill();
      done(() => reject(new Error(`shfmt timed out after ${timeoutMs}ms: ${command}`)));
    }, timeoutMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    childStdout.on('data', (chunk: Buffer | string) => {
      stdoutChunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    });
    childStderr.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    });
    child.on('error', err => {
      child.kill();
      done(() => reject(err instanceof Error ? err : new Error(String(err))));
    });
    // shfmt can exit before reading stdin; the close handler reports the real error.
    childStdin.on('error', () => undefined);
    child.on('close', code => {
      if (code === 0) {
        done(() => resolve(Buffer.concat(stdoutChunks).toString()));
      } else {
        const errMsg =
          Buffer.concat(stderrChunks).toString() || `shfmt exited with code ${code}`;
        done(() => reject(new Error(errMsg)));
      }
    });
    if (token) {
      if (token.isCancellationRequested) {
        child.kill();
        done(() => reject(new Error('formatting cancelled')));
      } else {
        cancelListener = token.onCancellationRequested(() => {
          child.kill();
          done(() => reject(new Error('formatting cancelled')));
        });
      }
    }
    try {
      childStdin.write(content);
      childStdin.end();
    } catch (e) {
      done(() => reject(e instanceof Error ? e : new Error(String(e))));
    }
  });
}

function fullDocumentReplace(
  document: vscode.TextDocument,
  formatted: string
): vscode.TextEdit[] {
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const last = document.lineAt(document.lineCount - 1);
  return [
    vscode.TextEdit.replace(
      new vscode.Range(0, 0, last.lineNumber, last.text.length),
      formatted.split(/\r?\n/).join(eol)
    ),
  ];
}

export enum ConfigItemName {
  Path = 'path',
  EffectLanguages = 'effectLanguages',
}

export class Formatter {
  diagnosticCollection: vscode.DiagnosticCollection;

  constructor(public context: vscode.ExtensionContext) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('shell-format');
    context.subscriptions.push(this.diagnosticCollection);
  }

  public formatDocument(
    document: vscode.TextDocument,
    options?: vscode.FormattingOptions,
    token?: vscode.CancellationToken
  ): Thenable<vscode.TextEdit[]> {
    return this.formatDocumentWithContent(document.getText(), document, options, token);
  }

  public async formatDocumentWithContent(
    content: string,
    document: vscode.TextDocument,
    options?: vscode.FormattingOptions,
    token?: vscode.CancellationToken
  ): Promise<vscode.TextEdit[]> {
    if (document.languageId === 'dockerfile') {
      try {
        const { formatDockerfileContents } = await import('@reteps/dockerfmt');
        const result = await formatDockerfileContents(content, {
          indent: options?.insertSpaces ? options.tabSize : 4,
          trailingNewline: true,
          spaceRedirects: false,
        });
        this.diagnosticCollection.delete(document.uri);
        return fullDocumentReplace(document, result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        output.appendLine(err.message);
        throw err;
      }
    }
    const settings = vscode.workspace.getConfiguration(configurationPrefix);
    const binPath: string | null = getSettings('path');
    const flag: string | null = getSettings('flag');
    const useEditorConfig = Boolean(settings.useEditorConfig);
    const edcfgOptions = useEditorConfig ? parseEditorConfig(document.fileName) : {};
    if (useEditorConfig) {
      if (flag) {
        output.appendLine('shfmt flags will be ignored as EditorConfig mode is enabled.');
      }
      output.appendLine(
        `EditorConfig for file "${document.fileName}": ${JSON.stringify(edcfgOptions)}`
      );
    }

    const dest = getDestPath(this.context);
    const prep = prepareShfmt({
      fileName: document.fileName,
      languageId: document.languageId,
      binPath,
      flag,
      useEditorConfig,
      editorConfig: edcfgOptions,
      defaultCommand: dest,
      pathExists: binPath ? fileExists(binPath) : true,
      options,
    });
    if (prep.kind === 'invalid-path') {
      vscode.window.showErrorMessage(prep.message);
      throw new Error(prep.message);
    }
    if (prep.kind === 'write-flag') {
      vscode.window.showWarningMessage(prep.message);
      throw new Error(prep.message);
    }

    output.appendLine(`Effective shfmt flags: ${prep.flags}`);

    if (prep.command === dest) {
      await whenInstallReady();
      if (!fileExists(prep.command)) {
        throw new Error('set shellformat.path or wait for download');
      }
    }

    let result: string;
    try {
      result = await runShfmt(prep.command, prep.flags, content, token);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const errLoc = /^<standard input>:(\d+):(\d+):/.exec(errMsg);
      if (errLoc !== null && errLoc.length > 2) {
        const line = Math.max(0, parseInt(errLoc[1], 10) - 1);
        const column = Math.max(0, parseInt(errLoc[2], 10) - 1);
        const diag: vscode.Diagnostic = {
          range: new vscode.Range(
            new vscode.Position(line, column),
            new vscode.Position(line, column)
          ),
          message: errMsg.slice('<standard input>:'.length, errMsg.length),
          severity: vscode.DiagnosticSeverity.Error,
        };
        this.diagnosticCollection.delete(document.uri);
        this.diagnosticCollection.set(document.uri, [diag]);
      }
      throw new Error(errMsg, { cause: e });
    }

    this.diagnosticCollection.delete(document.uri);
    return fullDocumentReplace(document, result);
  }
}

export class ShellDocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
  constructor(public formatter: Formatter) {}

  public provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): Thenable<vscode.TextEdit[]> {
    return this.formatter.formatDocument(document, options, token);
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
