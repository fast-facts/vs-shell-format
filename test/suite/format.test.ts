import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'vs-shell-format.shell-format-secure';

const CASES = [
  { name: 'getacme.sh', language: 'shellscript' },
  { name: 'test.zsh', language: 'zsh' },
  { name: '.zshrc', language: 'zsh' },
  { name: 'sample.bats', language: 'bats' },
  { name: '.env', language: 'dotenv' },
  { name: 'hosts', language: 'hosts' },
  { name: '.gitignore', language: 'ignore' },
  { name: 'application.properties', language: 'properties' },
  { name: 'idea.vmoptions', language: 'jvmoptions' },
  { name: 'azure.azcli', language: 'azcli' },
] as const;

async function formatFile(filePath: string, language: string): Promise<string> {
  const document = await vscode.languages.setTextDocumentLanguage(
    await vscode.workspace.openTextDocument(filePath),
    language
  );
  const edits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
    'vscode.executeFormatDocumentProvider',
    document.uri,
    { tabSize: 4, insertSpaces: true }
  );
  const sorted = [...(edits ?? [])].sort(
    (a, b) => b.range.start.compareTo(a.range.start) || b.range.end.compareTo(a.range.end)
  );
  let result = document.getText();
  for (const edit of sorted) {
    const start = document.offsetAt(edit.range.start);
    const end = document.offsetAt(edit.range.end);
    result = result.slice(0, start) + edit.newText + result.slice(end);
  }
  return result;
}

suite('Format golden files', function () {
  this.timeout(20000);

  let root = '';

  suiteSetup(async function () {
    this.timeout(60000);
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} is not present`);
    await ext.activate();
    root = ext.extensionPath;
  });

  for (const c of CASES) {
    test(`formats ${c.name}`, async () => {
      const golden = path.join(root, 'test', 'golden', c.name);
      const expected = fs.readFileSync(golden, 'utf8').replace(/\r\n/g, '\n');
      const got = (s: string) => s.replace(/\r\n/g, '\n');
      assert.strictEqual(
        got(await formatFile(path.join(root, 'test', 'supported', c.name), c.language)),
        expected
      );
      assert.strictEqual(got(await formatFile(golden, c.language)), expected);
    });
  }
});
