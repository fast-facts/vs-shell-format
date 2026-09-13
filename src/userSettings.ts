export type ExecutableInspect<T> = {
  readonly defaultValue?: T;
  readonly globalValue?: T;
  readonly globalLanguageValue?: T;
  readonly workspaceValue?: T;
  readonly workspaceFolderValue?: T;
  readonly workspaceLanguageValue?: T;
  readonly workspaceFolderLanguageValue?: T;
};

export function userOrDefaultSetting<T>(
  inspected: ExecutableInspect<T> | undefined
): T | undefined {
  if (inspected === undefined) {
    return undefined;
  }
  if (inspected.globalLanguageValue !== undefined) {
    return inspected.globalLanguageValue;
  }
  if (inspected.globalValue !== undefined) {
    return inspected.globalValue;
  }
  return inspected.defaultValue;
}
