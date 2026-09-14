# Shell-like Formatter For VS Code

<a href="https://marketplace.visualstudio.com/items?itemName=vs-shell-format.shell-format-secure" target="__blank"><img src="https://vsmarketplacebadges.dev/version/vs-shell-format.shell-format-secure.svg" alt="Visual Studio Marketplace Version" /></a>
<a href="https://marketplace.visualstudio.com/items?itemName=vs-shell-format.shell-format-secure" target="__blank"><img src="https://vsmarketplacebadges.dev/downloads/vs-shell-format.shell-format-secure.svg" alt="Downloads" /></a>
<a href="https://marketplace.visualstudio.com/items?itemName=vs-shell-format.shell-format-secure" target="__blank"><img src="https://vsmarketplacebadges.dev/installs/vs-shell-format.shell-format-secure.svg" alt="Installs" /></a>
<a href="https://marketplace.visualstudio.com/items?itemName=vs-shell-format.shell-format-secure" target="__blank"><img src="https://vsmarketplacebadges.dev/rating/vs-shell-format.shell-format-secure.svg" alt="Rating" /></a>
<a href="https://github.com/fast-facts/vs-shell-format" target="__blank"><img src="https://github.com/fast-facts/vs-shell-format/actions/workflows/CI.yml/badge.svg" /></a>

> [!Note]
>
> This is a fork of [foxundermoon/vs-shell-format](https://github.com/foxundermoon/vs-shell-format).
>
> Since the original package is no longer maintained, I just try to fork this package, fix this issue and re-publish new package to marketplace.
>
> See <https://github.com/foxundermoon/vs-shell-format/issues/396>.

## Supported file types or languages

| language    | extension                                                        | description            |
| ----------- | ---------------------------------------------------------------- | ---------------------- |
| shellscript | .sh .bash, bash dotfiles, PKGBUILD, APKBUILD, *.ebuild, *.eclass | shell script files     |
| dockerfile  | Dockerfile, Dockerfile.*, \*.dockerfile                          | dockerfile             |
| dotenv      | .env .env.* env                                                  | dotenv files           |
| ignore      | .gitignore .dockerignore                                         | ignore files           |
| properties  | .properties (also spring-boot-properties)                        | java properties files  |
| jvmoptions  | .vmoptions , jvm.options                                         | jvm options file       |
| hosts       | hosts                                                            | hosts file             |
| azcli       | .azcli                                                           | Azure CLI script files |
| bats        | .bats                                                            | Bats test file         |
| zsh         | .zsh .zshrc .zshenv .zprofile .zlogin .zlogout                   | zsh script files       |
| mksh        | .mksh .mkshrc                                                    | mksh script files      |
| dash        | .dash                                                            | dash / posix shell     |

Shell files use [shfmt](https://github.com/mvdan/sh#shfmt). Dockerfiles use [dockerfmt](https://github.com/reteps/dockerfmt).

---

![screenshot](https://github.com/fast-facts/vs-shell-format/raw/master/image/shell_format.gif)

## Usage

<kbd>shift</kbd>+<kbd>alt</kbd>+<kbd>f</kbd> (Windows/Linux) or <kbd>shift</kbd>+<kbd>option</kbd>+<kbd>f</kbd> (Mac)

<kbd>ctrl</kbd>+<kbd>shift</kbd>+<kbd>p</kbd> (Windows/Linux) or <kbd>command</kbd>+<kbd>shift</kbd>+<kbd>p</kbd> (Mac), then type `Format Document`

## shfmt download

On first use, the extension downloads shfmt **v3.14.1** from GitHub releases. The version is pinned in `src/config.ts`. Each download is checked against a SHA-256 checksum.

The binary is stored in the extension folder:

```text
<extension>/bin/shfmt_v3.14.1_<os>_<arch>
```

Examples: `shfmt_v3.14.1_linux_amd64`, `shfmt_v3.14.1_darwin_arm64`, `shfmt_v3.14.1_windows_amd64.exe`.

The extension starts without waiting for that download. The first format waits until the download finishes. If the download fails, set `shellformat.path`.

### Offline or manual install

You can skip the download:

1. Get shfmt **v3.14.1** from [mvdan/sh releases](https://github.com/mvdan/sh/releases).
2. Put the file in the extension `bin/` folder.
3. Use the platform name from `src/config.ts`, for example `shfmt_v3.14.1_linux_amd64`.

Or set `shellformat.path` to a shfmt binary you already have. That setting is user only. A workspace cannot set it.

Checksums are checked for the automatic GitHub download.

## EditorConfig

Set `shellformat.useEditorConfig` to `true` if you want shfmt to read `.editorconfig`. When that setting is on, `shellformat.flag` is ignored. shfmt gets the file path with `--filename` and reads `.editorconfig` itself.

When the setting is off, `shellformat.flag` and the editor tab size apply.

Sample `.editorconfig`:

```ini
[*.sh]
indent_style = space
indent_size = 2
shell_variant = posix
binary_next_line = true
switch_case_indent = true
```

## Settings

- `shellformat.path`: full path to shfmt. User setting only. Example on macOS or Linux: `/usr/local/bin/shfmt`. Example on Windows: `C:\bin\shfmt.exe`.
- `shellformat.flag`: extra shfmt flags, for example `-p -bn -ci`. User setting only. Ignored when `shellformat.useEditorConfig` is on. Do not use `-w`.
- `shellformat.effectLanguages`: languages this formatter runs on. Default is all supported languages.
- `shellformat.useEditorConfig`: when on, shfmt reads `.editorconfig` from the file path.

## Troubleshooting

- The formatter does nothing: check `shellformat.effectLanguages`. Also open the `shellformat` output channel.
- shfmt is missing: format waits for the GitHub download. If that fails, set `shellformat.path`.
- A red squiggle at `line:col`: shfmt found a parse error at that place.

## Privacy

This extension does not send telemetry. The only network call is the shfmt download from GitHub releases.

---

## Contributors of the original project

### Code Contributors

This project exists thanks to all the people who contribute.
<a href="https://github.com/foxundermoon/vs-shell-format/graphs/contributors"><img src="https://opencollective.com/vsformat/contributors.svg?width=890&button=false" /></a>
