import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { userOrDefaultSetting } from '../../src/userSettings';
import { getSettings } from '../../src/shFormat';

suite('userOrDefaultSetting', () => {
  test('returns undefined when inspect is missing', () => {
    assert.strictEqual(userOrDefaultSetting(undefined), undefined);
  });

  test('uses default when only workspace sets a value', () => {
    const result = userOrDefaultSetting({
      defaultValue: null,
      workspaceValue: '/tmp/evil',
      workspaceFolderValue: '/tmp/evil-folder',
      workspaceLanguageValue: '/tmp/evil-lang',
      workspaceFolderLanguageValue: '/tmp/evil-folder-lang',
    });
    assert.strictEqual(result, null);
    assert.strictEqual(
      userOrDefaultSetting({ defaultValue: '/usr/bin/shfmt', workspaceValue: '/tmp/evil' }),
      '/usr/bin/shfmt'
    );
  });

  test('uses user setting and ignores all workspace values', () => {
    const result = userOrDefaultSetting({
      defaultValue: null,
      globalValue: '/usr/bin/shfmt',
      workspaceValue: '/tmp/evil',
      workspaceFolderValue: '/tmp/evil-folder',
      workspaceLanguageValue: '/tmp/evil-lang',
      workspaceFolderLanguageValue: '/tmp/evil-folder-lang',
    });
    assert.strictEqual(result, '/usr/bin/shfmt');
  });

  test('uses user language override over user setting', () => {
    const result = userOrDefaultSetting({
      defaultValue: null,
      globalValue: '/usr/bin/shfmt',
      globalLanguageValue: '/opt/shfmt',
    });
    assert.strictEqual(result, '/opt/shfmt');
  });
});

suite('untrusted workspace manifest', () => {
  test('restricts path and flag only', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));
    assert.deepStrictEqual(pkg.capabilities.untrustedWorkspaces.restrictedConfigurations, [
      'shellformat.path',
      'shellformat.flag',
    ]);
  });
});

suite('getSettings integration', function () {
  this.timeout(20000);

  test('custom path expands env and leaves workspace vars literal', async () => {
    const config = vscode.workspace.getConfiguration('shellformat');
    process.env.SHELLFORMAT_TEST_BIN = '/opt/shfmt';
    try {
      await config.update(
        'path',
        '${env:SHELLFORMAT_TEST_BIN}',
        vscode.ConfigurationTarget.Global
      );
      assert.strictEqual(getSettings('path'), '/opt/shfmt');
      await config.update(
        'path',
        '${workspaceFolder}/tools/shfmt',
        vscode.ConfigurationTarget.Global
      );
      assert.strictEqual(getSettings('path'), '${workspaceFolder}/tools/shfmt');
      await config.update(
        'path',
        '${workspaceRoot}/tools/shfmt',
        vscode.ConfigurationTarget.Global
      );
      assert.strictEqual(getSettings('path'), '${workspaceRoot}/tools/shfmt');
    } finally {
      delete process.env.SHELLFORMAT_TEST_BIN;
      await config.update('path', undefined, vscode.ConfigurationTarget.Global);
    }
  });
});
