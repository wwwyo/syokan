#!/bin/sh
# syokan installer — macOS / Linux, no sudo, no runtime to install (single binary).
#
#   curl -fsSL https://raw.githubusercontent.com/wwwyo/syokan/main/install.sh | sh
#
# Pin a version:      curl -fsSL .../install.sh | sh -s -- v0.2.0
# Change install dir: SYOKAN_INSTALL_DIR=~/bin curl -fsSL .../install.sh | sh
#
# What it does, and nothing else: detect OS/arch, download the matching binary from GitHub
# Releases, verify it against the release's published checksums.txt, place it as
# $SYOKAN_INSTALL_DIR/syokan (default ~/.local/bin). Unsupported platforms exit with an error.
set -eu

REPO="wwwyo/syokan"
INSTALL_DIR="${SYOKAN_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${1:-${SYOKAN_VERSION:-latest}}"

err() {
  printf 'syokan-install: error: %s\n' "$1" >&2
  exit 1
}

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) err "unsupported OS: $(uname -s). syokan supports macOS and Linux (Windows is not supported)." ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) err "unsupported architecture: $(uname -m). syokan ships arm64 and x86_64 binaries." ;;
esac

# Accept both "0.2.0" and "v0.2.0" — release tags are v-prefixed.
case "$VERSION" in
  latest | v*) ;;
  *) VERSION="v${VERSION}" ;;
esac

asset="syokan-${os}-${arch}"
if [ "$VERSION" = "latest" ]; then
  base_url="https://github.com/${REPO}/releases/latest/download"
else
  base_url="https://github.com/${REPO}/releases/download/${VERSION}"
fi

command -v curl >/dev/null 2>&1 || err "curl is required"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

printf 'syokan-install: downloading %s (%s)...\n' "$asset" "$VERSION"
curl -fsSL -o "${tmp}/${asset}" "${base_url}/${asset}" ||
  err "download failed: ${base_url}/${asset} (does release ${VERSION} exist?)"
curl -fsSL -o "${tmp}/checksums.txt" "${base_url}/checksums.txt" ||
  err "checksums.txt is missing for ${VERSION}; refusing to install unverified binaries (older releases may predate it — pass a newer version)"

expected="$(awk -v a="$asset" '$2 == a { print $1 }' "${tmp}/checksums.txt")"
[ -n "$expected" ] || err "no checksum entry for ${asset} in checksums.txt"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "${tmp}/${asset}" | awk '{ print $1 }')"
else
  actual="$(shasum -a 256 "${tmp}/${asset}" | awk '{ print $1 }')"
fi
[ "$actual" = "$expected" ] || err "checksum mismatch for ${asset} (expected ${expected}, got ${actual}); aborting"

mkdir -p "$INSTALL_DIR"
# Stage in the destination dir, then rename: mv within one filesystem is atomic, so an
# interrupted install never leaves a half-written binary at the final path.
install -m 755 "${tmp}/${asset}" "${INSTALL_DIR}/.syokan.tmp.$$"
mv -f "${INSTALL_DIR}/.syokan.tmp.$$" "${INSTALL_DIR}/syokan"

installed_version="$("${INSTALL_DIR}/syokan" --version)" ||
  err "installed binary failed to run (${INSTALL_DIR}/syokan)"
printf 'syokan-install: installed syokan %s to %s/syokan\n' "$installed_version" "$INSTALL_DIR"

case ":$PATH:" in
  *":$INSTALL_DIR:"*)
    printf 'syokan-install: done. try: syokan --help\n'
    ;;
  *)
    printf 'syokan-install: NOTE: %s is not on your PATH. add it, e.g.:\n' "$INSTALL_DIR"
    # $PATH must stay literal in the instruction we print
    # shellcheck disable=SC2016
    printf '  export PATH="%s:$PATH"\n' "$INSTALL_DIR"
    printf 'then try: syokan --help\n'
    ;;
esac
