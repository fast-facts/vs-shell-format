import * as assert from 'assert';
import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { runShfmt } from '../../src/shFormat';

let nodeCommand: string | null = null;

function findNode(): string | null {
  if (nodeCommand !== null) {
    return nodeCommand;
  }
  for (const candidate of ['node', process.execPath]) {
    try {
      child_process.execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      nodeCommand = candidate;
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

suite('runShfmt', function () {
  this.timeout(20000);

  test('rejects when the binary does not exist', async () => {
    await assert.rejects(runShfmt('/nonexistent-shfmt-xyz', [], 'echo hi\n'), /ENOENT/);
  });

  test('captures stdout of a working command', async function () {
    const node = findNode();
    if (!node) {
      this.skip();
    }
    const out = await runShfmt(node as string, ['--version'], '');
    assert.ok(/^v\d+\./.test(out.trim()), `expected a node version, got: ${out}`);
  });

  test('nonzero exit rejects with the stderr text', async function () {
    const node = findNode();
    if (!node) {
      this.skip();
    }
    await assert.rejects(
      runShfmt(node as string, ['-e', 'console.error("boom"); process.exit(3)'], ''),
      /boom/
    );
  });

  test('cancellation kills the child', async function () {
    const node = findNode();
    if (!node) {
      this.skip();
    }
    const source = new vscode.CancellationTokenSource();
    const pending = runShfmt(
      node as string,
      ['-e', 'setTimeout(() => undefined, 60000)'],
      'echo hi\n',
      source.token,
      25000
    );
    source.cancel();
    await assert.rejects(pending, /cancelled/);
    source.dispose();
  });

  test('a hung child times out', async function () {
    const node = findNode();
    if (!node) {
      this.skip();
    }
    await assert.rejects(
      runShfmt(node as string, ['-e', 'setTimeout(() => undefined, 60000)'], 'echo hi\n', undefined, 300),
      /timed out/
    );
  });
});
