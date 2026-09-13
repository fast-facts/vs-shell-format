import * as assert from 'assert';
import { EditTypes, getEdits } from '../../src/diffUtils';

suite('getEdits', () => {
  test('inserts a line', () => {
    const patch = getEdits(
      'script.sh',
      'echo one\necho two\n',
      'echo one\necho insert\necho two\n'
    );
    assert.strictEqual(patch.fileName, 'script.sh');
    assert.strictEqual(patch.edits.length, 1);
    const edit = patch.edits[0];
    assert.strictEqual(edit.action, EditTypes.EDIT_INSERT);
    assert.strictEqual(edit.start.line, 1);
    assert.strictEqual(edit.start.character, 0);
    assert.strictEqual(edit.text, 'echo insert\n');
  });

  test('deletes a line', () => {
    const patch = getEdits(
      'script.sh',
      'echo one\necho two\necho three\n',
      'echo one\necho three\n'
    );
    assert.strictEqual(patch.edits.length, 1);
    const edit = patch.edits[0];
    assert.strictEqual(edit.action, EditTypes.EDIT_DELETE);
    assert.strictEqual(edit.start.line, 1);
    assert.strictEqual(edit.start.character, 0);
    assert.strictEqual(edit.end.line, 2);
    assert.strictEqual(edit.end.character, 0);
  });

  test('replaces a line', () => {
    const patch = getEdits(
      'script.sh',
      'echo one\necho old\necho three\n',
      'echo one\necho new\necho three\n'
    );
    assert.strictEqual(patch.edits.length, 1);
    const edit = patch.edits[0];
    assert.strictEqual(edit.action, EditTypes.EDIT_REPLACE);
    assert.strictEqual(edit.start.line, 1);
    assert.strictEqual(edit.end.line, 2);
    assert.strictEqual(edit.text, 'echo new\n');
  });

  test('normalizes Windows line endings on win32', () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      const patch = getEdits('script.sh', 'echo one\r\necho two\r\n', 'echo one\necho two\n');
      assert.strictEqual(patch.edits.length, 0);
    } finally {
      if (descriptor) {
        Object.defineProperty(process, 'platform', descriptor);
      }
    }
  });

  test('returns no edits when text is already formatted', () => {
    const text = 'echo one\necho two\n';
    const patch = getEdits('script.sh', text, text);
    assert.strictEqual(patch.edits.length, 0);
  });
});
