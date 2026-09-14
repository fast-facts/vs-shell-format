import * as fs from 'fs';
import * as vscode from 'vscode';

export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function substitutePath(filePath: string): string {
  const workspaceFolder =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return filePath
    .replace(/\${workspaceRoot}/g, workspaceFolder || '')
    .replace(/\${workspaceFolder}/g, workspaceFolder || '')
    .replace(/\${env:([^=}]+)}/g, (_sub: string, envName: string) => process.env[envName] ?? '');
}
