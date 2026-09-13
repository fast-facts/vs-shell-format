import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'vs-shell-format.shell-format-secure';
const DEFAULT_LANGUAGES = [
  'shellscript',
  'dotenv',
  'dockerfile',
  'hosts',
  'jvmoptions',
  'ignore',
  'properties',
  'spring-boot-properties',
  'azcli',
  'bats',
  'zsh',
  'mksh',
  'dash',
] as const;

async function formatEdits(language: string): Promise<vscode.TextEdit[] | undefined> {
  const document = await vscode.workspace.openTextDocument({ language, content: 'echo  hello\n' });
  return vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
    'vscode.executeFormatDocumentProvider',
    document.uri,
    { tabSize: 4, insertSpaces: true }
  );
}

suite('Language list contract', function () {
  this.timeout(20000);
  let root = '';

  suiteSetup(async function () {
    this.timeout(60000);
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} is not present`);
    await ext.activate();
    root = ext.extensionPath;
  });

  test('default effectLanguages includes dockerfile and matches package.json default', () => {
    const fromPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      .contributes.configuration.properties['shellformat.effectLanguages'].default;
    const fromInspect = vscode.workspace
      .getConfiguration('shellformat')
      .inspect<string[]>('effectLanguages')?.defaultValue;
    assert.deepStrictEqual(fromPkg, fromInspect);
    assert.deepStrictEqual(fromPkg, [...DEFAULT_LANGUAGES]);
  });

  test('registers a formatter for Dockerfile with default settings', async () => {
    assert.notStrictEqual(await formatEdits('dockerfile'), undefined);
  });

  test('registers a formatter for shellscript when the extension activates', async () => {
    assert.notStrictEqual(await formatEdits('shellscript'), undefined);
  });
});
