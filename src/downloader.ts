import * as fs from 'fs';
import * as crypto from 'crypto';
import { config } from './config';
import { getPlatformFilename, getReleaseDownloadUrl } from './platform';
import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';

export * from './platform';

const MaxRedirects = 10;
const allowedDownloadHosts = [
  'github.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'release-assets.githubusercontent.com',
];

function allowedDownloadUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error(`blocked download protocol: ${parsed.protocol}`);
  }
  if (!allowedDownloadHosts.includes(parsed.hostname)) {
    throw new Error(`blocked download host: ${parsed.hostname}`);
  }
  return parsed.href;
}

export async function verifyShfmtChecksum(destPath: string): Promise<void> {
  try {
    const filename = getPlatformFilename();
    const expected = config.shfmtChecksums[filename as keyof typeof config.shfmtChecksums];
    if (!expected) {
      throw new Error(`unknown shfmt filename: ${filename}`);
    }
    const actual = crypto
      .createHash('sha256')
      .update(await fs.promises.readFile(destPath))
      .digest('hex');
    if (actual !== expected) {
      throw new Error(`shfmt hash mismatch for ${filename}`);
    }
  } catch (err) {
    await cleanFile(destPath);
    throw err;
  }
}

const inFlightDownloads = new Map<string, Promise<void>>();

export function download2(srcUrl: string, destPath: string) {
  const pending =
    inFlightDownloads.get(destPath) ??
    runDownload(srcUrl, destPath).finally(() => inFlightDownloads.delete(destPath));
  inFlightDownloads.set(destPath, pending);
  return pending;
}

async function runDownload(srcUrl: string, destPath: string): Promise<void> {
  let response: Response | undefined;
  for (let i = 0; i < MaxRedirects; ++i) {
    srcUrl = allowedDownloadUrl(srcUrl);
    response = await fetch(srcUrl, { redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      srcUrl = new URL(location, srcUrl).href;
    } else {
      break;
    }
  }
  if (response && response.status >= 300 && response.status < 400 && response.headers.get('location')) {
    throw new Error(`too many redirects (${MaxRedirects}): ${srcUrl}`);
  }
  if (!response || response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP status ${response?.status} : ${response?.statusText}`);
  }
  if (response.headers.get('content-type') !== 'application/octet-stream') {
    throw new Error('HTTP response does not contain an octet stream');
  }
  const body = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(destPath, body, { mode: 0o644 });
  await verifyShfmtChecksum(destPath);
  await fs.promises.chmod(destPath, 0o755);
}

export function getDestPath(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, 'bin', getPlatformFilename());
}

export async function checkInstall(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  configPath: string | null,
  state: { checked: boolean }
) {
  if (state.checked) {
    return;
  }
  const destPath = getDestPath(context);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const needDownload = await checkNeedInstall(destPath, output, configPath, state);
  if (needDownload) {
    output.show();
    try {
      await cleanFile(destPath);
    } catch {
      output.appendLine(`clean old file failed:[ ${destPath} ] ,please delete it mutual`);
      output.show();
      return;
    }
    const url = getReleaseDownloadUrl();
    try {
      output.appendLine('Shfmt will be downloaded automatically!');
      output.appendLine(`download url: ${url}`);
      output.appendLine(`download to: ${destPath}`);
      output.appendLine(
        `If the download fails, you can manually download it to the dest directory.`
      );
      output.appendLine(
        'Or download to another directory, and then set the "shellformat.path" as the path'
      );
      output.appendLine(`download shfmt page: https://github.com/mvdan/sh/releases`);
      output.appendLine(`You can't use this plugin until the download is successful.`);
      output.show();
      await download2(url, destPath);
      output.appendLine(`download success, You can use it successfully!`);
      output.appendLine('Start or issues can be submitted here https://git.io/shfmt');
    } catch (err) {
      output.appendLine(`download failed: ${err}`);
    }
    output.show();
  }
}

async function cleanFile(file: string) {
  try {
    await fs.promises.access(file);
  } catch {
    return;
  }
  await fs.promises.unlink(file);
}

export async function checkNeedInstall(
  dest: string,
  output: vscode.OutputChannel,
  configPath: string | null,
  state: { checked: boolean } = { checked: false }
): Promise<boolean> {
  try {
    if (configPath) {
      try {
        await fs.promises.access(configPath, fs.constants.X_OK);
        state.checked = true;
        return false;
      } catch {
        output.appendLine(
          `"shellformat.path": "${configPath}"   find config shellformat path ,but the file cannot execute or not exists, so will auto download shfmt`
        );
      }
    }

    // Checksum first: getInstalledVersion executes dest.
    try {
      await verifyShfmtChecksum(dest);
    } catch (err) {
      output.appendLine(`installed shfmt failed checksum, will re-download: ${err}`);
      return true;
    }

    const version = await getInstalledVersion(dest);

    const needInstall = version !== config.shfmtVersion;
    if (!needInstall) {
      state.checked = true;
    } else {
      output.appendLine(
        `current shfmt version : ${version}  ,is outdate to new version : ${config.shfmtVersion}`
      );
    }
    return needInstall;
  } catch (err) {
    output.appendLine(`shfmt hasn't downloaded yet!` + err);
    output.show();
    return true;
  }
}

async function getInstalledVersion(dest: string): Promise<string> {
  const stat = await fs.promises.stat(dest);
  if (stat.isFile()) {
    const v = child_process.execFileSync(dest, ['--version'], {
      encoding: 'utf8',
    });
    return v.replace('\n', '');
  } else {
    throw new Error(`[${dest}] is not file`);
  }
}
