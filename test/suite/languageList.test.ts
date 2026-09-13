import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../../src/extension';

const EXTENSION_ID = 'vs-shell-format.shell-format-secure';
const DEFAULT_LANGUAGES = [
  'shellscript',
  'dotenv',
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

  test('default effectLanguages omits dockerfile and includes the rest', () => {
    const fromPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      .contributes.configuration.properties['shellformat.effectLanguages'].default;
    const fromInspect = vscode.workspace
      .getConfiguration('shellformat')
      .inspect<string[]>('effectLanguages')?.defaultValue;
    assert.deepStrictEqual(fromPkg, fromInspect);
    assert.deepStrictEqual(fromPkg, [...DEFAULT_LANGUAGES]);
  });

  test('does not register a formatter for Dockerfile with default settings', async () => {
    assert.strictEqual(await formatEdits('dockerfile'), undefined);
  });

  test('registers a formatter for shellscript when the extension activates', async () => {
    assert.notStrictEqual(await formatEdits('shellscript'), undefined);
  });

  test('registers a formatter for Dockerfile after dockerfile is added to effectLanguages', async () => {
    const settings = vscode.workspace.getConfiguration('shellformat');
    const current = settings.get<string[]>('effectLanguages') ?? [];
    const subscriptions: vscode.Disposable[] = [];
    await settings.update(
      'effectLanguages',
      [...current, 'dockerfile'],
      vscode.ConfigurationTarget.Global
    );
    try {
      await activate({ subscriptions, extensionPath: root } as vscode.ExtensionContext);
      assert.notStrictEqual(await formatEdits('dockerfile'), undefined);
    } finally {
      for (const d of subscriptions) {
        d.dispose();
      }
      await settings.update('effectLanguages', undefined, vscode.ConfigurationTarget.Global);
    }
  });
});
