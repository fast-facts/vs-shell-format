import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as editorconfig from 'editorconfig';
import { clearEditorConfigCache, parseEditorConfig } from '../../src/shFormat';

function writeConfig(dir: string, indentSize: number): string {
  const cfg = path.join(dir, '.editorconfig');
  fs.writeFileSync(
    cfg,
    `root = true\n\n[*.sh]\nindent_style = space\nindent_size = ${indentSize}\n`
  );
  return cfg;
}

function bumpMtime(filePath: string): void {
  const st = fs.statSync(filePath);
  fs.utimesSync(filePath, st.atime, new Date(st.mtimeMs + 1000));
}

suite('parseEditorConfig cache', () => {
  const dirs: string[] = [];

  function tempScript(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edcfg-cache-'));
    dirs.push(root);
    const file = path.join(root, 'sample.sh');
    fs.writeFileSync(file, 'echo hi\n');
    return file;
  }

  setup(() => {
    clearEditorConfigCache();
  });

  teardown(() => {
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  test('returns the same object when .editorconfig mtimes are unchanged', () => {
    const file = tempScript();
    writeConfig(path.dirname(file), 2);
    const first = parseEditorConfig(file);
    assert.strictEqual(parseEditorConfig(file), first);
    assert.strictEqual(first.indent_size, 2);
  });

  test('re-parses when the directory .editorconfig changes', () => {
    const file = tempScript();
    const cfg = writeConfig(path.dirname(file), 2);
    parseEditorConfig(file);
    writeConfig(path.dirname(file), 4);
    bumpMtime(cfg);
    assert.strictEqual(parseEditorConfig(file).indent_size, 4);
  });

  test('re-parses when a parent .editorconfig changes', () => {
    const file = tempScript();
    const nested = path.join(path.dirname(file), 'sub', 'sample.sh');
    fs.mkdirSync(path.dirname(nested));
    fs.writeFileSync(nested, 'echo hi\n');
    const cfg = writeConfig(path.dirname(file), 2);
    parseEditorConfig(nested);
    writeConfig(path.dirname(file), 8);
    bumpMtime(cfg);
    assert.strictEqual(parseEditorConfig(nested).indent_size, 8);
  });

  test('matches parseSync when no .editorconfig exists in the tree', () => {
    const file = tempScript();
    const cached = parseEditorConfig(file);
    assert.strictEqual(parseEditorConfig(file), cached);
    assert.deepStrictEqual(cached, editorconfig.parseSync(file));
  });
});
