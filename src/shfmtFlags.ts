export interface PrepareShfmtInput {
  readonly fileName: string;
  readonly binPath: string | null | undefined;
  readonly flag: string | null | undefined;
  readonly useEditorConfig: boolean;
  readonly editorConfig: {
    readonly indent_style?: unknown;
    readonly indent_size?: unknown;
    readonly shell_variant?: unknown;
    readonly binary_next_line?: unknown;
    readonly switch_case_indent?: unknown;
    readonly space_redirects?: unknown;
    readonly keep_padding?: unknown;
    readonly function_next_line?: unknown;
  };
  readonly defaultCommand: string;
  readonly pathExists: boolean;
  readonly options?: {
    readonly insertSpaces?: boolean;
    readonly tabSize?: number;
  };
}

type PrepareShfmtResult =
  | { readonly kind: 'run'; readonly command: string; readonly flags: string[] } |
  { readonly kind: 'invalid-path'; readonly message: string } |
  { readonly kind: 'write-flag'; readonly message: string };

export function prepareShfmt(input: PrepareShfmtInput): PrepareShfmtResult {
  const flags: string[] = [];
  let hasIndent = false;
  const userFlag = input.useEditorConfig ? '' : (input.flag ?? '');

  if (/\.bats$/.test(input.fileName)) {
    flags.push('--ln=bats');
  }
  if (/\.(zsh|zshrc|zshenv|zprofile|zlogin|zlogout)$/.test(input.fileName)) {
    flags.push('--ln=zsh');
  }
  if (/\.mksh$|\.mkshrc$/.test(input.fileName)) {
    flags.push('--ln=mksh');
  }
  if (/\.dash$/.test(input.fileName)) {
    flags.push('--ln=posix');
  }

  if (input.binPath && !input.pathExists) {
    return {
      kind: 'invalid-path',
      message: `Invalid shfmt path in extension configuration: ${input.binPath}`,
    };
  }

  const command = input.binPath || input.defaultCommand;

  if (input.useEditorConfig) {
    const edcfg = input.editorConfig;
    if (edcfg.indent_style === 'tab') {
      flags.push('-i=0');
      hasIndent = true;
    } else if (edcfg.indent_style === 'space' && typeof edcfg.indent_size === 'number') {
      flags.push(`-i=${edcfg.indent_size}`);
      hasIndent = true;
    }
    if (edcfg.shell_variant) {
      flags.push(`-ln=${edcfg.shell_variant}`);
    }
    if (edcfg.binary_next_line) {
      flags.push('-bn');
    }
    if (edcfg.switch_case_indent) {
      flags.push('-ci');
    }
    if (edcfg.space_redirects) {
      flags.push('-sr');
    }
    if (edcfg.keep_padding) {
      flags.push('-kp');
    }
    if (edcfg.function_next_line) {
      flags.push('-fn');
    }
  }

  if (userFlag) {
    if (userFlag.includes('-w')) {
      return {
        kind: 'write-flag',
        message: 'Incompatible flag specified in shellformat.flag: -w',
      };
    }
    if (userFlag.includes('-i')) {
      hasIndent = true;
    }
    flags.push(...userFlag.split(' '));
  }

  if (input.options?.insertSpaces && !hasIndent) {
    flags.push(`-i=${input.options.tabSize}`);
  }

  return { kind: 'run', command, flags };
}
