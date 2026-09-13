import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  download2,
  getReleaseDownloadUrl,
  getPlatFormFilename,
  getDestPath,
  getArchExtension,
  getPlatform,
  verifyShfmtChecksum,
} from '../../src/downloader';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { config } from '../../src/config';

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
const originalArch = Object.getOwnPropertyDescriptor(process, 'arch');
const originalHttpsGet = https.get;

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

function fakeHttpsGet(
  handler: (url: string) => { statusCode: number; headers?: Record<string, string> }
) {
  Object.defineProperty(https, 'get', {
    configurable: true,
    writable: true,
    value: (
      url: string,
      cb: (res: { statusCode: number; headers: Record<string, string> }) => void
    ) => {
      const reply = handler(url);
      cb({ statusCode: reply.statusCode, headers: reply.headers || {} });
    },
  });
}

suite('Downloader Tests', () => {
  teardown(() => {
    Object.defineProperty(https, 'get', {
      value: originalHttpsGet,
      configurable: true,
      writable: true,
    });
    restoreProcess();
  });

  test('linux x64 name uses config.shfmtVersion', () => {
    setProcess('linux', 'x64');
    assert.strictEqual(getPlatform(), 'linux');
    assert.strictEqual(getArchExtension(), 'amd64');
    assert.strictEqual(getPlatFormFilename(), `shfmt_${config.shfmtVersion}_linux_amd64`);
  });

  test('windows name ends with .exe', () => {
    setProcess('win32', 'x64');
    assert.strictEqual(getPlatform(), 'windows');
    assert.ok(getPlatFormFilename().endsWith('.exe'));
  });

  test('darwin arm64 uses arm64', () => {
    setProcess('darwin', 'arm64');
    assert.strictEqual(getArchExtension(), 'arm64');
    assert.ok(getPlatFormFilename().includes('arm64'));
  });

  test('unknown OS throws', () => {
    setProcess('aix', 'x64');
    assert.strictEqual(getPlatform(), 'unknown');
    assert.throws(() => getPlatFormFilename());
  });

  test('unknown CPU throws', () => {
    setProcess('linux', 's390x');
    assert.strictEqual(getArchExtension(), 'unknown');
    assert.throws(() => getPlatFormFilename());
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
    fakeHttpsGet((url) => {
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
    fakeHttpsGet(() => ({ statusCode: 403 }));
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', `${__dirname}/../bad-status`),
      /HTTP status 403/
    );
  });

  test('rejects content-type that is not application/octet-stream', async () => {
    fakeHttpsGet(() => ({ statusCode: 200, headers: { 'content-type': 'text/html' } }));
    await assert.rejects(
      download2('https://github.com/mvdan/sh/x', `${__dirname}/../bad-type`),
      /octet stream/
    );
  });
});
