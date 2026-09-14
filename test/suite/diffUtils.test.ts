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

  test('ignores CRLF vs LF only differences on any platform', () => {
    const patch = getEdits('script.sh', 'echo one\r\necho two\r\n', 'echo one\necho two\n');
    assert.strictEqual(patch.edits.length, 0);
  });

  test('keeps CRLF line endings when eol is CRLF', () => {
    const patch = getEdits(
      'script.sh',
      'echo one\r\necho two\r\n',
      'echo one\r\necho insert\r\necho two\r\n',
      '\r\n'
    );
    assert.strictEqual(patch.edits.length, 1);
    assert.strictEqual(patch.edits[0].text, 'echo insert\r\n');
  });

  test('keeps distant hunks as separate edits', () => {
    const oldLines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    const newLines = [...oldLines];
    newLines[1] = 'changed2';
    newLines[17] = 'changed18';
    const patch = getEdits(
      'script.sh',
      oldLines.join('\n') + '\n',
      newLines.join('\n') + '\n'
    );
    assert.strictEqual(patch.edits.length, 2);
    assert.strictEqual(patch.edits[0].action, EditTypes.EDIT_REPLACE);
    assert.strictEqual(patch.edits[0].start.line, 1);
    assert.strictEqual(patch.edits[0].end.line, 2);
    assert.strictEqual(patch.edits[0].text, 'changed2\n');
    assert.strictEqual(patch.edits[1].action, EditTypes.EDIT_REPLACE);
    assert.strictEqual(patch.edits[1].start.line, 17);
    assert.strictEqual(patch.edits[1].end.line, 18);
    assert.strictEqual(patch.edits[1].text, 'changed18\n');
  });

  test('returns no edits for two empty strings', () => {
    const patch = getEdits('script.sh', '', '');
    assert.strictEqual(patch.edits.length, 0);
  });

  test('deleting all content is a single delete', () => {
    const patch = getEdits('script.sh', 'echo hi\n', '');
    assert.strictEqual(patch.edits.length, 1);
    assert.strictEqual(patch.edits[0].action, EditTypes.EDIT_DELETE);
  });

  test('missing trailing newline becomes a newline-terminated replace', () => {
    const patch = getEdits('script.sh', 'echo hi', 'echo hi\n');
    assert.strictEqual(patch.edits.length, 1);
    assert.strictEqual(patch.edits[0].action, EditTypes.EDIT_REPLACE);
    assert.strictEqual(patch.edits[0].text, 'echo hi\n');
  });

  test('returns no edits when text is already formatted', () => {
    const text = 'echo one\necho two\n';
    const patch = getEdits('script.sh', text, text);
    assert.strictEqual(patch.edits.length, 0);
  });
});
