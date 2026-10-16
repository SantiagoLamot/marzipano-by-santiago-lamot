#!/bin/bash
# Doble click para abrir la demo en el navegador.
cd "$(dirname "$0")" || exit 1

RUTA="/marzipano-walk/demo/"

# Buscar node en los lugares habituales (nvm, Homebrew).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.homebrew/bin:$PATH"

if command -v node >/dev/null 2>&1; then
  node servidor.js "." "$RUTA"
elif command -v python3 >/dev/null 2>&1; then
  echo ""
  echo "  No se encontró Node; usando Python."
  echo "  Abrí: http://localhost:8080$RUTA"
  echo ""
  echo "  Cerrá esta ventana para detenerlo."
  echo ""
  (sleep 1 && open "http://localhost:8080$RUTA") &
  python3 -m http.server 8080
else
  echo ""
  echo "  No se encontró Node ni Python."
  echo "  Instalá Node desde https://nodejs.org y volvé a hacer doble click."
  echo ""
  read -n 1 -s -r -p "  Presioná una tecla para cerrar..."
  echo ""
fi
