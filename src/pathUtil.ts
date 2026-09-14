import * as fs from 'fs';

export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function substitutePath(filePath: string): string {
  return filePath.replace(
    /\${env:([^=}]+)}/g,
    (_sub: string, envName: string) => process.env[envName] ?? ''
  );
}
