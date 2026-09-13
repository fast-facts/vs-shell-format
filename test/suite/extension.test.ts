import * as assert from 'assert';
import * as vscode from 'vscode';
import { isAllowedTextDocument } from '../../src/extension';

suite('isAllowedTextDocument', () => {
  test('allows a listed language on untitled', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'shellscript',
      content: 'echo hello\n',
    });
    assert.strictEqual(isAllowedTextDocument(document), true);
  });

  test('rejects a language that is not in the list', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: 'echo hello\n',
    });
    assert.strictEqual(isAllowedTextDocument(document), false);
  });
});
