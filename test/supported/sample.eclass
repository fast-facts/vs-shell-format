# @ECLASS: sample
# @MAINTAINER: sample@example.com

sample_src_compile() {
if [ -n "$EAPI" ]; then
emake
  fi
}

sample_src_install() {
emake DESTDIR="${D}" install
}
