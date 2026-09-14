import * as assert from 'assert';
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
  });

  test('uses user setting when workspace sets a different value', () => {
    const result = userOrDefaultSetting({
      defaultValue: null,
      globalValue: '/usr/bin/shfmt',
      workspaceValue: '/tmp/evil',
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

suite('getSettings integration', () => {
  test('custom path round-trips through inspect and substitution', async () => {
    const config = vscode.workspace.getConfiguration('shellformat');
    process.env.SHELLFORMAT_TEST_BIN = '/opt/shfmt';
    try {
      await config.update(
        'path',
        '${env:SHELLFORMAT_TEST_BIN}',
        vscode.ConfigurationTarget.Global
      );
      assert.strictEqual(getSettings('path'), '/opt/shfmt');
    } finally {
      delete process.env.SHELLFORMAT_TEST_BIN;
      await config.update('path', undefined, vscode.ConfigurationTarget.Global);
    }
  });
});
