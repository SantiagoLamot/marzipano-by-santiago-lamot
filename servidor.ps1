# Servidor local minimo para ver los tours, sin instalar nada.
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File servidor.ps1 [-Ruta /algo/] [-Editor]
#   -Editor  habilita la API que usa el editor de tours para guardar archivos
#            (solo dentro de la carpeta tours).

param(
  [string]$Ruta = '/marzipano-walk/demo/',
  [switch]$Editor
)

$Raiz = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')

$Tipos = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.svg'  = 'image/svg+xml'
  '.webp' = 'image/webp'
  '.mp4'  = 'video/mp4'
  '.ico'  = 'image/x-icon'
}

function Enviar-Texto($res, [int]$codigo, [string]$texto) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($texto)
  $res.StatusCode = $codigo
  $res.ContentType = 'text/plain; charset=utf-8'
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Enviar-Archivo($req, $res, [string]$archivo) {
  $ext = [System.IO.Path]::GetExtension($archivo).ToLower()
  $tipo = $Tipos[$ext]
  if (-not $tipo) { $tipo = 'application/octet-stream' }
  $res.StatusCode = 200
  $res.ContentType = $tipo
  $fs = [System.IO.File]::OpenRead($archivo)
  try {
    $res.ContentLength64 = $fs.Length
    if ($req.HttpMethod -ne 'HEAD') { $fs.CopyTo($res.OutputStream) }
  } finally {
    $fs.Close()
  }
}

function Enviar-Json($res, [int]$codigo, [string]$json) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $res.StatusCode = $codigo
  $res.ContentType = 'application/json; charset=utf-8'
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Json-Texto([string]$t) {
  return '"' + $t.Replace('\', '\\').Replace('"', '\"') + '"'
}

# Ruta absoluta dentro de la raiz (o de tours si $soloTours), o $null si se escapa.
function Ruta-Segura([string]$relativa, [bool]$soloTours) {
  if (-not $relativa -or $relativa.Contains([char]0)) { return $null }
  $abs = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Raiz, $relativa.TrimStart('/').Replace('/', '\')))
  $cmp = [System.StringComparison]::OrdinalIgnoreCase
  if ($soloTours) {
    if ($abs.StartsWith($Raiz + '\tours\', $cmp)) { return $abs }
    return $null
  }
  if (($abs.TrimEnd('\') -eq $Raiz) -or $abs.StartsWith($Raiz + '\', $cmp)) { return $abs }
  return $null
}

# API del editor (ver servidor.js): listar, guardar y borrar archivos.
function Manejar-Api($req, $res, [string]$camino) {
  $origen = $req.Headers['Origin']
  if ($origen -and $origen -ne ('http://' + $req.Headers['Host'])) {
    Enviar-Json $res 403 '{"error":"Solo desde esta computadora"}'
    return
  }
  $ruta = $req.QueryString['ruta']

  if ($camino -eq '/api/listar' -and $req.HttpMethod -eq 'GET') {
    $carpeta = Ruta-Segura $ruta $false
    if (-not $carpeta) { Enviar-Json $res 403 '{"error":"Ruta invalida"}'; return }
    $items = @()
    if ([System.IO.Directory]::Exists($carpeta)) {
      foreach ($d in [System.IO.Directory]::GetDirectories($carpeta)) {
        $n = [System.IO.Path]::GetFileName($d)
        if (-not $n.StartsWith('.')) { $items += '{"nombre":' + (Json-Texto $n) + ',"carpeta":true}' }
      }
      foreach ($f in [System.IO.Directory]::GetFiles($carpeta)) {
        $n = [System.IO.Path]::GetFileName($f)
        if (-not $n.StartsWith('.')) { $items += '{"nombre":' + (Json-Texto $n) + ',"carpeta":false}' }
      }
    }
    Enviar-Json $res 200 ('[' + ($items -join ',') + ']')
    return
  }

  if ($camino -eq '/api/archivo' -and $req.HttpMethod -eq 'PUT') {
    $destino = Ruta-Segura $ruta $true
    if (-not $destino) { Enviar-Json $res 403 '{"error":"Solo se puede guardar dentro de tours"}'; return }
    [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($destino))
    $temporal = $destino + '.subiendo'
    $fs = [System.IO.File]::Create($temporal)
    try { $req.InputStream.CopyTo($fs) } finally { $fs.Close() }
    if ([System.IO.File]::Exists($destino)) { [System.IO.File]::Delete($destino) }
    [System.IO.File]::Move($temporal, $destino)
    Enviar-Json $res 200 '{"ok":true}'
    return
  }

  if ($camino -eq '/api/archivo' -and $req.HttpMethod -eq 'DELETE') {
    $borrar = Ruta-Segura $ruta $true
    if (-not $borrar) { Enviar-Json $res 403 '{"error":"Solo se puede borrar dentro de tours"}'; return }
    if (Test-Path -LiteralPath $borrar) { Remove-Item -LiteralPath $borrar -Recurse -Force }
    Enviar-Json $res 200 '{"ok":true}'
    return
  }

  Enviar-Json $res 404 '{"error":"No existe"}'
}

# Buscar un puerto libre entre 8080 y 8100.
$listener = $null
$puerto = 0
for ($p = 8080; $p -le 8100; $p++) {
  $intento = New-Object System.Net.HttpListener
  $intento.Prefixes.Add("http://localhost:$p/")
  try {
    $intento.Start()
    $listener = $intento
    $puerto = $p
    break
  } catch {
    $intento.Close()
  }
}
if (-not $listener) {
  Write-Host 'No hay puertos libres entre 8080 y 8100.'
  exit 1
}

$url = "http://localhost:$puerto$Ruta"
Write-Host ''
Write-Host "  Sirviendo: $Raiz"
Write-Host "  Abri:      $url"
Write-Host ''
Write-Host '  Cerra esta ventana para detenerlo.'
Write-Host ''
Start-Process $url

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $res.Headers.Add('Cache-Control', 'no-store')
    $camino = $req.Url.AbsolutePath
    $rutaUrl = [System.Uri]::UnescapeDataString($camino)

    if ($Editor -and $camino.StartsWith('/api/')) {
      Manejar-Api $req $res $camino
    } elseif ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') {
      Enviar-Texto $res 405 'Metodo no permitido'
    } elseif ($rutaUrl.Contains([char]0)) {
      Enviar-Texto $res 400 'Ruta invalida'
    } else {
      $relativa = $rutaUrl.TrimStart('/').Replace('/', '\')
      $archivo = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Raiz, $relativa))
      $dentro = ($archivo.TrimEnd('\') -eq $Raiz) -or $archivo.StartsWith($Raiz + '\', [System.StringComparison]::OrdinalIgnoreCase)

      if (-not $dentro) {
        Enviar-Texto $res 403 'Prohibido'
      } elseif ([System.IO.Directory]::Exists($archivo)) {
        if (-not $camino.EndsWith('/')) {
          $res.StatusCode = 301
          $res.RedirectLocation = $camino + '/' + $req.Url.Query
        } else {
          $indice = [System.IO.Path]::Combine($archivo, 'index.html')
          if ([System.IO.File]::Exists($indice)) {
            Enviar-Archivo $req $res $indice
          } else {
            Enviar-Texto $res 404 "No hay index.html en $rutaUrl"
          }
        }
      } elseif ([System.IO.File]::Exists($archivo)) {
        Enviar-Archivo $req $res $archivo
      } else {
        Enviar-Texto $res 404 "No encontrado: $rutaUrl"
      }
    }
  } catch {
    Write-Host ('  Error: ' + $_.Exception.Message)
    try { Enviar-Texto $res 500 'Error interno' } catch {}
  } finally {
    try { $res.Close() } catch {}
  }
}
