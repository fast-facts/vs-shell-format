import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { download2, getPlatFormFilename, getReleaseDownloadUrl } from '../../src/downloader';
import { fileExists } from '../../src/pathUtil';
import { Formatter } from '../../src/shFormat';

const EXTENSION_ID = 'vs-shell-format.shell-format-secure';

suite('shfmt parse errors become diagnostics', function () {
  this.timeout(20000);

  let formatter: Formatter;

  suiteSetup(async function () {
    this.timeout(60000);
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} is not present`);
    const dest = path.join(ext.extensionPath, 'bin', getPlatFormFilename());
    if (!fileExists(dest)) {
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await download2(getReleaseDownloadUrl(), dest);
    }
    await ext.activate();
    formatter = new Formatter(
      { extensionPath: ext.extensionPath } as vscode.ExtensionContext,
      vscode.window.createOutputChannel('shellformat-test')
    );
  });

  test('format fails and sets a diagnostic from <standard input>:line:col:', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'shellscript',
      content: 'if then\n',
    });
    const errMsg = await formatter.formatDocument(document).then(
      () => assert.fail('format should fail on broken shell'),
      String
    );
    const errLoc = /^<standard input>:(\d+):(\d+):/.exec(errMsg);
    assert.ok(errLoc, `expected <standard input>:line:col: in: ${errMsg}`);
    const diags = formatter.diagnosticCollection.get(document.uri);
    assert.ok(diags && diags.length === 1, 'expected one diagnostic on the broken file');
    assert.strictEqual(diags[0].range.start.line, parseInt(errLoc[1], 10));
    assert.strictEqual(diags[0].range.start.character, parseInt(errLoc[2], 10));
  });
});
