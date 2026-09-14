import * as assert from 'assert';
import { prepareShfmt, type PrepareShfmtInput } from '../../src/shfmtFlags';

const BASE: PrepareShfmtInput = {
  fileName: 'script.sh',
  binPath: null,
  flag: null,
  useEditorConfig: false,
  editorConfig: {},
  defaultCommand: '/ext/bin/shfmt',
  pathExists: true,
  options: { insertSpaces: true, tabSize: 4 },
};

function runFlags(fileName: string, extra: Partial<PrepareShfmtInput> = {}) {
  const result = prepareShfmt({ ...BASE, fileName, ...extra });
  if (result.kind !== 'run') {
    assert.fail(result.kind);
  }
  return result.flags;
}

suite('prepareShfmt', () => {
  test('adds --ln=bats for .bats files', () => {
    assert.deepStrictEqual(runFlags('t.bats'), ['--ln=bats', '-i=4']);
  });

  test('adds --ln=zsh for zsh files', () => {
    for (const name of ['t.zsh', '.zshrc', '.zshenv', '.zprofile', '.zlogin', '.zlogout']) {
      assert.deepStrictEqual(runFlags(name), ['--ln=zsh', '-i=4']);
    }
  });

  test('adds --ln=mksh for mksh files', () => {
    for (const name of ['t.mksh', '.mkshrc']) {
      assert.deepStrictEqual(runFlags(name), ['--ln=mksh', '-i=4']);
    }
  });

  test('adds --ln=posix for dash files', () => {
    assert.deepStrictEqual(runFlags('t.dash'), ['--ln=posix', '-i=4']);
  });

  test('packaging scripts fall back to bash with no --ln flag', () => {
    for (const name of ['PKGBUILD', 'APKBUILD', 'foo.ebuild', 'foo.eclass']) {
      assert.deepStrictEqual(runFlags(name), ['-i=4']);
    }
  });

  test('rejects a missing custom path and does not return a command', () => {
    const result = prepareShfmt({
      ...BASE,
      binPath: '/no/such/shfmt',
      pathExists: false,
    });
    assert.deepStrictEqual(result, {
      kind: 'invalid-path',
      message: 'Invalid shfmt path in extension configuration: /no/such/shfmt',
    });
  });

  test('rejects -w and does not return a command', () => {
    const result = prepareShfmt({ ...BASE, flag: '-p -w' });
    assert.deepStrictEqual(result, {
      kind: 'write-flag',
      message: 'Incompatible flag specified in shellformat.flag: -w',
    });
  });

  test('keeps quoted flag values with spaces', () => {
    assert.deepStrictEqual(
      runFlags('script.sh', { flag: '--filename="my dir/x.sh"' }),
      ['--filename=my dir/x.sh', '-i=4']
    );
  });

  test('rejects -w next to a quoted flag value', () => {
    const result = prepareShfmt({
      ...BASE,
      flag: '--filename="my dir/x.sh" -w',
    });
    assert.deepStrictEqual(result, {
      kind: 'write-flag',
      message: 'Incompatible flag specified in shellformat.flag: -w',
    });
  });

  test('EditorConfig on maps indent and shell keys and ignores user flags', () => {
    assert.deepStrictEqual(
      runFlags('script.sh', {
        flag: '-p -w',
        useEditorConfig: true,
        editorConfig: {
          indent_style: 'space',
          indent_size: 2,
          shell_variant: 'posix',
          binary_next_line: true,
          switch_case_indent: true,
          space_redirects: true,
          keep_padding: true,
          function_next_line: true,
        },
      }),
      ['-i=2', '-ln=posix', '-bn', '-ci', '-sr', '-kp', '-fn']
    );
  });

  test('EditorConfig tab indent uses -i=0', () => {
    assert.deepStrictEqual(
      runFlags('script.sh', {
        useEditorConfig: true,
        editorConfig: { indent_style: 'tab' },
      }),
      ['-i=0']
    );
  });

  test('EditorConfig off keeps user flags', () => {
    assert.deepStrictEqual(runFlags('script.sh', { flag: '-p -bn' }), ['-p', '-bn', '-i=4']);
  });

  test('uses editor tab size when no indent flag is set', () => {
    assert.deepStrictEqual(runFlags('script.sh'), ['-i=4']);
  });

  test('does not add editor tab size when -i is already set', () => {
    assert.deepStrictEqual(runFlags('script.sh', { flag: '-i=2' }), ['-i=2']);
  });

  test('uses the custom path when it exists', () => {
    const result = prepareShfmt({
      ...BASE,
      binPath: '/usr/bin/shfmt',
      pathExists: true,
    });
    if (result.kind !== 'run') {
      assert.fail(result.kind);
    }
    assert.strictEqual(result.command, '/usr/bin/shfmt');
  });

  test('-ci does not count as an indent flag', () => {
    assert.deepStrictEqual(runFlags('script.sh', { flag: '-ci' }), ['-ci', '-i=4']);
  });

  test('languageId zsh covers untitled documents', () => {
    assert.deepStrictEqual(
      runFlags('Untitled-1', { languageId: 'zsh' }),
      ['--ln=zsh', '-i=4']
    );
  });
});
