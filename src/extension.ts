import * as vscode from 'vscode';
import {
  ConfigItemName,
  configurationPrefix,
  Formatter,
  getSettings,
  output,
  ShellDocumentFormattingEditProvider,
} from './shFormat';

import { checkInstall, trackInstall } from './downloader';

export enum DocumentFilterScheme {
  File = 'file',
  Untitled = 'untitled',
}

export async function activate(
  context: vscode.ExtensionContext,
  deps: { checkInstall: typeof checkInstall } = { checkInstall }
) {
  const shFmtProvider = new ShellDocumentFormattingEditProvider(new Formatter(context));
  registerFormattingProviders(shFmtProvider);
  context.subscriptions.push(
    new vscode.Disposable(disposeActiveProviders),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(`${configurationPrefix}.${ConfigItemName.EffectLanguages}`)) {
        registerFormattingProviders(shFmtProvider);
      }
    })
  );
  void trackInstall(
    deps.checkInstall(context, output, getSettings('path'), { checked: false })
  ).catch((err: unknown) => {
    output.appendLine(err instanceof Error ? err.message : String(err));
  });
}

let activeProviderDisposables: vscode.Disposable[] = [];

function disposeActiveProviders() {
  for (const disposable of activeProviderDisposables) {
    disposable.dispose();
  }
  activeProviderDisposables = [];
}

function registerFormattingProviders(provider: ShellDocumentFormattingEditProvider) {
  disposeActiveProviders();
  for (const lang of vscode.workspace.getConfiguration(configurationPrefix).get<string[]>(ConfigItemName.EffectLanguages) ?? []) {
    for (const schemae of Object.values(DocumentFilterScheme)) {
      activeProviderDisposables.push(
        vscode.languages.registerDocumentFormattingEditProvider(
          { language: lang, scheme: schemae },
          provider
        )
      );
    }
  }
}
