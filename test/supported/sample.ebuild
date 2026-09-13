EAPI=8

DESCRIPTION="sample"
SLOT="0"

src_compile() {
if [ -n  "$EAPI" ]
then
emake   -j"$(nproc)"
fi
}

src_install() {
if [ -n "${D}" ];then emake DESTDIR="${D}"  install|
cat
fi
}
