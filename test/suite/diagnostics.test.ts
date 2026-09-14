import * as assert from 'assert';
import * as vscode from 'vscode';
import { Formatter } from '../../src/shFormat';

const EXTENSION_ID = 'vs-shell-format.shell-format-secure';

suite('shfmt parse errors become diagnostics', function () {
  this.timeout(20000);

  let formatter: Formatter;

  suiteSetup(async function () {
    this.timeout(60000);
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} is not present`);
    await ext.activate();
    formatter = new Formatter({
      extensionPath: ext.extensionPath,
    } as vscode.ExtensionContext);
  });

  test('format fails and sets a diagnostic from <standard input>:line:col:', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'shellscript',
      content: 'if then\n',
    });
    const errMsg = await formatter.formatDocument(document).then(
      () => assert.fail('format should fail on broken shell'),
      (e) => (e instanceof Error ? e.message : String(e))
    );
    const errLoc = /^<standard input>:(\d+):(\d+):/.exec(errMsg);
    assert.ok(errLoc, `expected <standard input>:line:col: in: ${errMsg}`);
    const diags = formatter.diagnosticCollection.get(document.uri);
    assert.ok(diags);
    assert.strictEqual(diags.length, 1, 'expected one diagnostic on the broken file');
    assert.strictEqual(diags[0].range.start.line, parseInt(errLoc[1], 10) - 1);
    assert.strictEqual(diags[0].range.start.character, parseInt(errLoc[2], 10) - 1);
  });

  test('error on the second line maps to a 0-based position', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'shellscript',
      content: 'echo ok\nif then\n',
    });
    const errMsg = await formatter.formatDocument(document).then(
      () => assert.fail('format should fail on broken shell'),
      (e) => (e instanceof Error ? e.message : String(e))
    );
    assert.ok(/^<standard input>:2:1:/.test(errMsg), `unexpected message: ${errMsg}`);
    const diags = formatter.diagnosticCollection.get(document.uri);
    assert.ok(diags && diags.length === 1, 'expected one diagnostic on the broken file');
    assert.strictEqual(diags[0].range.start.line, 1);
    assert.strictEqual(diags[0].range.start.character, 0);
  });

  test('empty document formats to a single newline without diagnostics', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'shellscript',
      content: '',
    });
    const edits = await formatter.formatDocument(document);
    assert.strictEqual(edits.length, 1);
    assert.strictEqual(edits[0].newText, '\n');
    assert.strictEqual(formatter.diagnosticCollection.get(document.uri)?.length ?? 0, 0);

  });

  test('diagnostic clears after the file is fixed', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'shellscript',
      content: 'if then\n',
    });
    await formatter.formatDocument(document).then(
      () => assert.fail('format should fail on broken shell'),
      () => undefined
    );
    assert.strictEqual(formatter.diagnosticCollection.get(document.uri)?.length, 1);
    const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0));
    const applied = new vscode.WorkspaceEdit();
    applied.replace(document.uri, fullRange, 'echo hi\n');
    assert.ok(await vscode.workspace.applyEdit(applied));
    assert.deepStrictEqual(await formatter.formatDocument(document), []);
    assert.strictEqual(formatter.diagnosticCollection.get(document.uri)?.length ?? 0, 0);
  });
});
