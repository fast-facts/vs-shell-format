import { config } from './config';

export enum Arch {
  arm = 'arm',
  arm64 = 'arm64',
  i386 = '386',
  mips = 'mips',
  x64 = 'amd64',
  unknown = 'unknown',
}

export enum Platform {
  darwin = 'darwin',
  freebsd = 'freebsd',
  linux = 'linux',
  netbsd = 'netbsd',
  openbsd = 'openbsd',
  windows = 'windows',
  unknown = 'unknown',
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

export function getExecutableFileExt() {
  return process.platform === 'win32' ? '.exe' : '';
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
  return `https://github.com/mvdan/sh/releases/download/${config.shfmtVersion}/${getPlatformFilename()}`;
}
