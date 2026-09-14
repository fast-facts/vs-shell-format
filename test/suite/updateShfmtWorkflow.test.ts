import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('update-shfmt workflow', () => {
  test('does not write needCheckInstall into src/config.ts', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'update-shfmt.yml'),
      'utf8'
    );
    assert.ok(
      !workflow.includes('needCheckInstall'),
      'update-shfmt.yml must not emit needCheckInstall into src/config.ts'
    );
  });
});
