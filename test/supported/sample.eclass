# @ECLASS: sample
# @MAINTAINER: sample@example.com

sample_src_compile() {
if [ -n  "$EAPI" ]
then
emake   -j"$(nproc)"
fi
}

sample_src_install() {
if [ -n "${D}" ];then emake DESTDIR="${D}"  install|
cat
fi
}
