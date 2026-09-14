import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'vs-shell-format.shell-format-secure';

// Built-in VS Code languages this extension formats. VS Code does not
// implicitly activate extensions for built-in languages, so each one needs
// an explicit onLanguage activation event. Without it the formatter never
// registers and formatting shows "There is no formatter installed".
const BUILTIN_FORMATTED_LANGUAGES = [
  'shellscript',
  'dotenv',
  'dockerfile',
  'ignore',
  'properties',
] as const;

// Entries in shellformat.effectLanguages that are language aliases, not real
// language ids. Registering a provider for them is a harmless no-op.
const KNOWN_ALIASES = ['spring-boot-properties'];

function readManifest(root: string) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
}

suite('Activation events contract', function () {
  this.timeout(20000);
  let root = '';

  suiteSetup(() => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} is not present`);
    root = ext.extensionPath;
  });

  test('registers onLanguage activation for every built-in formatted language', () => {
    const activationEvents: string[] = readManifest(root).activationEvents ?? [];
    for (const lang of BUILTIN_FORMATTED_LANGUAGES) {
      assert.ok(
        activationEvents.includes(`onLanguage:${lang}`),
        `missing "onLanguage:${lang}" activation event: formatter never registers for ${lang} files`
      );
    }
  });

  test('every onLanguage event maps to an effect language', () => {
    const manifest = readManifest(root);
    const activationEvents: string[] = manifest.activationEvents ?? [];
    const effectLanguages: string[] =
      manifest.contributes.configuration.properties['shellformat.effectLanguages'].default;
    for (const event of activationEvents) {
      const match = /^onLanguage:(.+)$/.exec(event);
      if (!match) {
        continue;
      }
      assert.ok(
        effectLanguages.includes(match[1]),
        `stale activation event "${event}": not in shellformat.effectLanguages`
      );
    }
  });

  test('every effect language has activation coverage', () => {
    const manifest = readManifest(root);
    const activationEvents: string[] = manifest.activationEvents ?? [];
    const effectLanguages: string[] =
      manifest.contributes.configuration.properties['shellformat.effectLanguages'].default;
    for (const lang of effectLanguages) {
      if (KNOWN_ALIASES.includes(lang)) {
        continue;
      }
      assert.ok(
        activationEvents.includes(`onLanguage:${lang}`),
        `missing "onLanguage:${lang}" activation event`
      );
    }
  });
});
