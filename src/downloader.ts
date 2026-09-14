import * as fs from 'fs';
import * as crypto from 'crypto';
import { config } from './config';
import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
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

enum Arch {
  arm = 'arm',
  arm64 = 'arm64',
  i386 = '386',
  mips = 'mips',
  x64 = 'amd64',
  unknown = 'unknown'
}

enum Platform {
  darwin = 'darwin',
  freebsd = 'freebsd',
  linux = 'linux',
  netbsd = 'netbsd',
  openbsd = 'openbsd',
  windows = 'windows',
  unknown = 'unknown'
}

const archByNode: Partial<Record<NodeJS.Architecture, Arch>> = {
  arm: Arch.arm,
  arm64: Arch.arm64,
  ia32: Arch.i386,
  x64: Arch.x64,
  mips: Arch.mips,
};

export function getArchExtension(): Arch {
  return archByNode[process.arch] ?? Arch.unknown;
}

function getExecutableFileExt() {
  if (process.platform === 'win32') {
    return '.exe';
  } else {
    return '';
  }
}

const platformByNode: Partial<Record<NodeJS.Platform, Platform>> = {
  win32: Platform.windows,
  freebsd: Platform.freebsd,
  openbsd: Platform.openbsd,
  darwin: Platform.darwin,
  linux: Platform.linux,
};

export function getPlatform(): Platform {
  return platformByNode[process.platform] ?? Platform.unknown;
}

export function getPlatformFilename() {
  const arch = getArchExtension();
  const platform = getPlatform();
  if (arch === Arch.unknown || platform === Platform.unknown) {
    throw new Error('do not find release shfmt for your platform');
  }
  return `shfmt_${config.shfmtVersion}_${platform}_${arch}${getExecutableFileExt()}`;
}

export function getReleaseDownloadUrl() {
  // https://github.com/mvdan/sh/releases/download/v2.6.4/shfmt_v2.6.4_darwin_amd64
  return `https://github.com/mvdan/sh/releases/download/${
    config.shfmtVersion
  }/${getPlatformFilename()}`;
}

export function getDestPath(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, 'bin', getPlatformFilename());
}

export async function checkInstall(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  configPath: string | null
) {
  if (!config.needCheckInstall) {
    return;
  }
  const destPath = getDestPath(context);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const needDownload = await checkNeedInstall(destPath, output, configPath);
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

async function checkNeedInstall(
  dest: string,
  output: vscode.OutputChannel,
  configPath: string | null
): Promise<boolean> {
  try {
    if (configPath) {
      try {
        await fs.promises.access(configPath, fs.constants.X_OK);
        config.needCheckInstall = false;
        return false;
      } catch {
        output.appendLine(
          `"shellformat.path": "${configPath}"   find config shellformat path ,but the file cannot execute or not exists, so will auto download shfmt`
        );
      }
    }

    const version = await getInstalledVersion(dest);

    const needInstall = version !== config.shfmtVersion;
    if (!needInstall) {
      config.needCheckInstall = false;
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
