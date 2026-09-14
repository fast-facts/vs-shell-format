import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../../src/extension';
import { getPlatformFilename } from '../../src/downloader';

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

async function waitForShfmt(extensionPath: string): Promise<void> {
  const dest = path.join(extensionPath, 'bin', getPlatformFilename());
  const deadline = Date.now() + 50000;
  while (Date.now() < deadline) {
    try {
      await fs.promises.access(dest, fs.constants.X_OK);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  assert.fail(`shfmt missing at ${dest}`);
}

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
    await waitForShfmt(root);
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

  test('activate resolves while checkInstall is still pending', async () => {
    let resolveInstall: () => void = () => undefined;
    const installGate = new Promise<void>(resolve => {
      resolveInstall = resolve;
    });
    let checkInstallStarted = false;
    let providerRegistrations = 0;
    const originalRegister = vscode.languages.registerDocumentFormattingEditProvider;
    vscode.languages.registerDocumentFormattingEditProvider = ((
      selector: vscode.DocumentSelector,
      provider: vscode.DocumentFormattingEditProvider
    ) => {
      providerRegistrations += 1;
      return originalRegister.call(vscode.languages, selector, provider);
    }) as typeof originalRegister;
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;
    try {
      await activate(context, {
        checkInstall: () => {
          checkInstallStarted = true;
          return installGate;
        },
      });
      assert.ok(checkInstallStarted, 'expected checkInstall to start');
      assert.ok(
        providerRegistrations >= DEFAULT_LANGUAGES.length,
        `expected providers registered, got ${providerRegistrations}`
      );
    } finally {
      resolveInstall();
      vscode.languages.registerDocumentFormattingEditProvider = originalRegister;
      for (const d of context.subscriptions) {
        d.dispose();
      }
    }
  });

  test('narrowing effectLanguages unregisters other providers live', async function () {
    this.timeout(30000);
    const config = vscode.workspace.getConfiguration('shellformat');
    await config.update('effectLanguages', ['shellscript'], vscode.ConfigurationTarget.Global);
    try {
      const deadline = Date.now() + 10000;
      let dockerEdits: vscode.TextEdit[] | undefined = [];
      while (Date.now() < deadline) {
        dockerEdits = await formatEdits('dockerfile');
        if (dockerEdits === undefined) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.strictEqual(dockerEdits, undefined, 'dockerfile provider should be gone');
      assert.notStrictEqual(await formatEdits('shellscript'), undefined);
    } finally {
      await config.update('effectLanguages', undefined, vscode.ConfigurationTarget.Global);
    }
  });
});
