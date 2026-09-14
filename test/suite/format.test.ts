import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'vs-shell-format.shell-format-secure';

const CASES = [
  { name: 'getacme.sh', language: 'shellscript' },
  { name: 'sample.bash', language: 'shellscript' },
  { name: 'test.zsh', language: 'zsh' },
  { name: '.zshrc', language: 'zsh' },
  { name: 'sample.bats', language: 'bats' },
  { name: 'bats.bats', language: 'bats' },
  { name: '.env', language: 'dotenv' },
  { name: 'Dockerfile', language: 'dockerfile' },
  { name: 'hosts', language: 'hosts' },
  { name: '.gitignore', language: 'ignore' },
  { name: 'application.properties', language: 'properties' },
  { name: 'application.properties', language: 'spring-boot-properties' },
  { name: 'idea.vmoptions', language: 'jvmoptions' },
  { name: 'azure.azcli', language: 'azcli' },
  { name: 'sample.mksh', language: 'mksh' },
  { name: '.mkshrc', language: 'mksh' },
  { name: 'sample.dash', language: 'dash' },
  { name: '.bashrc', language: 'shellscript' },
  { name: 'PKGBUILD', language: 'shellscript' },
  { name: 'APKBUILD', language: 'shellscript' },
  { name: 'sample.ebuild', language: 'shellscript' },
  { name: 'sample.eclass', language: 'shellscript' },
] as const;

async function formatDocument(document: vscode.TextDocument): Promise<string> {
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
  return result.replace(/\r\n/g, '\n');
}

async function formatFile(filePath: string, language: string): Promise<string> {
  return formatDocument(
    await vscode.languages.setTextDocumentLanguage(
      await vscode.workspace.openTextDocument(filePath),
      language
    )
  );
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
      assert.strictEqual(
        await formatFile(path.join(root, 'test', 'supported', c.name), c.language),
        expected
      );
      assert.strictEqual(await formatFile(golden, c.language), expected);
    });
  }

  test('missing trailing newline is added once and stays stable', async () => {
    const formatShell = async (content: string): Promise<string> =>
      formatDocument(
        await vscode.workspace.openTextDocument({ language: 'shellscript', content })
      );

    const once = await formatShell('echo  hi');
    assert.strictEqual(once, 'echo hi\n');
    assert.strictEqual(await formatShell(once), once);
  });

  test('empty shell file formats to itself', async () => {
    assert.strictEqual(
      await formatFile(path.join(root, 'test', 'supported', 'error.sh'), 'shellscript'),
      ''
    );
  });

  test('dockerfile keeps backslash continuations and is idempotent', async () => {
    const formatUntitled = async (content: string): Promise<string> =>
      formatDocument(
        await vscode.workspace.openTextDocument({ language: 'dockerfile', content })
      );

    const once = await formatUntitled('FROM alpine\nRUN echo a && \\\n    echo b\n');
    assert.ok(once.includes('\\'), 'backslash continuation must be kept');
    assert.ok(!/&&\s*$/m.test(once), 'must not strip backslash after &&');
    assert.strictEqual(await formatUntitled(once), once);
  });
});
