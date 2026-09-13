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
import * as path from 'path';
import { config } from '../../src/config';

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
const originalArch = Object.getOwnPropertyDescriptor(process, 'arch');

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

suite('Downloader Tests', () => {
  teardown(restoreProcess);

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
});
