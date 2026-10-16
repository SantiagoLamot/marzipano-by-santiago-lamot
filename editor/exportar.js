/*
 * Exporta un tour del editor en el mismo formato de ZIP que el Marzipano Tool:
 *
 *   app-files/index.html, data.js, index.js, style.css
 *   app-files/img/*.png
 *   app-files/vendor/marzipano.js, screenfull.min.js, bowser.min.js, reset.min.css
 *   app-files/tiles/<id>/preview.jpg               (6 caras de 256px, orden b d f l r u)
 *   app-files/tiles/<id>/<nivel>/<cara>/<fila>/<col>.jpg   (pedazos de 512px)
 *   README.txt, LICENSE.txt
 *
 * Las fotos equirectangulares se convierten a cubo en el navegador, con la misma
 * orientación de caras que usa Marzipano (src/geometries/Cube.js).
 */
'use strict';

(function() {

  var TAM_PEDAZO = 512;
  var TAM_PREVIEW = 256;
  // Calidad JPEG real de los pedazos (escala estándar 1-100). El Tool usa 85;
  // 82 se ve igual y pesa menos. Cada navegador interpreta distinto el valor
  // de toBlob (en Safari 0.85 da ~95), así que se calibra antes de exportar.
  var CALIDAD_OBJETIVO = 82;
  var CARAS = 'fudlrb';            // orden de Marzipano para los niveles
  var CARAS_PREVIEW = 'bdflru';    // orden dentro de preview.jpg
  var ROTACION = {                 // rotación (x, y) de cada cara, como Cube.js
    f: [0, 0],
    b: [0, Math.PI],
    l: [0, Math.PI / 2],
    r: [0, -Math.PI / 2],
    u: [Math.PI / 2, 0],
    d: [-Math.PI / 2, 0]
  };

  // ---------------------------------------------------------------------------
  // ZIP sin compresión (igual que el del Tool: las fotos ya vienen comprimidas)
  // ---------------------------------------------------------------------------
  var TABLA_CRC = (function() {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function Zip() {
    var ahora = new Date();
    this.hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
    this.dia = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    this.partes = [];
    this.central = [];
    this.tamCentral = 0;
    this.offset = 0;
    this.cantidad = 0;
    this.carpetas = {};
  }

  Zip.prototype._entrada = function(nombre, datos, esCarpeta) {
    var nombreBytes = new TextEncoder().encode(nombre);
    var crc = crc32(datos);

    var local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 10, true);             // versión necesaria
    local.setUint16(6, 0x0800, true);         // nombres en UTF-8
    local.setUint16(8, 0, true);              // sin compresión
    local.setUint16(10, this.hora, true);
    local.setUint16(12, this.dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombreBytes.length, true);
    local.setUint16(28, 0, true);
    this.partes.push(local.buffer, nombreBytes, datos);

    var central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 0x0314, true);       // hecho en Unix
    central.setUint16(6, 10, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, this.hora, true);
    central.setUint16(14, this.dia, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, datos.length, true);
    central.setUint32(24, datos.length, true);
    central.setUint16(28, nombreBytes.length, true);
    central.setUint32(38, esCarpeta ? ((0x41ED << 16) | 0x10) >>> 0 : (0x81A4 << 16) >>> 0, true);
    central.setUint32(42, this.offset, true);
    this.central.push(central.buffer, nombreBytes);
    this.tamCentral += 46 + nombreBytes.length;

    this.offset += 30 + nombreBytes.length + datos.length;
    this.cantidad++;
  };

  // El Tool no guarda entradas de carpeta para estas dos.
  var CARPETAS_SIN_ENTRADA = { 'app-files/img/': true, 'app-files/vendor/': true };

  // Agrega un archivo (y las carpetas que lo contienen, como hace el Tool).
  Zip.prototype.agregar = function(ruta, datos) {
    var partes = ruta.split('/');
    for (var i = 1; i < partes.length; i++) {
      var carpeta = partes.slice(0, i).join('/') + '/';
      if (!this.carpetas[carpeta] && !CARPETAS_SIN_ENTRADA[carpeta]) {
        this.carpetas[carpeta] = true;
        this._entrada(carpeta, new Uint8Array(0), true);
      }
    }
    if (typeof datos === 'string') datos = new TextEncoder().encode(datos);
    else if (datos instanceof ArrayBuffer) datos = new Uint8Array(datos);
    this._entrada(ruta, datos, false);
  };

  Zip.prototype.blob = function() {
    var fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, this.cantidad, true);
    fin.setUint16(10, this.cantidad, true);
    fin.setUint32(12, this.tamCentral, true);
    fin.setUint32(16, this.offset, true);
    return new Blob(this.partes.concat(this.central, [fin.buffer]), { type: 'application/zip' });
  };

  // ---------------------------------------------------------------------------
  // Equirectangular -> cubo
  // ---------------------------------------------------------------------------
  function pausa() { return new Promise(function(ok) { setTimeout(ok, 0); }); }

  function lienzo(ancho, alto) {
    var c = document.createElement('canvas');
    c.width = ancho;
    c.height = alto || ancho;
    return c;
  }

  var parametroCalidad = null;   // valor para toBlob que da CALIDAD_OBJETIVO en este navegador

  function aJpg(canvas, parametro) {
    return new Promise(function(ok, mal) {
      canvas.toBlob(function(b) {
        if (!b) return mal(new Error('No se pudo generar una imagen del cubo.'));
        b.arrayBuffer().then(ok, mal);
      }, 'image/jpeg', parametro || parametroCalidad);
    });
  }

  // Calidad estándar (1-100) de un JPEG, estimada de su tabla de luminancia.
  var ZIGZAG = [0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,
    35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63];
  var TABLA_ESTANDAR = [16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,
    14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,
    49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99];

  function calidadReal(buffer) {
    var u = new Uint8Array(buffer), i = 2;
    while (i + 4 < u.length && u[i] === 0xFF) {
      var marca = u[i + 1], largo = (u[i + 2] << 8) | u[i + 3];
      if (marca === 0xDB && (u[i + 4] & 0xF0) === 0 && (u[i + 4] & 0x0F) === 0) {
        var escala = 0;
        for (var k = 0; k < 64; k++) escala += u[i + 5 + k] * 100 / TABLA_ESTANDAR[ZIGZAG[k]];
        escala /= 64;
        return escala <= 100 ? (200 - escala) / 2 : 5000 / escala;
      }
      if (marca === 0xDA) break;
      i += 2 + largo;
    }
    return null;
  }

  // Busca el valor de toBlob más alto que no pase de CALIDAD_OBJETIVO.
  function calibrarCalidad() {
    if (parametroCalidad) return Promise.resolve(parametroCalidad);
    var prueba = lienzo(16);
    var ctx = prueba.getContext('2d');
    var img = ctx.createImageData(16, 16);
    for (var i = 0; i < img.data.length; i++) img.data[i] = (i * 97) % 256;
    ctx.putImageData(img, 0, 0);

    var bajo = 0.05, alto = 1, paso = 0;
    function probar() {
      if (paso++ >= 9) return bajo;
      var medio = (bajo + alto) / 2;
      return aJpg(prueba, medio).then(function(datos) {
        var q = calidadReal(datos);
        if (q === null) throw new Error('sin tabla');
        if (q <= CALIDAD_OBJETIVO + 0.5) bajo = medio; else alto = medio;
        return probar();
      });
    }
    return probar().catch(function() {
      return CALIDAD_OBJETIVO / 100;   // si no se puede medir, el valor estándar
    }).then(function(valor) {
      parametroCalidad = valor;
      return valor;
    });
  }

  // Una cara del cubo de lado S, muestreando la foto con interpolación bilineal.
  function cara(fuente, nombre, S) {
    var W = fuente.width, H = fuente.height, src = fuente.data;
    var salida = new ImageData(S, S), dst = salida.data;
    var rx = ROTACION[nombre][0], ry = ROTACION[nombre][1];
    var cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
    var dosPi = 2 * Math.PI;
    var p = 0;
    for (var j = 0; j < S; j++) {
      var y = 0.5 - (j + 0.5) / S;
      for (var i = 0; i < S; i++) {
        var x = (i + 0.5) / S - 0.5, z = -0.5;
        // rotateX y después rotateY (igual que gl-matrix en Cube.js)
        var y1 = y * cx - z * sx, z1 = y * sx + z * cx;
        var x2 = z1 * sy + x * cy, z2 = z1 * cy - x * sy;
        var yaw = Math.atan2(x2, -z2);
        var arriba = Math.atan2(y1, Math.sqrt(x2 * x2 + z2 * z2));
        var u = (yaw / dosPi + 0.5) * W - 0.5;
        var v = (0.5 - arriba / Math.PI) * H - 0.5;

        var x0 = Math.floor(u), y0 = Math.floor(v);
        var fx = u - x0, fy = v - y0;
        var xa = ((x0 % W) + W) % W, xb = (xa + 1) % W;
        var ya = y0 < 0 ? 0 : (y0 >= H ? H - 1 : y0);
        var yb = y0 + 1 >= H ? H - 1 : (y0 + 1 < 0 ? 0 : y0 + 1);
        var a = (ya * W + xa) * 4, b = (ya * W + xb) * 4, c = (yb * W + xa) * 4, d = (yb * W + xb) * 4;
        var w1 = (1 - fx) * (1 - fy), w2 = fx * (1 - fy), w3 = (1 - fx) * fy, w4 = fx * fy;
        dst[p] = src[a] * w1 + src[b] * w2 + src[c] * w3 + src[d] * w4;
        dst[p + 1] = src[a + 1] * w1 + src[b + 1] * w2 + src[c + 1] * w3 + src[d + 1] * w4;
        dst[p + 2] = src[a + 2] * w1 + src[b + 2] * w2 + src[c + 2] * w3 + src[d + 2] * w4;
        dst[p + 3] = 255;
        p += 4;
      }
    }
    return salida;
  }

  // Reduce un lienzo a la mitad hasta llegar al tamaño pedido (mejor calidad que de un salto).
  function reducir(canvas, tam) {
    var actual = canvas;
    while (actual.width > tam) {
      var nuevo = lienzo(Math.max(tam, actual.width / 2));
      var ctx = nuevo.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(actual, 0, 0, nuevo.width, nuevo.height);
      actual = nuevo;
    }
    return actual;
  }

  // Niveles como los del Tool: 256 (solo respaldo) y luego 512, 1024, ... hasta cubrir la foto.
  function nivelesPara(anchoFoto) {
    var tamCara = Math.round(anchoFoto / 4);
    var tope = 512;
    while (tope < tamCara && tope < 4096) tope *= 2;
    var niveles = [{ tileSize: TAM_PREVIEW, size: TAM_PREVIEW, fallbackOnly: true }];
    for (var s = 512; s <= tope; s *= 2) niveles.push({ tileSize: TAM_PEDAZO, size: s });
    return { niveles: niveles, tamCara: tamCara };
  }

  function cargarPixeles(url) {
    return fetch(url).then(function(r) {
      if (!r.ok) throw new Error('No se encontró la foto ' + url);
      return r.blob();
    }).then(createImageBitmap).then(function(bmp) {
      var c = lienzo(bmp.width, bmp.height);
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      return ctx.getImageData(0, 0, c.width, c.height);
    });
  }

  // Corta una escena en cubos y agrega todo a app-files/tiles/<id>/.
  function exportarEscena(zip, urlFoto, id, niveles, avisar) {
    return cargarPixeles(urlFoto).then(function(pixeles) {
      var tope = niveles[niveles.length - 1].size;
      var caras = {};
      var cadena = Promise.resolve();
      CARAS.split('').forEach(function(nombre, k) {
        cadena = cadena.then(function() {
          avisar('cara ' + (k + 1) + ' de 6');
          return pausa();
        }).then(function() {
          var c = lienzo(tope);
          c.getContext('2d').putImageData(cara(pixeles, nombre, tope), 0, 0);
          caras[nombre] = c;
        });
      });
      return cadena.then(function() {
        pixeles = null;
        avisar('cortando pedazos');
        var base = 'app-files/tiles/' + id + '/';

        // preview.jpg: las 6 caras de 256px, una debajo de otra.
        var preview = lienzo(TAM_PREVIEW, TAM_PREVIEW * 6);
        var pctx = preview.getContext('2d');
        CARAS_PREVIEW.split('').forEach(function(nombre, k) {
          pctx.drawImage(reducir(caras[nombre], TAM_PREVIEW), 0, k * TAM_PREVIEW);
        });
        var pasos = aJpg(preview).then(function(datos) { zip.agregar(base + 'preview.jpg', datos); });

        // Niveles 1..N (el 0 es el de respaldo y usa preview.jpg). De a un pedazo
        // por vez, reusando el mismo lienzo, para no llenar la memoria.
        var pedazo = lienzo(TAM_PEDAZO);
        var pctxPedazo = pedazo.getContext('2d');
        niveles.forEach(function(nivel, z) {
          if (nivel.fallbackOnly) return;
          var n = nivel.size / nivel.tileSize;
          CARAS.split('').forEach(function(nombre) {
            var fuente = null;
            for (var fila = 0; fila < n; fila++) {
              for (var col = 0; col < n; col++) {
                pasos = pasos.then((function(fila, col) {
                  return function() {
                    fuente = fuente || reducir(caras[nombre], nivel.size);
                    pctxPedazo.drawImage(fuente,
                      col * nivel.tileSize, fila * nivel.tileSize, nivel.tileSize, nivel.tileSize,
                      0, 0, nivel.tileSize, nivel.tileSize);
                    return aJpg(pedazo).then(function(datos) {
                      zip.agregar(base + z + '/' + nombre + '/' + fila + '/' + col + '.jpg', datos);
                    });
                  };
                })(fila, col));
              }
            }
          });
        });
        return pasos;
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Exportar el tour completo
  // ---------------------------------------------------------------------------
  function slug(texto) {
    return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function leerBinario(url) {
    return fetch(encodeURI(url)).then(function(r) {
      if (!r.ok) throw new Error('Falta ' + url);
      return r.arrayBuffer();
    });
  }

  /*
   * opciones:
   *   tour         APP_DATA del editor
   *   carpeta      URL de la carpeta del tour (ej: /tours/casa/)
   *   iconos       nombres de archivo dentro de img/
   *   html(datos)  genera el index.html en formato Tool para los datos exportados
   *   progreso(texto, fraccion)
   */
  function exportar(opciones) {
    var tour = opciones.tour;
    var progreso = opciones.progreso || function() {};
    var zip = new Zip();

    // IDs como los del Tool: "<orden>-<nombre>".
    var ids = {}, usados = {};
    tour.scenes.forEach(function(e, i) {
      var id = i + '-' + (slug(e.name) || 'escena');
      while (usados[id]) id += '-b';
      usados[id] = true;
      ids[e.id] = id;
    });

    var info = tour.scenes.map(function(e) { return nivelesPara(e.equirectWidth || 4096); });
    var datos = {
      scenes: tour.scenes.map(function(e, i) {
        var escena = {
          id: ids[e.id],
          name: e.name,
          levels: info[i].niveles,
          faceSize: info[i].tamCara,
          initialViewParameters: e.initialViewParameters,
          linkHotspots: e.linkHotspots.filter(function(l) { return ids[l.target]; }).map(function(l) {
            return { yaw: l.yaw, pitch: l.pitch, rotation: l.rotation || 0, target: ids[l.target] };
          }),
          infoHotspots: e.infoHotspots.map(function(h) {
            return { yaw: h.yaw, pitch: h.pitch, title: h.title || '', text: h.text || '' };
          })
        };
        if (e.north != null) escena.north = e.north;
        return escena;
      }),
      name: tour.name,
      settings: tour.settings
    };

    var carpeta = opciones.carpeta;
    var fijos = [
      ['app-files/index.js', carpeta + 'index.js'],
      ['app-files/style.css', carpeta + 'style.css'],
      ['app-files/vendor/screenfull.min.js', '/kit-para-tours/formato-tool/vendor/screenfull.min.js'],
      ['app-files/vendor/bowser.min.js', '/kit-para-tours/formato-tool/vendor/bowser.min.js'],
      ['app-files/vendor/marzipano.js', carpeta + 'vendor/marzipano.js'],
      ['app-files/vendor/reset.min.css', '/kit-para-tours/formato-tool/vendor/reset.min.css']
    ].concat(opciones.iconos.map(function(n) { return ['app-files/img/' + n, carpeta + 'img/' + n]; }));

    progreso('Preparando archivos…', 0);
    zip.agregar('app-files/data.js', 'var APP_DATA = ' + JSON.stringify(datos, null, 2) + ';\n');
    zip.agregar('app-files/index.html', opciones.html(datos));

    return calibrarCalidad().then(function() {
      return Promise.all(fijos.map(function(f) {
        return leerBinario(f[1]).then(function(b) { return [f[0], b]; });
      }));
    }).then(function(archivos) {
      archivos.forEach(function(a) { zip.agregar(a[0], a[1]); });
      var cadena = Promise.resolve();
      tour.scenes.forEach(function(e, i) {
        cadena = cadena.then(function() {
          var avisar = function(paso) {
            progreso('Foto ' + (i + 1) + ' de ' + tour.scenes.length + ' («' + e.name + '»): ' + paso + '…',
              (i + 0.5) / tour.scenes.length);
          };
          return exportarEscena(zip, carpeta + e.equirect, ids[e.id], info[i].niveles, avisar);
        });
      });
      return cadena;
    }).then(function() {
      return Promise.all([
        leerBinario('/kit-para-tours/formato-tool/README.txt'),
        leerBinario('/kit-para-tours/formato-tool/LICENSE.txt')
      ]);
    }).then(function(textos) {
      zip.agregar('README.txt', textos[0]);
      zip.agregar('LICENSE.txt', textos[1]);
      progreso('Armando el ZIP…', 1);
      return zip.blob();
    });
  }

  window.ExportarTour = {
    exportar: exportar,
    calibrar: calibrarCalidad,
    calidadReal: calidadReal,
    _cara: cara
  };
})();
