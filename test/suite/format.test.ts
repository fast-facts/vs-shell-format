import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { trackInstall } from '../../src/downloader';
import { Formatter } from '../../src/shFormat';

const EXTENSION_ID = 'vs-shell-format.shell-format-secure';

const CASES = [
  { name: 'getacme.sh', language: 'shellscript' },
  { name: 'test.zsh', language: 'zsh' },
  { name: '.zshrc', language: 'zsh' },
  { name: 'sample.bats', language: 'bats' },
  { name: '.env', language: 'dotenv' },
  { name: 'Dockerfile', language: 'dockerfile' },
  { name: 'hosts', language: 'hosts' },
  { name: '.gitignore', language: 'ignore' },
  { name: 'application.properties', language: 'properties' },
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

async function applyFormat(document: vscode.TextDocument): Promise<string> {
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

async function formatDocument(document: vscode.TextDocument): Promise<string> {
  return (await applyFormat(document)).replace(/\r\n/g, '\n');
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

  test('dockerfile parse failure rejects with an Error', async () => {
    const formatter = new Formatter({
      extensionPath: root,
      subscriptions: [] as vscode.Disposable[],
    } as vscode.ExtensionContext);
    const document = await vscode.workspace.openTextDocument({
      language: 'dockerfile',
      content: 'RUN echo "unclosed\n',
    });
    await assert.rejects(Promise.resolve(formatter.formatDocument(document)), (err: unknown) => {
      assert.ok(err instanceof Error, `expected an Error, got: ${String(err)}`);
      return true;
    });
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

  test('EditorConfig indent_size drives formatting when enabled', async () => {
    const config = vscode.workspace.getConfiguration('shellformat');
    await config.update('useEditorConfig', true, vscode.ConfigurationTarget.Global);
    try {
      const formatted = await formatFile(
        path.join(root, 'test', 'supported', 'edcfg', 'sample.sh'),
        'shellscript'
      );
      assert.strictEqual(formatted, 'if true; then\n  echo hi\nfi\n');
    } finally {
      await config.update('useEditorConfig', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  test('format with bundled path waits for in-flight install', async () => {
    const config = vscode.workspace.getConfiguration('shellformat');
    await config.update('path', undefined, vscode.ConfigurationTarget.Global);
    let resolveInstall: () => void = () => undefined;
    void trackInstall(
      new Promise<void>(resolve => {
        resolveInstall = resolve;
      })
    );
    const formatter = new Formatter({
      extensionPath: path.join(root, 'no-bundled-shfmt'),
      subscriptions: [] as vscode.Disposable[],
    } as vscode.ExtensionContext);
    const document = await vscode.workspace.openTextDocument({
      language: 'shellscript',
      content: 'echo hi\n',
    });
    try {
      const formatP = formatter.formatDocumentWithContent(document.getText(), document);
      const winner = await Promise.race([
        formatP.then(() => 'format', () => 'format'),
        new Promise(resolve => setTimeout(() => resolve('wait'), 50)),
      ]);
      assert.strictEqual(winner, 'wait');
      resolveInstall();
      await assert.rejects(formatP, /shellformat\.path|download/);
    } finally {
      resolveInstall();
      void trackInstall(Promise.resolve());
    }
  });

  test('CRLF endings survive formatting', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'shellscript',
      content: 'echo  hi\r\n',
    });
    assert.strictEqual(document.eol, vscode.EndOfLine.CRLF);
    assert.strictEqual(await applyFormat(document), 'echo hi\r\n');
  });
});
