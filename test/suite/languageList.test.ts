import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate, registerFormattingProviders } from '../../src/extension';
import type { ShellDocumentFormattingEditProvider } from '../../src/shFormat';

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

  test('does not register a formatter for plaintext', async () => {
    assert.strictEqual(await formatEdits('plaintext'), undefined);
  });

  test('re-registering disposes the previous providers', () => {
    const disposed: string[] = [];
    let n = 0;
    const fakeRegistrar = (selector: vscode.DocumentSelector) => {
      const id = `${n++}:${JSON.stringify(selector)}`;
      return { dispose: () => disposed.push(id) };
    };
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;
    const provider = {} as ShellDocumentFormattingEditProvider;
    registerFormattingProviders(context, provider, fakeRegistrar);
    const perCall = n;
    assert.ok(perCall > 0, 'expected at least one provider registration');
    registerFormattingProviders(context, provider, fakeRegistrar);
    assert.strictEqual(disposed.length, perCall);
    assert.strictEqual(n, perCall * 2);
  });

  test('activation registers providers before the install finishes', async function () {
    let releaseInstall!: () => void;
    const installGate = new Promise<void>((resolve) => {
      releaseInstall = resolve;
    });
    let installCalled = false;
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;
    const pending = activate(context, {
      checkInstall: async () => {
        installCalled = true;
        await installGate;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(installCalled, 'expected the install check to start');
    assert.ok(
      context.subscriptions.length >= DEFAULT_LANGUAGES.length,
      `expected providers registered, got ${context.subscriptions.length}`
    );
    releaseInstall();
    await pending;
  });

  test('restores the real providers after these tests', async function () {
    this.timeout(60000);
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} is not present`);
    await ext.activate();
  });
});
