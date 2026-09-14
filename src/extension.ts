import * as vscode from 'vscode';
import {
  ConfigItemName,
  configurationPrefix,
  Formatter,
  getSettings,
  output,
  ShellDocumentFormattingEditProvider,
} from './shFormat';

import { checkInstall } from './downloader';

export enum DocumentFilterScheme {
  File = 'file',
  Untitled = 'untitled',
}

export async function activate(
  context: vscode.ExtensionContext,
  deps: { checkInstall: typeof checkInstall } = { checkInstall }
) {
  const shfmter = new Formatter(context);
  const shFmtProvider = new ShellDocumentFormattingEditProvider(shfmter);
  registerFormattingProviders(context, shFmtProvider);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${configurationPrefix}.${ConfigItemName.EffectLanguages}`)) {
        registerFormattingProviders(context, shFmtProvider);
      }
    })
  );
  await deps.checkInstall(context, output, getSettings('path'));
}

let activeProviderDisposables: vscode.Disposable[] = [];

export function registerFormattingProviders(
  context: vscode.ExtensionContext,
  provider: ShellDocumentFormattingEditProvider,
  registrar: (
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentFormattingEditProvider
  ) => vscode.Disposable = (selector, editProvider) =>
    vscode.languages.registerDocumentFormattingEditProvider(selector, editProvider)
) {
  for (const disposable of activeProviderDisposables) {
    disposable.dispose();
  }
  activeProviderDisposables = [];
  const settings = vscode.workspace.getConfiguration(configurationPrefix);
  const effectLanguages = settings.get<string[]>(ConfigItemName.EffectLanguages);
  if (!effectLanguages) {
    return;
  }
  for (const lang of effectLanguages) {
    for (const schemae of Object.values(DocumentFilterScheme)) {
      const disposable = registrar({ language: lang, scheme: schemae }, provider);
      activeProviderDisposables.push(disposable);
      context.subscriptions.push(disposable);
    }
  }
}
