#!/bin/bash
# Doble click para abrir el editor de tours en el navegador.
cd "$(dirname "$0")" || exit 1

# Buscar node en los lugares habituales (nvm, Homebrew).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.homebrew/bin:$PATH"

if command -v node >/dev/null 2>&1; then
  node servidor.js "." "/editor/" --editor
else
  echo ""
  echo "  El editor de tours necesita Node para poder guardar."
  echo "  Instalá Node desde https://nodejs.org y volvé a hacer doble click."
  echo ""
  read -n 1 -s -r -p "  Presioná una tecla para cerrar..."
  echo ""
fi
