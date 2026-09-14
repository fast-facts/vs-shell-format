export interface PrepareShfmtInput {
  readonly fileName: string;
  readonly languageId?: string;
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

const dialectByLanguageId: Record<string, string> = {
  bats: 'bats',
  zsh: 'zsh',
  mksh: 'mksh',
  dash: 'posix',
};

function isOn(value: unknown): boolean {
  return value === true || value === 'true';
}

function splitFlags(raw: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;
  for (const ch of raw) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === '\'') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

export function prepareShfmt(input: PrepareShfmtInput): PrepareShfmtResult {
  const flags: string[] = [];
  let hasIndent = false;
  const userFlag = input.useEditorConfig ? '' : (input.flag ?? '');

  let languageDialect = input.languageId ? dialectByLanguageId[input.languageId] : undefined;
  if (languageDialect) {
    flags.push(`--ln=${languageDialect}`);
  } else {
    if (/\.bats$/.test(input.fileName)) {
      languageDialect = 'bats';
      flags.push('--ln=bats');
    }
    if (/\.(zsh|zshrc|zshenv|zprofile|zlogin|zlogout)$/.test(input.fileName)) {
      languageDialect = 'zsh';
      flags.push('--ln=zsh');
    }
    if (/\.mksh$|\.mkshrc$/.test(input.fileName)) {
      languageDialect = 'mksh';
      flags.push('--ln=mksh');
    }
    if (/\.dash$/.test(input.fileName)) {
      languageDialect = 'posix';
      flags.push('--ln=posix');
    }
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
    } else if (edcfg.indent_style === 'space') {
      const size = edcfg.indent_size;
      if (typeof size === 'number' || (typeof size === 'string' && /^-?\d+$/.test(size))) {
        flags.push(`-i=${size}`);
        hasIndent = true;
      }
    }
    if (typeof edcfg.shell_variant === 'string' && edcfg.shell_variant && !languageDialect) {
      flags.push(`-ln=${edcfg.shell_variant}`);
    }
    if (isOn(edcfg.binary_next_line)) {
      flags.push('-bn');
    }
    if (isOn(edcfg.switch_case_indent)) {
      flags.push('-ci');
    }
    if (isOn(edcfg.space_redirects)) {
      flags.push('-sr');
    }
    if (isOn(edcfg.keep_padding)) {
      flags.push('-kp');
    }
    if (isOn(edcfg.function_next_line)) {
      flags.push('-fn');
    }
  }

  if (userFlag) {
    const tokens = splitFlags(userFlag);
    if (tokens.some(t => (/^-[A-Za-z]+$/.test(t) && t.includes('w')) || /^--write(=true|=false)?$/.test(t))) {
      return {
        kind: 'write-flag',
        message: 'Incompatible flag specified in shellformat.flag: -w',
      };
    }
    if (tokens.some(t => t === '-i' || t.startsWith('-i=') || t === '--indent' || t.startsWith('--indent='))) {
      hasIndent = true;
    }
    flags.push(...tokens);
  }

  if (input.options?.insertSpaces && !hasIndent) {
    flags.push(`-i=${input.options.tabSize}`);
  }

  return { kind: 'run', command, flags };
}
