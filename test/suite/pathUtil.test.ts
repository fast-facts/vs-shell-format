import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { fileExists, substitutePath } from '../../src/pathUtil';

function withWorkspaceFolders(
  folders: readonly vscode.WorkspaceFolder[] | undefined,
  run: () => void
): void {
  const original = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
  Object.defineProperty(vscode.workspace, 'workspaceFolders', {
    configurable: true,
    get: () => folders,
  });
  try {
    run();
  } finally {
    if (original) {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', original);
    } else {
      Reflect.deleteProperty(vscode.workspace, 'workspaceFolders');
    }
  }
}

suite('pathUtil', () => {
  test('fileExists is true for a file and false for a missing path', () => {
    assert.strictEqual(fileExists(__filename), true);
    assert.strictEqual(fileExists(path.join(__dirname, 'no-such-file')), false);
  });

  test('substitutePath replaces workspaceFolder, workspaceRoot, and env', () => {
    const wsUri = vscode.Uri.file('/ws');
    const ws = wsUri.fsPath;
    process.env.PATHUTIL_TEST_VAR = 'from-env';
    try {
      withWorkspaceFolders([{ uri: wsUri, name: 'ws', index: 0 }], () => {
        assert.strictEqual(substitutePath('${workspaceFolder}/bin'), `${ws}/bin`);
        assert.strictEqual(substitutePath('${workspaceRoot}/bin'), `${ws}/bin`);
        assert.strictEqual(substitutePath('${env:PATHUTIL_TEST_VAR}'), 'from-env');
      });
    } finally {
      delete process.env.PATHUTIL_TEST_VAR;
    }
  });

  test('substitutePath uses empty string for empty env or missing workspace', () => {
    delete process.env.PATHUTIL_TEST_GONE;
    process.env.PATHUTIL_TEST_EMPTY = '';
    try {
      withWorkspaceFolders(undefined, () => {
        assert.strictEqual(substitutePath('${workspaceFolder}'), '');
        assert.strictEqual(substitutePath('${workspaceRoot}'), '');
        assert.strictEqual(substitutePath('${env:PATHUTIL_TEST_GONE}'), '');
        assert.strictEqual(substitutePath('${env:PATHUTIL_TEST_EMPTY}'), '');
      });
    } finally {
      delete process.env.PATHUTIL_TEST_EMPTY;
    }
  });
});
