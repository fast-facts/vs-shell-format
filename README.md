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

> [!Note]
>
> `Dockerfile` support is **opt-in**. It is registered as a language but excluded from the default `shellformat.effectLanguages`, so it won't format on save unless you enable it.
>
> The upstream tool [`shfmt`](https://github.com/mvdan/sh) does not officially support Dockerfile. However, the common `Dockerfile` syntax (e.g. `RUN` with shell commands) falls within the shell grammar, in this case, `shfmt` can format `Dockerfile`. Because this is not an officially supported path and may mangle complex multiline constructs, it is disabled by default — enable it only if it works for your use case.
>
> To enable, add `dockerfile` to `shellformat.effectLanguages`, or enable `shellformat.useEditorConfig` and add the following to your `.editorconfig`:
>
> ```ini
> [Dockerfile]
> indent_size = 4
> indent_style = space
> binary_next_line = true
> ```
>
> See [#14](https://github.com/fast-facts/vs-shell-format/issues/14) for background.

| language    | extension                                      | description            |
| ----------- | ---------------------------------------------- | ---------------------- |
| shellscript | .sh .bash, bash dotfiles, PKGBUILD, APKBUILD, *.ebuild, *.eclass | shell script files     |
| dockerfile  | Dockerfile, Dockerfile.*, \*.dockerfile        | dockerfile (opt-in)    |
| dotenv      | .env .env.* env                                | dotenv files           |
| ignore      | .gitignore .dockerignore                       | ignore files           |
| properties  | .properties (also spring-boot-properties)      | java properties files  |
| jvmoptions  | .vmoptions , jvm.options                       | jvm options file       |
| hosts       | hosts                                          | hosts file             |
| azcli       | .azcli                                         | Azure CLI script files |
| bats        | .bats                                          | Bats test file         |
| zsh         | .zsh .zshrc .zshenv .zprofile .zlogin .zlogout | zsh script files       |
| mksh        | .mksh .mkshrc                                  | mksh script files      |
| dash        | .dash                                          | dash / posix shell     |

---

![screenshot](https://github.com/fast-facts/vs-shell-format/raw/master/image/shell_format.gif)

## Usage

<kbd>shift</kbd>+<kbd>alt</kbd>+<kbd>f</kbd> (Windows/Linux) or <kbd>shift</kbd>+<kbd>option</kbd>+<kbd>f</kbd> (Mac)

<kbd>ctrl</kbd>+<kbd>shift</kbd>+<kbd>p</kbd> (Windows/Linux) or <kbd>command</kbd>+<kbd>shift</kbd>+<kbd>p</kbd> (Mac), then type `Format Document`

## Dependencies

- [shfmt](https://github.com/mvdan/sh#shfmt) — downloaded automatically on first use (pinned version in `src/config.ts`, checksum-verified). Set `shellformat.path` only to use your own binary instead.

## Custom configuration

- `shellformat.path` the shfmt fullpath example [mac,linux]: `/usr/local/bin/shfmt` [windows]: `C:\bin\shfmt.exe`. User setting only.
- `shellformat.flag` shfmt -h to see detailed usage. User setting only. Ignored when `shellformat.useEditorConfig` is on. Do not use `-w`.
- `shellformat.effectLanguages` the languages the formatter runs on. Default is all supported languages except `dockerfile`. Add `dockerfile` to opt in.
- `shellformat.useEditorConfig` use `.editorconfig` for shfmt flags instead of `shellformat.flag`. Supported keys: `indent_style`, `indent_size`, `shell_variant`, `binary_next_line`, `switch_case_indent`, `space_redirects`, `keep_padding`, `function_next_line`.

---

## Contributors of the original project

### Code Contributors

This project exists thanks to all the people who contribute.
<a href="https://github.com/foxundermoon/vs-shell-format/graphs/contributors"><img src="https://opencollective.com/vsformat/contributors.svg?width=890&button=false" /></a>
