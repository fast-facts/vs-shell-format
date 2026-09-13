EAPI=8

DESCRIPTION="sample"
SLOT="0"

src_compile() {
if [ -n "$EAPI" ]; then
emake
  fi
}

src_install() {
emake DESTDIR="${D}" install
}
