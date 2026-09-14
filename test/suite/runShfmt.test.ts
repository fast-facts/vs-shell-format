import * as assert from 'assert';
import * as vscode from 'vscode';
import { runShfmt } from '../../src/shFormat';

const node = process.execPath;

suite('runShfmt', function () {
  this.timeout(20000);

  test('rejects when the binary does not exist', async () => {
    await assert.rejects(runShfmt('/nonexistent-shfmt-xyz', [], 'echo hi\n'), /ENOENT/);
  });

  test('captures stdout of a working command', async () => {
    const out = await runShfmt(node, ['--version'], '');
    assert.ok(/^v\d+\./.test(out.trim()), `expected a node version, got: ${out}`);
  });

  test('nonzero exit rejects with the stderr text', async () => {
    await assert.rejects(
      runShfmt(node, ['-e', 'console.error("boom"); process.exit(3)'], ''),
      /boom/
    );
  });

  test('cancellation kills the child', async () => {
    const source = new vscode.CancellationTokenSource();
    const pending = runShfmt(
      node,
      ['-e', 'setTimeout(() => undefined, 60000)'],
      'echo hi\n',
      source.token,
      25000
    );
    source.cancel();
    await assert.rejects(pending, /cancelled/);
    source.dispose();
  });

  test('an already-cancelled token rejects without running', async () => {
    const source = new vscode.CancellationTokenSource();
    source.cancel();
    await assert.rejects(
      runShfmt('/nonexistent-shfmt-xyz', [], 'echo hi\n', source.token),
      /cancelled/
    );
    source.dispose();
  });

  test('a hung child times out', async () => {
    await assert.rejects(
      runShfmt(node, ['-e', 'setTimeout(() => undefined, 60000)'], 'echo hi\n', undefined, 300),
      /timed out/
    );
  });
});
