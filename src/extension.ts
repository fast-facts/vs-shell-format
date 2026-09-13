import * as vscode from 'vscode';
import {
  ShellDocumentFormattingEditProvider,
  Formatter,
  configurationPrefix,
  ConfigItemName,
  output,
  getSettings,
} from './shFormat';

import { checkInstall } from './downloader';

export enum DocumentFilterScheme {
  File = 'file',
  Untitled = 'untitled',
}

export async function activate(context: vscode.ExtensionContext) {
  const settings = vscode.workspace.getConfiguration(configurationPrefix);
  const shfmter = new Formatter(context);
  const shFmtProvider = new ShellDocumentFormattingEditProvider(shfmter);
  await checkInstall(context, output, getSettings('path'));
  const effectLanguages = settings.get<string[]>(ConfigItemName.EffectLanguages);
  if (effectLanguages) {
    for (const lang of effectLanguages) {
      for (const schemae of Object.values(DocumentFilterScheme)) {
        context.subscriptions.push(
          vscode.languages.registerDocumentFormattingEditProvider(
            { language: lang, scheme: schemae },
            shFmtProvider
          )
        );
      }
    }
  }
}
