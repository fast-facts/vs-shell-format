import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  download2,
  getReleaseDownloadUrl,
  getPlatFormFilename,
  getDestPath,
  verifyShfmtChecksum,
} from '../../src/downloader';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { config } from '../../src/config';

suite('Downloader Tests', () => {
  test('getDestPath always uses extension bin dir', () => {
    const dest = getDestPath({ extensionPath: '/ext' } as vscode.ExtensionContext);
    assert.strictEqual(dest, path.join('/ext', 'bin', getPlatFormFilename()));
  });

  test('download', async () => {
    const url = getReleaseDownloadUrl();
    const dest = `${__dirname}/../${getPlatFormFilename()}`;

    try {
      if ((await fs.promises.stat(dest)).isFile) {
        await fs.promises.unlink(dest);
      }
    } catch (err) {
      console.log(err);
    }

    await download2(url, dest, (p, t) => console.log(`${(100.0 * p) / t}%`));

    let version = await child_process.execFileSync(dest, ['--version'], {
      encoding: 'utf8',
    });

    version = version.replace('\n', '');

    assert.equal(version, config.shfmtVersion);
  }).timeout('60s');

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
