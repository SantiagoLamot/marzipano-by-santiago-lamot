#!/bin/bash
# Compila el motor y actualiza todo lo que depende de él:
#   - marzipano-walk/dist/marzipano.js        (build del fork)
#   - marzipano-walk/demo/vendor/marzipano.js
#   - kit-para-tours/marzipano.js
#   - kit-para-tours/lanzadores/*             (copias de los lanzadores que abren "/")
#
# Uso:  bash scripts/actualizar-kit.sh [--sin-build]
set -e
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

if [ "$1" != "--sin-build" ]; then
  echo "· Compilando el motor…"
  (cd marzipano-walk && { [ -d node_modules ] || npm install; } && bash scripts/build)
fi

echo "· Copiando marzipano.js…"
cp marzipano-walk/dist/marzipano.js marzipano-walk/demo/vendor/marzipano.js
cp marzipano-walk/dist/marzipano.js kit-para-tours/marzipano.js

echo "· Regenerando los lanzadores de tours…"
L=kit-para-tours/lanzadores
mkdir -p "$L"
sed -e "s#ARGS\[1\] || '/marzipano-walk/demo/'#ARGS[1] || '/'#" servidor.js > "$L/servidor.js"
perl -pe "s#\[string\]\\\$Ruta = '/marzipano-walk/demo/'#[string]\\\$Ruta = '/'#" servidor.ps1 > "$L/servidor.ps1"
sed -e 's#^RUTA="/marzipano-walk/demo/"#RUTA="/"#' -e 's#abrir la demo#abrir el tour#' \
  "Abrir demo (Mac).command" > "$L/Abrir tour (Mac).command"
perl -pe 's#"/marzipano-walk/demo/"#"/"#; s#abrir la demo#abrir el tour#' \
  "Abrir demo (Windows).bat" > "$L/Abrir tour (Windows).bat"
chmod +x "$L/Abrir tour (Mac).command"

# Verificación: las copias tienen que abrir "/".
grep -q "ARGS\[1\] || '/';" "$L/servidor.js"
grep -q "\$Ruta = '/'," "$L/servidor.ps1"
grep -q '^RUTA="/"' "$L/Abrir tour (Mac).command"
grep -q 'node servidor.js "." "/"' "$L/Abrir tour (Windows).bat"
echo "Listo. Los tours nuevos usan el motor actualizado; para un tour existente,"
echo "copiá kit-para-tours/marzipano.js a tours/<tour>/vendor/marzipano.js."
