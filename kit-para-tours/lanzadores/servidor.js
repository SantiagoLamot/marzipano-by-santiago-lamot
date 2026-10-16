#!/usr/bin/env node
// Servidor local mínimo para ver los tours (Node puro, sin dependencias).
// Uso:  node servidor.js [carpeta-raiz] [ruta-a-abrir] [--editor]
//   --editor  habilita la API que usa el editor de tours para guardar archivos
//             (solo desde esta computadora y solo dentro de la carpeta tours/).
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

var ARGS = process.argv.slice(2).filter(function(a) { return a.indexOf('--') !== 0; });
var EDITOR = process.argv.indexOf('--editor') !== -1;
var RAIZ = path.resolve(ARGS[0] || __dirname);
var RUTA_INICIAL = ARGS[1] || '/';
var TOURS = path.join(RAIZ, 'tours');
var MAXIMO_SUBIDA = 300 * 1024 * 1024;
var PUERTO_INICIAL = 8080;
var PUERTO_MAXIMO = 8100;

var TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

function responder(res, codigo, texto) {
  res.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(texto);
}

function enviarArchivo(req, res, archivo, stat) {
  var tipo = TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': tipo,
    'Content-Length': stat.size,
    'Cache-Control': 'no-store'
  });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(archivo).on('error', function() { res.destroy(); }).pipe(res);
}

// Ruta absoluta dentro de RAIZ (o de TOURS si soloTours), o null si se escapa.
function rutaSegura(relativa, soloTours) {
  if (typeof relativa !== 'string' || relativa.indexOf('\0') !== -1) return null;
  var base = soloTours ? TOURS : RAIZ;
  var absoluta = path.resolve(RAIZ, '.' + path.sep + relativa);
  if (soloTours) return absoluta.indexOf(base + path.sep) === 0 ? absoluta : null;
  return absoluta === base || absoluta.indexOf(base + path.sep) === 0 ? absoluta : null;
}

function responderJson(res, codigo, objeto) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(objeto));
}

function esLocal(req) {
  var ip = req.socket.remoteAddress;
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') return false;
  // Evita que otra página web (o un DNS falso) use la API.
  var host = String(req.headers.host || '').replace(/:\d+$/, '');
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') return false;
  var origen = req.headers.origin;
  return !origen || origen === 'http://' + req.headers.host;
}

// API del editor:
//   GET    /api/listar?ruta=R   -> [{nombre, carpeta}] del contenido de R
//   PUT    /api/archivo?ruta=R  -> guarda el cuerpo en R (solo dentro de tours/)
//   DELETE /api/archivo?ruta=R  -> borra R, archivo o carpeta (solo dentro de tours/)
function manejarApi(req, res, url) {
  if (!esLocal(req)) return responderJson(res, 403, { error: 'Solo desde esta computadora' });
  var params = new URLSearchParams(req.url.slice(url.length).replace(/^\?/, ''));
  var ruta = params.get('ruta') || '';

  if (url === '/api/listar' && req.method === 'GET') {
    var carpeta = rutaSegura(ruta, false);
    if (!carpeta) return responderJson(res, 403, { error: 'Ruta invalida' });
    return fs.readdir(carpeta, { withFileTypes: true }, function(err, entradas) {
      if (err) return responderJson(res, 200, []);
      responderJson(res, 200, entradas
        .filter(function(e) { return e.name.charAt(0) !== '.'; })
        .map(function(e) { return { nombre: e.name, carpeta: e.isDirectory() }; }));
    });
  }

  if (url === '/api/archivo' && req.method === 'PUT') {
    var destino = rutaSegura(ruta, true);
    if (!destino) return responderJson(res, 403, { error: 'Solo se puede guardar dentro de tours/' });
    var partes = [], total = 0, cortado = false;
    req.on('data', function(parte) {
      total += parte.length;
      if (total > MAXIMO_SUBIDA) {
        cortado = true;
        responderJson(res, 413, { error: 'Archivo demasiado grande' });
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', function() {
      if (cortado) return;
      fs.mkdir(path.dirname(destino), { recursive: true }, function(err) {
        if (err) return responderJson(res, 500, { error: err.message });
        var temporal = destino + '.subiendo';
        fs.writeFile(temporal, Buffer.concat(partes), function(err2) {
          if (err2) return responderJson(res, 500, { error: err2.message });
          fs.rename(temporal, destino, function(err3) {
            if (err3) return responderJson(res, 500, { error: err3.message });
            if (/\.command$/.test(destino)) fs.chmodSync(destino, 493); // 0755
            responderJson(res, 200, { ok: true });
          });
        });
      });
    });
    return;
  }

  if (url === '/api/archivo' && req.method === 'DELETE') {
    var borrar = rutaSegura(ruta, true);
    if (!borrar) return responderJson(res, 403, { error: 'Solo se puede borrar dentro de tours/' });
    return fs.rm(borrar, { recursive: true, force: true }, function(err) {
      if (err) return responderJson(res, 500, { error: err.message });
      responderJson(res, 200, { ok: true });
    });
  }

  responderJson(res, 404, { error: 'No existe' });
}

function manejar(req, res) {
  if (EDITOR && req.url.indexOf('/api/') === 0) {
    return manejarApi(req, res, req.url.split('?')[0]);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return responder(res, 405, 'Metodo no permitido');
  }

  var url = req.url.split('?')[0].split('#')[0];
  var rutaUrl;
  try {
    rutaUrl = decodeURIComponent(url);
  } catch (e) {
    return responder(res, 400, 'Ruta invalida');
  }
  if (rutaUrl.indexOf('\0') !== -1) {
    return responder(res, 400, 'Ruta invalida');
  }

  var archivo = path.resolve(RAIZ, '.' + path.sep + rutaUrl);
  if (archivo !== RAIZ && archivo.indexOf(RAIZ + path.sep) !== 0) {
    return responder(res, 403, 'Prohibido');
  }

  fs.stat(archivo, function(err, stat) {
    if (err) return responder(res, 404, 'No encontrado: ' + rutaUrl);

    if (stat.isDirectory()) {
      if (!url.endsWith('/')) {
        var query = req.url.slice(url.length);
        res.writeHead(301, { 'Location': url + '/' + query, 'Cache-Control': 'no-store' });
        return res.end();
      }
      var indice = path.join(archivo, 'index.html');
      return fs.stat(indice, function(err2, stat2) {
        if (err2 || !stat2.isFile()) return responder(res, 404, 'No hay index.html en ' + rutaUrl);
        enviarArchivo(req, res, indice, stat2);
      });
    }

    enviarArchivo(req, res, archivo, stat);
  });
}

function abrirNavegador(url) {
  var comando, args;
  if (process.platform === 'darwin') {
    comando = 'open'; args = [url];
  } else if (process.platform === 'win32') {
    comando = 'cmd'; args = ['/c', 'start', '', url];
  } else {
    comando = 'xdg-open'; args = [url];
  }
  try {
    var hijo = childProcess.spawn(comando, args, { stdio: 'ignore', detached: true });
    hijo.on('error', function() {
      console.log('No se pudo abrir el navegador. Abrí esta dirección a mano: ' + url);
    });
    hijo.unref();
  } catch (e) {
    console.log('No se pudo abrir el navegador. Abrí esta dirección a mano: ' + url);
  }
}

function iniciar(puerto) {
  var servidor = http.createServer(manejar);
  servidor.once('error', function(err) {
    if (err.code === 'EADDRINUSE' && puerto < PUERTO_MAXIMO) {
      iniciar(puerto + 1);
    } else if (err.code === 'EADDRINUSE') {
      console.error('No hay puertos libres entre ' + PUERTO_INICIAL + ' y ' + PUERTO_MAXIMO + '.');
      process.exit(1);
    } else {
      console.error('Error al iniciar el servidor: ' + err.message);
      process.exit(1);
    }
  });
  servidor.listen(puerto, function() {
    var ruta = RUTA_INICIAL.charAt(0) === '/' ? RUTA_INICIAL : '/' + RUTA_INICIAL;
    var url = 'http://localhost:' + puerto + ruta;
    console.log('');
    console.log('  Sirviendo: ' + RAIZ);
    console.log('  Abrí:      ' + url);
    console.log('');
    console.log('  Cerrá esta ventana para detenerlo.');
    console.log('');
    abrirNavegador(url);
  });
}

iniciar(PUERTO_INICIAL);
