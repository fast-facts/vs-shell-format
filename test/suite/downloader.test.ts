import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  checkNeedInstall,
  download2,
  getArchExtension,
  getDestPath,
  getPlatform,
  getPlatformFilename,
  getReleaseDownloadUrl,
  verifyShfmtChecksum,
} from '../../src/downloader';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../src/config';

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
const originalArch = Object.getOwnPropertyDescriptor(process, 'arch');
const originalFetch = globalThis.fetch;

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

function fakeFetch(
  handler: (url: string) => { statusCode: number; headers?: Record<string, string> }
) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const reply = handler(url);
    return new Response(null, {
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
    await assert.rejects(download2('http://github.com/x', `${__dirname}/../blocked-http`));
    await assert.rejects(download2('https://evil.example/x', `${__dirname}/../blocked-host`));
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
    const output = { appendLine: () => undefined, show: () => undefined } as unknown as vscode.OutputChannel;
    assert.strictEqual(await checkNeedInstall('/nonexistent-dest', output, process.execPath), false);
  });
});
