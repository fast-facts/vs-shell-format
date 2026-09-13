import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

type LanguageContribution = {
  readonly id: string;
  readonly extensions?: readonly string[];
  readonly filenames?: readonly string[];
  readonly filenamePatterns?: readonly string[];
};

function loadManifest() {
  const pkgPath = path.resolve(__dirname, '../../../package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

suite('Language mapping contract', () => {
  let languages: LanguageContribution[] = [];
  let activationEvents: string[] = [];
  let effectDefaults: string[] = [];

  suiteSetup(() => {
    const pkg = loadManifest();
    languages = pkg.contributes.languages as LanguageContribution[];
    activationEvents = pkg.activationEvents as string[];
    effectDefaults = pkg.contributes.configuration.properties['shellformat.effectLanguages']
      .default as string[];
  });

  function lang(id: string): LanguageContribution {
    const found = languages.find((l) => l.id === id);
    if (!found) {
      assert.fail(`language ${id} is not registered in contributes.languages`);
    }
    return found;
  }

  test('shellscript covers bash dotfiles', () => {
    const filenames = lang('shellscript').filenames ?? [];
    for (const name of [
      '.bashrc',
      '.bash_profile',
      '.bash_login',
      '.profile',
      '.bash_logout',
      '.bash_aliases',
    ]) {
      assert.ok(filenames.includes(name), `shellscript filenames misses ${name}`);
    }
  });

  test('shellscript covers packaging scripts', () => {
    const shell = lang('shellscript');
    for (const name of ['PKGBUILD', 'APKBUILD']) {
      assert.ok(
        (shell.filenames ?? []).includes(name),
        `shellscript filenames misses ${name}`
      );
    }
    for (const pattern of ['*.ebuild', '*.eclass']) {
      assert.ok(
        (shell.filenamePatterns ?? []).includes(pattern),
        `shellscript filenamePatterns misses ${pattern}`
      );
    }
  });

  test('mksh maps to its own language', () => {
    const mksh = lang('mksh');
    assert.ok((mksh.extensions ?? []).includes('.mksh'));
    assert.ok((mksh.filenames ?? []).includes('.mkshrc'));
  });

  test('dash maps to its own language', () => {
    assert.ok((lang('dash').extensions ?? []).includes('.dash'));
  });

  test('new languages activate and take effect by default', () => {
    for (const id of ['mksh', 'dash']) {
      assert.ok(
        activationEvents.includes(`onLanguage:${id}`),
        `missing activation event for ${id}`
      );
      assert.ok(effectDefaults.includes(id), `${id} missing from effectLanguages default`);
    }
  });
});
