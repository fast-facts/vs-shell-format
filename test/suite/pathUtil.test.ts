import * as assert from 'assert';
import * as path from 'path';
import { fileExists, substitutePath } from '../../src/pathUtil';

suite('pathUtil', () => {
  test('fileExists is true for a file and false for a missing path or directory', () => {
    assert.strictEqual(fileExists(__filename), true);
    assert.strictEqual(fileExists(path.join(__dirname, 'no-such-file')), false);
    assert.strictEqual(fileExists(__dirname), false);
  });

  test('substitutePath replaces env only', () => {
    process.env.PATHUTIL_TEST_VAR = 'from-env';
    process.env.PATHUTIL_TEST_EMPTY = '';
    delete process.env.PATHUTIL_TEST_GONE;
    try {
      assert.strictEqual(substitutePath('${workspaceFolder}/bin'), '${workspaceFolder}/bin');
      assert.strictEqual(substitutePath('${workspaceRoot}/bin'), '${workspaceRoot}/bin');
      assert.strictEqual(substitutePath('${env:PATHUTIL_TEST_VAR}'), 'from-env');
      assert.strictEqual(substitutePath('${env:PATHUTIL_TEST_GONE}'), '');
      assert.strictEqual(substitutePath('${env:PATHUTIL_TEST_EMPTY}'), '');
    } finally {
      delete process.env.PATHUTIL_TEST_VAR;
      delete process.env.PATHUTIL_TEST_EMPTY;
    }
  });
});
