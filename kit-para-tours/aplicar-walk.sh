#!/bin/bash
# Aplica la versión "caminar" a un export del Marzipano Tool.
# Uso:  ./aplicar-walk.sh /ruta/al/export-descomprimido
set -e
KIT="$(cd "$(dirname "$0")" && pwd)"
DEST="$1"
[ -f "$DEST/data.js" ] && [ -f "$DEST/index.html" ] || { echo "No parece un export del Marzipano Tool: $DEST"; exit 1; }
cp "$KIT/marzipano.js" "$DEST/vendor/marzipano.js"
cp "$KIT/index.js"     "$DEST/index.js"
cp "$KIT/walk.css"     "$DEST/walk.css"
grep -q 'walk.css' "$DEST/index.html" || \
  perl -0pi -e 's#(<link rel="stylesheet" href="style.css">)#$1\n<link rel="stylesheet" href="walk.css">#' "$DEST/index.html"
rm -f "$DEST/index.html.bak"
# Lanzadores de doble click (abren el tour en un servidor local).
cp "$KIT/lanzadores/servidor.js"                "$DEST/servidor.js"
cp "$KIT/lanzadores/servidor.ps1"               "$DEST/servidor.ps1"
cp "$KIT/lanzadores/Abrir tour (Mac).command"   "$DEST/Abrir tour (Mac).command"
cp "$KIT/lanzadores/Abrir tour (Windows).bat"   "$DEST/Abrir tour (Windows).bat"
chmod +x "$DEST/Abrir tour (Mac).command"
xattr -d com.apple.quarantine "$DEST/Abrir tour (Mac).command" 2>/dev/null || true
echo "Listo: $DEST ahora usa la transición caminar."
echo "Para verlo: doble click en \"Abrir tour (Mac).command\" o \"Abrir tour (Windows).bat\"."
