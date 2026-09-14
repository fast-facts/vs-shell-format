import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  checkInstall,
  checkNeedInstall,
  download2,
  getArchExtension,
  getDestPath,
  getInstalledVersion,
  getPlatform,
  getPlatformFilename,
  getReleaseDownloadUrl,
  trackInstall,
  verifyShfmtChecksum,
  whenInstallReady,
} from '../../src/downloader';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
const originalArch = Object.getOwnPropertyDescriptor(process, 'arch');
const originalFetch = globalThis.fetch;
const originalWithProgress = Object.getOwnPropertyDescriptor(vscode.window, 'withProgress');

function setProcess(platform: string, arch: string) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  Object.defineProperty(process, 'arch', { value: arch, configurable: true });
}

function restoreProcess() {
  if (originalPlatform) {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
  if (originalArch) {
    Object.defineProperty(process, 'arch', originalArch);
  }
}

function stubWithProgress(): vscode.ProgressOptions[] {
  const calls: vscode.ProgressOptions[] = [];
  const stub: typeof vscode.window.withProgress = (options, task) => {
    calls.push(options);
    return task({ report: () => undefined }, new vscode.CancellationTokenSource().token);
  };
  Object.defineProperty(vscode.window, 'withProgress', { configurable: true, value: stub });
  return calls;
}

function fakeFetch(
  handler: (url: string) => { statusCode: number; headers?: Record<string, string>; body?: Buffer }
) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const reply = handler(url);
    return new Response(reply.body ?? null, {
      status: reply.statusCode,
      statusText: String(reply.statusCode),
      headers: reply.headers,
    });
  }) as typeof fetch;
}

suite('Downloader Tests', () => {
  teardown(() => {
    globalThis.fetch = originalFetch;
    restoreProcess();
    if (originalWithProgress) {
      Object.defineProperty(vscode.window, 'withProgress', originalWithProgress);
    }
  });

  test('whenInstallReady does not resolve until trackInstall work settles', async () => {
    let ready = false;
    let resolveWork: () => void = () => undefined;
    void trackInstall(
      new Promise<void>(resolve => {
        resolveWork = resolve;
      })
    );
    const pending = whenInstallReady().then(() => {
      ready = true;
    });
    await Promise.resolve();
    assert.strictEqual(ready, false);
    resolveWork();
    await pending;
    assert.strictEqual(ready, true);
    void trackInstall(Promise.resolve());
  });

  test('linux x64 name uses config.shfmtVersion', () => {
    setProcess('linux', 'x64');
    assert.strictEqual(getPlatform(), 'linux');
    assert.strictEqual(getArchExtension(), 'amd64');
    assert.strictEqual(getPlatformFilename(), `shfmt_${config.shfmtVersion}_linux_amd64`);
  });

  test('windows name ends with .exe', () => {
    setProcess('win32', 'x64');
    assert.strictEqual(getPlatform(), 'windows');
    assert.ok(getPlatformFilename().endsWith('.exe'));
  });

  test('darwin arm64 uses arm64', () => {
    setProcess('darwin', 'arm64');
    assert.strictEqual(getArchExtension(), 'arm64');
    assert.ok(getPlatformFilename().includes('arm64'));
  });

  test('unknown OS throws', () => {
    setProcess('aix', 'x64');
    assert.strictEqual(getPlatform(), 'unknown');
    assert.throws(() => getPlatformFilename());
  });

  test('unknown CPU throws', () => {
    setProcess('linux', 's390x');
    assert.strictEqual(getArchExtension(), 'unknown');
    assert.throws(() => getPlatformFilename());
  });

  test('release URL is github mvdan/sh download', () => {
    setProcess('linux', 'x64');
    const filename = `shfmt_${config.shfmtVersion}_linux_amd64`;
    assert.strictEqual(
      getReleaseDownloadUrl(),
      `https://github.com/mvdan/sh/releases/download/${config.shfmtVersion}/${filename}`
    );
  });

  test('getDestPath always uses extension bin dir', () => {
    setProcess('linux', 'x64');
    const dest = getDestPath({ extensionPath: '/ext' } as vscode.ExtensionContext);
    assert.strictEqual(
      dest,
      path.join('/ext', 'bin', `shfmt_${config.shfmtVersion}_linux_amd64`)
    );
  });

  test('one dest shares one download', async () => {
    let n = 0;
    fakeFetch(() => {
      n += 1;
      return { statusCode: 404 };
    });
    const dest = `${__dirname}/../shared-dest`;
    const url = 'https://github.com/mvdan/sh/x';
    await Promise.all([
      assert.rejects(download2(url, dest), /HTTP status 404/),
      assert.rejects(download2(url, dest), /HTTP status 404/),
    ]);
    assert.strictEqual(n, 1);
    await assert.rejects(download2(url, dest), /HTTP status 404/);
    assert.strictEqual(n, 2);
  });

  test('rejects blocked download urls', async () => {
    let n = 0;
    fakeFetch(() => {
      n += 1;
      return { statusCode: 200 };
    });
    await assert.rejects(download2('http://github.com/x', `${__dirname}/../blocked-http`));
    await assert.rejects(download2('https://evil.example/x', `${__dirname}/../blocked-host`));
    assert.strictEqual(n, 0);
  });

  test('hash mismatch rejects', async () => {
    const dest = `${__dirname}/../shfmt-hash-mismatch`;
    await fs.promises.writeFile(dest, 'not-shfmt');
    await assert.rejects(verifyShfmtChecksum(dest));
    await assert.rejects(fs.promises.access(dest));
  });

  test('follows redirects', async () => {
    const seen: string[] = [];
    fakeFetch(url => {
      seen.push(url);
      return seen.length === 1
        ? { statusCode: 302, headers: { location: 'https://objects.githubusercontent.com/shfmt' } }
        : { statusCode: 404 };
    });
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', `${__dirname}/../redirect`),
      /HTTP status 404/
    );
    assert.deepStrictEqual(seen, [
      'https://github.com/mvdan/sh/x',
      'https://objects.githubusercontent.com/shfmt',
    ]);
  });

  test('rejects bad HTTP status', async () => {
    fakeFetch(() => ({ statusCode: 403 }));
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', `${__dirname}/../bad-status`),
      /HTTP status 403/
    );
  });

  test('rejects content-type that is not application/octet-stream', async () => {
    fakeFetch(() => ({ statusCode: 200, headers: { 'content-type': 'text/html' } }));
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', `${__dirname}/../bad-type`),
      /octet stream/
    );
  });

  test('accepts octet-stream content-type with charset', async () => {
    fakeFetch(() => ({
      statusCode: 200,
      headers: { 'content-type': 'application/octet-stream; charset=utf-8' },
    }));
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', `${__dirname}/../charset-type`),
      /hash mismatch/
    );
  });

  test('rejects missing content-type', async () => {
    fakeFetch(() => ({ statusCode: 200 }));
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', `${__dirname}/../missing-type`),
      /octet stream/
    );
  });

  test('windows arm64 has no shfmt build', () => {
    setProcess('win32', 'arm64');
    assert.throws(
      () => getPlatformFilename(),
      /no shfmt build for this platform, set shellformat.path/
    );
  });

  test('checkInstall shows error when platform has no shfmt build', async () => {
    setProcess('win32', 'arm64');
    const shown: string[] = [];
    const originalShowErrorMessage = vscode.window.showErrorMessage;
    vscode.window.showErrorMessage = ((message: string) => {
      shown.push(message);
      return Promise.resolve(undefined);
    }) as typeof originalShowErrorMessage;
    try {
      const output = {
        appendLine: () => undefined,
        show: () => undefined,
      } as unknown as vscode.OutputChannel;
      await checkInstall(
        { extensionPath: '/ext' } as vscode.ExtensionContext,
        output,
        null,
        { checked: false }
      );
      assert.deepStrictEqual(shown, [
        'no shfmt build for this platform, set shellformat.path',
      ]);
    } finally {
      vscode.window.showErrorMessage = originalShowErrorMessage;
    }
  });

  test('too many redirects reject instead of looping forever', async () => {
    let n = 0;
    fakeFetch(() => {
      n += 1;
      return { statusCode: 302, headers: { location: 'https://github.com/mvdan/sh/x' } };
    });
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', `${__dirname}/../redirect-loop`),
      /too many redirects \(10\)/
    );
    assert.strictEqual(n, 10);
  });

  test('a tampered binary is deleted without being executed', async function () {
    if (process.platform === 'win32') {
      this.skip();
    }
    const dest = `${__dirname}/../shfmt-trap`;
    const marker = `${dest}.marker`;
    await fs.promises.writeFile(dest, `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
    const output = { appendLine: () => undefined, show: () => undefined } as unknown as vscode.OutputChannel;
    assert.strictEqual(await checkNeedInstall(dest, output, null), true);
    await assert.rejects(fs.promises.access(marker));
    await assert.rejects(fs.promises.access(dest));
  });

  test('an executable custom path skips the download', async () => {
    let showCalls = 0;
    const output = {
      appendLine: () => undefined,
      show: () => {
        showCalls += 1;
      },
    } as unknown as vscode.OutputChannel;
    assert.strictEqual(await checkNeedInstall('/nonexistent-dest', output, process.execPath), false);
    assert.strictEqual(showCalls, 0);
  });

  test('withProgress is used on the download path', async () => {
    fakeFetch(() => ({ statusCode: 404 }));
    const calls = stubWithProgress();
    const output = { appendLine: () => undefined, show: () => undefined } as unknown as vscode.OutputChannel;
    await checkInstall(
      { extensionPath: `${__dirname}/../check-install-progress` } as vscode.ExtensionContext,
      output,
      null,
      { checked: false }
    );
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].location, vscode.ProgressLocation.Notification);
    assert.strictEqual(calls[0].cancellable, false);
  });

  test('withProgress is not used on the skip-download path', async () => {
    const calls = stubWithProgress();
    const output = { appendLine: () => undefined, show: () => undefined } as unknown as vscode.OutputChannel;
    await checkInstall(
      { extensionPath: `${__dirname}/../check-install-skip-progress` } as vscode.ExtensionContext,
      output,
      process.execPath,
      { checked: false }
    );
    assert.strictEqual(calls.length, 0);
  });

  test('show is called when download fails', async () => {
    fakeFetch(() => ({ statusCode: 404 }));
    let showCalls = 0;
    const output = {
      appendLine: () => undefined,
      show: () => {
        showCalls += 1;
      },
    } as unknown as vscode.OutputChannel;
    await checkInstall(
      { extensionPath: `${__dirname}/../check-install-fail` } as vscode.ExtensionContext,
      output,
      null,
      { checked: false }
    );
    assert.strictEqual(showCalls, 1);
  });

  test('checkInstall removes leftover shfmt binaries but keeps the current file and unrelated names', async () => {
    const extPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'shfmt-bin-'));
    try {
      const bin = path.join(extPath, 'bin');
      const current = getPlatformFilename();
      await fs.promises.mkdir(bin);
      await fs.promises.writeFile(path.join(bin, current), 'current');
      await fs.promises.writeFile(path.join(bin, 'shfmt_v0.0.1_linux_amd64'), 'old');
      await fs.promises.writeFile(path.join(bin, 'notes.txt'), 'keep');
      await checkInstall(
        { extensionPath: extPath } as vscode.ExtensionContext,
        { appendLine: () => undefined, show: () => undefined } as unknown as vscode.OutputChannel,
        process.execPath,
        { checked: false }
      );
      await assert.rejects(fs.promises.access(path.join(bin, 'shfmt_v0.0.1_linux_amd64')));
      assert.strictEqual(await fs.promises.readFile(path.join(bin, current), 'utf8'), 'current');
      assert.strictEqual(await fs.promises.readFile(path.join(bin, 'notes.txt'), 'utf8'), 'keep');
    } finally {
      await fs.promises.rm(extPath, { recursive: true, force: true });
    }
  });

  test('install check state is not shared', async () => {
    const output = { appendLine: () => undefined, show: () => undefined } as unknown as vscode.OutputChannel;
    const a = { checked: false };
    const b = { checked: false };
    await checkNeedInstall('/nonexistent-dest', output, process.execPath, a);
    assert.strictEqual(a.checked, true);
    assert.strictEqual(b.checked, false);
  });

  test('rejects oversize body when Content-Length is missing', async () => {
    const dest = `${__dirname}/../oversize-body`;
    fakeFetch(() => ({
      statusCode: 200,
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.alloc(20 * 1024 * 1024 + 1),
    }));
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', dest),
      /too large/
    );
    await assert.rejects(fs.promises.access(dest));
    await assert.rejects(fs.promises.access(`${dest}.tmp`));
  });

  test('rejects too-large Content-Length before reading the body', async () => {
    const dest = `${__dirname}/../too-large-length`;
    fakeFetch(() => ({
      statusCode: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(20 * 1024 * 1024 + 1),
      },
    }));
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', dest),
      /too large/
    );
    await assert.rejects(fs.promises.access(dest));
    await assert.rejects(fs.promises.access(`${dest}.tmp`));
  });

  test('abort/timeout rejects', async () => {
    const dest = `${__dirname}/../abort-timeout`;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      assert.ok(init?.signal);
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      throw err;
    }) as typeof fetch;
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', dest),
      /timed out/
    );
    await assert.rejects(fs.promises.access(dest));
    await assert.rejects(fs.promises.access(`${dest}.tmp`));
  });

  test('success still writes destPath', async () => {
    const dest = `${__dirname}/../success-dest`;
    const body = Buffer.from('shfmt-ok');
    const checksums = config.shfmtChecksums as unknown as Record<string, string>;
    const filename = getPlatformFilename();
    const previous = checksums[filename];
    checksums[filename] = crypto.createHash('sha256').update(body).digest('hex');
    try {
      fakeFetch(() => ({
        statusCode: 200,
        headers: { 'content-type': 'application/octet-stream' },
        body,
      }));
      await download2('https://github.com/mvdan/sh/x', dest);
      assert.deepStrictEqual(await fs.promises.readFile(dest), body);
      if (process.platform !== 'win32') {
        assert.strictEqual((await fs.promises.stat(dest)).mode & 0o777, 0o755);
      }
      await assert.rejects(fs.promises.access(`${dest}.tmp`));
    } finally {
      checksums[filename] = previous;
      await fs.promises.unlink(dest).catch(() => undefined);
    }
  });

  test('failed checksum does not leave destPath as the bad bytes', async () => {
    const dest = `${__dirname}/../checksum-no-clobber`;
    await fs.promises.writeFile(dest, 'old-bytes');
    fakeFetch(() => ({
      statusCode: 200,
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('bad-bytes'),
    }));
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', dest),
      /hash mismatch/
    );
    assert.strictEqual(await fs.promises.readFile(dest, 'utf8'), 'old-bytes');
    await assert.rejects(fs.promises.access(`${dest}.tmp`));
    await fs.promises.unlink(dest);
  });

  test('CRLF version output matches config after trim', async function () {
    if (process.platform === 'win32') {
      this.skip();
    }
    const dest = `${__dirname}/../shfmt-crlf-version`;
    await fs.promises.writeFile(
      dest,
      `#!/bin/sh\nprintf '${config.shfmtVersion}\\r\\n'\n`,
      { mode: 0o755 }
    );
    assert.strictEqual(await getInstalledVersion(dest), config.shfmtVersion);
  });

  test('hung --version times out', async function () {
    if (process.platform === 'win32') {
      this.skip();
    }
    const dest = `${__dirname}/../shfmt-hung-version`;
    await fs.promises.writeFile(dest, '#!/usr/bin/env node\nsetTimeout(() => undefined, 60000);\n', {
      mode: 0o755,
    });
    await assert.rejects(getInstalledVersion(dest, 300));
  });
});
