/*
 * Editor de tours 360 con transición "caminar".
 *
 * Cada tour es una carpeta en tours/<nombre>/ con el mismo formato que usa la
 * demo: data.js + index.html + index.js del kit + fotos equirectangulares en
 * panos/. Guarda a través de la API de servidor.js (abierto con --editor).
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;

  // Archivos que forman el "motor" de cada tour: [origen, destino dentro del tour].
  var PLANTILLA = [
    ['/kit-para-tours/index.js', 'index.js'],
    ['/kit-para-tours/marzipano.js', 'vendor/marzipano.js'],
    ['/marzipano-walk/demo/style.css', 'style.css'],
    ['/kit-para-tours/lanzadores/servidor.js', 'servidor.js'],
    ['/kit-para-tours/lanzadores/servidor.ps1', 'servidor.ps1'],
    ['/kit-para-tours/lanzadores/Abrir tour (Mac).command', 'Abrir tour (Mac).command'],
    ['/kit-para-tours/lanzadores/Abrir tour (Windows).bat', 'Abrir tour (Windows).bat']
  ];
  var CARPETA_ICONOS = 'marzipano-walk/demo/img';

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  // Crea un elemento: h('div', {class: 'x', onclick: fn}, 'texto', otroElemento)
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function(k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    (function agregar(hijos) {
      hijos.forEach(function(c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) return agregar(c);
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    })(Array.prototype.slice.call(arguments, 2));
    return el;
  }

  function slug(texto) {
    return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  function escHtml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var timerAviso;
  function avisar(texto, esError) {
    var el = $('aviso');
    el.textContent = texto;
    el.className = 'toast' + (esError ? ' error' : '');
    el.hidden = false;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(function() { el.hidden = true; }, esError ? 7000 : 3500);
  }

  function leerPreferencia(clave, porDefecto) {
    try { return localStorage.getItem(clave) || porDefecto; } catch (e) { return porDefecto; }
  }
  function guardarPreferencia(clave, valor) {
    try { localStorage.setItem(clave, valor); } catch (e) { /* sin almacenamiento */ }
  }

  // ---------------------------------------------------------------------------
  // API del servidor
  // ---------------------------------------------------------------------------
  function urlApi(accion, ruta) {
    return '/api/' + accion + '?ruta=' + encodeURIComponent(ruta);
  }

  function respuestaJson(r) {
    var tipo = r.headers.get('Content-Type') || '';
    if (tipo.indexOf('application/json') === -1) throw new Error('sin-api');
    return r.json().then(function(j) {
      if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
      return j;
    });
  }

  var API = {
    listar: function(ruta) {
      return fetch(urlApi('listar', ruta)).then(respuestaJson);
    },
    escribir: function(ruta, cuerpo) {
      return fetch(urlApi('archivo', ruta), { method: 'PUT', body: cuerpo }).then(respuestaJson);
    },
    borrar: function(ruta) {
      return fetch(urlApi('archivo', ruta), { method: 'DELETE' }).then(respuestaJson);
    }
  };

  function leerTexto(url) {
    return fetch(url).then(function(r) {
      if (!r.ok) throw new Error('No se pudo leer ' + url);
      return r.text();
    });
  }

  // data.js -> objeto APP_DATA
  function parsearDatos(texto) {
    var json = texto.replace(/^\s*var\s+APP_DATA\s*=\s*/, '').replace(/;\s*$/, '');
    try { return JSON.parse(json); } catch (e) {
      return new Function(texto + '\n;return APP_DATA;')();
    }
  }

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------
  var estado = {
    slug: null,        // carpeta del tour abierto
    tour: null,        // APP_DATA del tour abierto
    actual: null,      // id de la escena que se está viendo
    seleccion: null,   // { tipo: 'enlace' | 'info', indice }
    modo: null,        // colocando: { tipo: 'enlace' | 'info', destino? }
    procesando: []     // fotos que se están subiendo
  };

  function base() { return 'tours/' + estado.slug + '/'; }
  function escenas() { return estado.tour ? estado.tour.scenes : []; }
  function escenaPorId(id) {
    return escenas().filter(function(e) { return e.id === id; })[0] || null;
  }
  function escenaActual() { return escenaPorId(estado.actual); }
  function nombreDe(id) {
    var e = escenaPorId(id);
    return e ? e.name : '(foto borrada)';
  }
  function enlaceA(escena, destinoId) {
    return escena.linkHotspots.filter(function(l) { return l.target === destinoId; })[0] || null;
  }
  function tieneVuelta(escena, enlace) {
    var destino = escenaPorId(enlace.target);
    return !!(destino && enlaceA(destino, escena.id));
  }
  function escenaConProblemas(e) {
    if (escenas().length < 2) return false;
    if (!e.linkHotspots.length) return true;
    return e.linkHotspots.some(function(l) { return !tieneVuelta(e, l); });
  }

  // ---------------------------------------------------------------------------
  // Guardado (data.js + index.html) con demora para agrupar cambios
  // ---------------------------------------------------------------------------
  var timerGuardado = null;
  var colaGuardado = Promise.resolve();

  function marcarEstado(texto, esError) {
    var el = $('estadoGuardado');
    el.textContent = texto;
    el.classList.toggle('error', !!esError);
  }

  function guardar() {
    marcarEstado('Guardando…');
    clearTimeout(timerGuardado);
    timerGuardado = setTimeout(guardarYa, 500);
  }

  function guardarYa() {
    clearTimeout(timerGuardado);
    timerGuardado = null;
    if (!estado.tour) return colaGuardado;
    var ruta = base();
    var datos = 'var APP_DATA = ' + JSON.stringify(estado.tour, null, 2) + ';\n';
    var html = htmlDelTour(estado.tour);
    colaGuardado = colaGuardado.catch(function() {}).then(function() {
      return Promise.all([
        API.escribir(ruta + 'data.js', datos),
        API.escribir(ruta + 'index.html', html)
      ]);
    }).then(function() {
      marcarEstado('Guardado ✓');
    }, function(err) {
      marcarEstado('No se pudo guardar', true);
      avisar('No se pudo guardar: ' + err.message + '. ¿Sigue abierta la ventana del servidor?', true);
      throw err;
    });
    return colaGuardado;
  }

  // formatoTool: igual que el index.html del Marzipano Tool (reset.min.css,
  // screenfull y bowser en vendor/). Si no, usa un reemplazo de screenfull incluido.
  function htmlDelTour(tour, formatoTool) {
    var lista = tour.scenes.map(function(e) {
      return '    <a href="javascript:void(0)" class="scene" data-id="' + escHtml(e.id) + '"><li class="text">' +
        escHtml(e.name) + '</li></a>';
    }).join('\n');
    var botones = [['viewUp', 'up', 1], ['viewDown', 'down', 2], ['viewLeft', 'left', 3],
      ['viewRight', 'right', 4], ['viewIn', 'plus', 5], ['viewOut', 'minus', 6]];
    return [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<title>' + escHtml(tour.name) + '</title>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="target-densitydpi=device-dpi, width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, minimal-ui" />',
      '<style> @-ms-viewport { width: device-width; } html,body{margin:0;padding:0;} </style>',
      formatoTool ? '<link rel="stylesheet" href="vendor/reset.min.css">' : null,
      '<link rel="stylesheet" href="style.css">',
      '</head>',
      '<body class="' + (tour.scenes.length > 1 ? 'multiple-scenes' : 'single-scene') + '">',
      '',
      '<div id="pano"></div>',
      '',
      '<div id="sceneList">',
      '  <ul class="scenes">',
      lista,
      '  </ul>',
      '</div>',
      '',
      '<div id="titleBar">',
      '  <h1 class="sceneName"></h1>',
      '</div>',
      '',
      '<a href="javascript:void(0)" id="autorotateToggle">',
      '  <img class="icon off" src="img/play.png">',
      '  <img class="icon on" src="img/pause.png">',
      '</a>',
      '',
      '<a href="javascript:void(0)" id="fullscreenToggle">',
      '  <img class="icon off" src="img/fullscreen.png">',
      '  <img class="icon on" src="img/windowed.png">',
      '</a>',
      '',
      '<a href="javascript:void(0)" id="sceneListToggle">',
      '  <img class="icon off" src="img/expand.png">',
      '  <img class="icon on" src="img/collapse.png">',
      '</a>',
      '',
      botones.map(function(b) {
        return '<a href="javascript:void(0)" id="' + b[0] + '" class="viewControlButton viewControlButton-' + b[2] + '">\n' +
          '  <img class="icon" src="img/' + b[1] + '.png">\n</a>';
      }).join('\n'),
      '',
      formatoTool
        ? '<script src="vendor/screenfull.min.js" ></script>\n<script src="vendor/bowser.min.js" ></script>'
        : SCREENFULL_INCLUIDO,
      '<script src="vendor/marzipano.js"></script>',
      '<script src="data.js"></script>',
      '<script src="index.js"></script>',
      '',
      '</body>',
      '</html>',
      ''
    ].filter(function(l) { return l !== null; }).join('\n');
  }

  var SCREENFULL_INCLUIDO = [
    '<script>',
    '// Pantalla completa sin librerías externas.',
    'window.screenfull = window.screenfull || (function() {',
    '  var d = document, el = d.documentElement;',
    '  var pedir = el.requestFullscreen || el.webkitRequestFullscreen;',
    '  var salir = d.exitFullscreen || d.webkitExitFullscreen;',
    '  if (!pedir || !salir) { return null; }',
    '  function actual() { return d.fullscreenElement || d.webkitFullscreenElement; }',
    '  return {',
    '    enabled: true,',
    '    get isFullscreen() { return !!actual(); },',
    '    toggle: function() { if (actual()) { salir.call(d); } else { pedir.call(el); } },',
    '    on: function(ev, fn) { d.addEventListener("fullscreenchange", fn); d.addEventListener("webkitfullscreenchange", fn); }',
    '  };',
    '})();',
    '</script>'
  ].join('\n');

  // Copia (o actualiza) el motor del tour: index.js, marzipano.js, estilos, íconos y lanzadores.
  function copiarPlantilla(ruta) {
    return API.listar(CARPETA_ICONOS).then(function(iconos) {
      var copias = PLANTILLA.concat(iconos.filter(function(i) { return !i.carpeta; }).map(function(i) {
        return ['/' + CARPETA_ICONOS + '/' + i.nombre, 'img/' + i.nombre];
      }));
      return Promise.all(copias.map(function(c) {
        return fetch(encodeURI(c[0])).then(function(r) {
          if (!r.ok) throw new Error('Falta ' + c[0]);
          return r.arrayBuffer();
        }).then(function(contenido) {
          return API.escribir(ruta + c[1], contenido);
        });
      }));
    });
  }

  // ---------------------------------------------------------------------------
  // Pantalla de inicio
  // ---------------------------------------------------------------------------
  function mostrarInicio() {
    estado.slug = null;
    estado.tour = null;
    $('editor').hidden = true;
    $('inicio').hidden = false;
    document.title = 'Crear tour 360';
    cargarListaTours();
  }

  function cargarListaTours() {
    var lista = $('listaTours');
    return API.listar('tours').then(function(items) {
      var carpetas = items.filter(function(i) { return i.carpeta; });
      return Promise.all(carpetas.map(function(c) {
        return leerTexto('/tours/' + encodeURIComponent(c.nombre) + '/data.js')
          .then(parsearDatos)
          .then(function(d) { return { slug: c.nombre, nombre: d.name || c.nombre, fotos: d.scenes.length }; },
            function() { return null; });
      }));
    }).then(function(tours) {
      tours = tours.filter(Boolean).sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
      lista.innerHTML = '';
      $('tituloLista').hidden = !tours.length;
      tours.forEach(function(t) {
        lista.appendChild(h('li', null,
          h('span', { class: 'nombre', onclick: function() { abrirTour(t.slug); } },
            t.nombre, h('small', null, t.fotos + (t.fotos === 1 ? ' foto' : ' fotos') + ' · tours/' + t.slug)),
          h('button', { onclick: function() { abrirTour(t.slug); } }, 'Editar'),
          h('button', { onclick: function() { window.open('/tours/' + t.slug + '/', '_blank'); } }, 'Ver ↗'),
          h('button', { class: 'peligro', title: 'Borrar tour', onclick: function() { borrarTour(t); } }, 'Borrar')
        ));
      });
    }).catch(function(err) {
      if (err.message === 'sin-api') {
        $('sinApi').hidden = false;
        $('formNuevo').hidden = true;
      } else {
        avisar(err.message, true);
      }
    });
  }

  function borrarTour(t) {
    if (!confirm('¿Borrar el tour «' + t.nombre + '» con todas sus fotos? No se puede deshacer.')) return;
    API.borrar('tours/' + t.slug).then(cargarListaTours, function(err) { avisar(err.message, true); });
  }

  $('formNuevo').addEventListener('submit', function(ev) {
    ev.preventDefault();
    var nombre = $('nombreNuevo').value.trim();
    if (!nombre) return;
    var boton = ev.target.querySelector('button');
    boton.disabled = true;
    API.listar('tours').then(function(items) {
      var usados = items.map(function(i) { return i.nombre; });
      var s = slug(nombre) || 'tour', n = 2, candidato = s;
      while (usados.indexOf(candidato) !== -1) { candidato = s + '-' + (n++); }
      estado.slug = candidato;
      estado.tour = {
        scenes: [],
        name: nombre,
        settings: { mouseViewMode: 'drag', autorotateEnabled: false, fullscreenButton: true, viewControlButtons: false }
      };
      return copiarPlantilla(base()).then(guardarYa).then(function() {
        $('nombreNuevo').value = '';
        location.hash = candidato;
      });
    }).catch(function(err) {
      avisar('No se pudo crear el tour: ' + err.message, true);
    }).then(function() { boton.disabled = false; });
  });

  // ---------------------------------------------------------------------------
  // Abrir un tour
  // ---------------------------------------------------------------------------
  function abrirTour(s) {
    if (location.hash !== '#' + s) { location.hash = s; return; }
    leerTexto('/tours/' + encodeURIComponent(s) + '/data.js').then(parsearDatos).then(function(tour) {
      tour.settings = tour.settings || {};
      tour.scenes.forEach(function(e) {
        e.linkHotspots = e.linkHotspots || [];
        e.infoHotspots = e.infoHotspots || [];
      });
      limpiarVisor();
      estado.slug = s;
      estado.tour = tour;
      estado.seleccion = null;
      estado.modo = null;
      $('inicio').hidden = true;
      $('editor').hidden = false;
      $('nombreTour').value = tour.name || '';
      $('autorotar').checked = !!tour.settings.autorotateEnabled;
      document.title = (tour.name || s) + ' · Crear tour 360';
      marcarEstado('');
      var noEditables = tour.scenes.filter(function(e) { return !e.equirect; });
      if (noEditables.length) {
        avisar('Este tour tiene fotos en formato del Marzipano Tool (cubos): esas no se pueden ver en el editor.', true);
      }
      viewer.updateSize();
      irAEscena(tour.scenes.length ? tour.scenes[0].id : null);
    }).catch(function(err) {
      avisar('No se pudo abrir el tour: ' + err.message, true);
      location.hash = '';
    });
  }

  function segunHash() {
    var s = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (timerGuardado) guardarYa();
    if (s) abrirTour(s); else mostrarInicio();
  }
  window.addEventListener('hashchange', segunHash);

  $('volver').addEventListener('click', function() { location.hash = ''; });

  $('nombreTour').addEventListener('input', function() {
    estado.tour.name = this.value.trim() || estado.slug;
    document.title = estado.tour.name + ' · Crear tour 360';
    guardar();
  });

  $('autorotar').addEventListener('change', function() {
    estado.tour.settings.autorotateEnabled = this.checked;
    guardar();
  });

  $('verTour').addEventListener('click', function() {
    if (!escenas().length) return avisar('Primero agregá al menos una foto.', true);
    var ventana = window.open('', '_blank');
    guardarYa().then(function() {
      if (ventana) ventana.location = '/tours/' + estado.slug + '/';
    }, function() { if (ventana) ventana.close(); });
  });

  // Exportar en el formato de ZIP del Marzipano Tool.
  $('exportarZip').addEventListener('click', function() {
    if (!escenas().length) return avisar('Primero agregá al menos una foto.', true);
    if (estado.procesando.length) return avisar('Esperá a que terminen de subirse las fotos.', true);
    var sinFoto = escenas().filter(function(e) { return !e.equirect; });
    if (sinFoto.length) return avisar('Este tour tiene fotos que no se pueden exportar desde el editor.', true);
    var boton = this, tour = estado.tour, slugTour = estado.slug;
    boton.disabled = true;
    $('exportando').hidden = false;
    guardarYa().then(function() {
      return API.listar(base() + 'img');
    }).then(function(iconos) {
      return window.ExportarTour.exportar({
        tour: JSON.parse(JSON.stringify(tour)),
        carpeta: '/tours/' + slugTour + '/',
        iconos: iconos.filter(function(i) { return !i.carpeta; }).map(function(i) { return i.nombre; }),
        html: function(datos) { return htmlDelTour(datos, true); },
        progreso: function(texto, fraccion) {
          $('exportandoTexto').textContent = texto;
          $('exportandoBarra').style.width = Math.round(fraccion * 100) + '%';
        }
      });
    }).then(function(zip) {
      var enlace = h('a', { href: URL.createObjectURL(zip), download: slugTour + '.zip' });
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(function() { URL.revokeObjectURL(enlace.href); }, 60000);
      avisar('Listo: se descargó ' + slugTour + '.zip (' + (zip.size / 1048576).toFixed(1) + ' MB).');
    }).catch(function(err) {
      avisar('No se pudo exportar: ' + err.message, true);
    }).then(function() {
      $('exportando').hidden = true;
      boton.disabled = false;
    });
  });

  // ---------------------------------------------------------------------------
  // Visor
  // ---------------------------------------------------------------------------
  var visorEl = $('visor');
  var viewer = new Marzipano.Viewer(visorEl, { controls: { mouseViewMode: 'drag' } });
  var enVisor = {};         // id de escena -> { scene, view }
  var marcas = [];          // hotspots dibujados en la escena actual

  function limpiarVisor() {
    Object.keys(enVisor).forEach(function(id) { quitarDelVisor(id); });
    marcas = [];
  }

  function quitarDelVisor(id) {
    if (!enVisor[id]) return;
    try { viewer.destroyScene(enVisor[id].scene); } catch (e) { /* ya destruida */ }
    delete enVisor[id];
  }

  function escenaEnVisor(e) {
    if (enVisor[e.id]) return enVisor[e.id];
    var ancho = e.equirectWidth || 4096;
    var source = Marzipano.ImageUrlSource.fromString('/' + base() + e.equirect);
    var geometry = new Marzipano.EquirectGeometry([{ width: ancho }]);
    var limiter = Marzipano.RectilinearView.limit.traditional(ancho / 4, 100 * Math.PI / 180, 120 * Math.PI / 180);
    var view = new Marzipano.RectilinearView(e.initialViewParameters, limiter);
    var scene = viewer.createScene({ source: source, geometry: geometry, view: view, pinFirstLevel: true });
    enVisor[e.id] = { scene: scene, view: view };
    return enVisor[e.id];
  }

  function irAEscena(id) {
    estado.actual = id;
    estado.seleccion = null;
    cancelarModo();
    var e = escenaActual();
    $('vacio').hidden = !!e || estado.procesando.length > 0;
    $('herramientas').hidden = !e || !e.equirect;
    if (e && e.equirect) {
      var v = escenaEnVisor(e);
      v.view.setParameters(e.initialViewParameters);
      v.scene.switchTo({ transitionDuration: 250 });
      dibujarHotspots();
    }
    dibujarLista();
    dibujarPanel();
    actualizarHerramientas();
  }

  function coordsDe(ev) {
    var rect = visorEl.getBoundingClientRect();
    return enVisor[estado.actual].view.screenToCoordinates({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
  }

  // Click (sin arrastrar) en la foto: coloca el hotspot pendiente o quita la selección.
  var abajo = null;
  visorEl.addEventListener('pointerdown', function(ev) {
    abajo = { x: ev.clientX, y: ev.clientY };
  });
  visorEl.addEventListener('pointerup', function(ev) {
    if (!abajo || !escenaActual()) { abajo = null; return; }
    var movido = Math.abs(ev.clientX - abajo.x) + Math.abs(ev.clientY - abajo.y);
    abajo = null;
    if (movido > 5) return;
    if (estado.modo) colocar(coordsDe(ev));
    else if (estado.seleccion) seleccionar(null);
  });

  // ---------------------------------------------------------------------------
  // Hotspots
  // ---------------------------------------------------------------------------
  function dibujarHotspots() {
    var e = escenaActual();
    if (!e || !enVisor[e.id]) return;
    var contenedor = enVisor[e.id].scene.hotspotContainer();
    contenedor.listHotspots().slice().forEach(function(hs) { contenedor.destroyHotspot(hs); });
    marcas = [];
    e.linkHotspots.forEach(function(l, i) { crearMarca(contenedor, 'enlace', l, i); });
    e.infoHotspots.forEach(function(inf, i) { crearMarca(contenedor, 'info', inf, i); });
    marcarSeleccion();
  }

  function crearMarca(contenedor, tipo, datos, indice) {
    var e = escenaActual();
    var texto = tipo === 'enlace' ? nombreDe(datos.target) : (datos.title || '(sin título)');
    var marca = h('div', { class: 'eh-marca', title: 'Arrastrá para mover · click para editar' }, tipo === 'info' ? 'i' : null);
    var el = h('div', { class: 'eh eh-' + tipo + (tipo === 'enlace' && !tieneVuelta(e, datos) ? ' sin-vuelta' : '') },
      marca, h('div', { class: 'eh-texto' }, texto));
    var hotspot = contenedor.createHotspot(el, { yaw: datos.yaw, pitch: datos.pitch });
    marcas.push({ tipo: tipo, indice: indice, el: el });

    // Arrastrar para mover; click para seleccionar.
    marca.addEventListener('pointerdown', function(ev) {
      ev.stopPropagation();
      ev.preventDefault();
      cancelarModo();
      seleccionar({ tipo: tipo, indice: indice });
      var inicio = { x: ev.clientX, y: ev.clientY }, movido = false;
      marca.setPointerCapture(ev.pointerId);
      function mover(ev2) {
        if (!movido && Math.abs(ev2.clientX - inicio.x) + Math.abs(ev2.clientY - inicio.y) < 4) return;
        movido = true;
        var c = coordsDe(ev2);
        datos.yaw = c.yaw;
        datos.pitch = c.pitch;
        hotspot.setPosition(c);
      }
      function soltar() {
        marca.removeEventListener('pointermove', mover);
        marca.removeEventListener('pointerup', soltar);
        marca.removeEventListener('pointercancel', soltar);
        if (movido) guardar();
      }
      marca.addEventListener('pointermove', mover);
      marca.addEventListener('pointerup', soltar);
      marca.addEventListener('pointercancel', soltar);
    });
    // Que el visor no gire la foto al tocar el hotspot.
    ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'wheel']
      .forEach(function(n) { el.addEventListener(n, function(ev) { ev.stopPropagation(); }); });
  }

  function marcarSeleccion() {
    var s = estado.seleccion;
    marcas.forEach(function(m) {
      m.el.classList.toggle('seleccionado', !!s && s.tipo === m.tipo && s.indice === m.indice);
    });
  }

  function seleccionar(s) {
    estado.seleccion = s;
    marcarSeleccion();
    dibujarPanel();
  }

  function datosSeleccion() {
    var e = escenaActual(), s = estado.seleccion;
    if (!e || !s) return null;
    return (s.tipo === 'enlace' ? e.linkHotspots : e.infoHotspots)[s.indice] || null;
  }

  // Modo "colocar": el próximo click en la foto crea el hotspot.
  function empezarModo(modo) {
    estado.modo = modo;
    estado.seleccion = null;
    marcarSeleccion();
    visorEl.classList.add('colocando');
    var pista = $('pista');
    pista.hidden = false;
    pista.textContent = modo.tipo === 'enlace'
      ? 'Hacé click en el piso, justo donde estaba parada la cámara de la otra foto' +
        (modo.destino ? ' («' + nombreDe(modo.destino) + '»)' : '') + '. Esc para cancelar.'
      : 'Hacé click donde querés el cartel de información. Esc para cancelar.';
    actualizarHerramientas();
    dibujarPanel();
  }

  function cancelarModo() {
    estado.modo = null;
    visorEl.classList.remove('colocando');
    $('pista').hidden = true;
    actualizarHerramientas();
  }

  function colocar(c) {
    var e = escenaActual(), modo = estado.modo;
    cancelarModo();
    if (modo.tipo === 'enlace') {
      var otras = escenas().filter(function(x) { return x.id !== e.id; });
      var libre = otras.filter(function(x) { return !enlaceA(e, x.id); })[0];
      var destino = modo.destino || (libre || otras[0]).id;
      e.linkHotspots.push({ yaw: c.yaw, pitch: c.pitch, rotation: 0, target: destino });
      estado.seleccion = { tipo: 'enlace', indice: e.linkHotspots.length - 1 };
    } else {
      e.infoHotspots.push({ yaw: c.yaw, pitch: c.pitch, title: 'Título', text: '' });
      estado.seleccion = { tipo: 'info', indice: e.infoHotspots.length - 1 };
    }
    dibujarHotspots();
    dibujarLista();
    dibujarPanel();
    guardar();
    if (modo.tipo === 'info') {
      var campo = document.querySelector('#panel input');
      if (campo) { campo.focus(); campo.select(); }
    }
  }

  function borrarSeleccion() {
    var e = escenaActual(), s = estado.seleccion;
    if (!e || !s) return;
    (s.tipo === 'enlace' ? e.linkHotspots : e.infoHotspots).splice(s.indice, 1);
    estado.seleccion = null;
    dibujarHotspots();
    dibujarLista();
    dibujarPanel();
    guardar();
  }

  function actualizarHerramientas() {
    var modo = estado.modo;
    $('agregarEnlace').classList.toggle('activo', !!modo && modo.tipo === 'enlace');
    $('agregarInfo').classList.toggle('activo', !!modo && modo.tipo === 'info');
    var pocas = escenas().length < 2;
    $('agregarEnlace').disabled = pocas;
    $('agregarEnlace').title = pocas ? 'Agregá al menos 2 fotos para poder enlazarlas' : 'Enlace para caminar a otra foto';
  }

  $('agregarEnlace').addEventListener('click', function() {
    if (estado.modo && estado.modo.tipo === 'enlace') cancelarModo(); else empezarModo({ tipo: 'enlace' });
  });
  $('agregarInfo').addEventListener('click', function() {
    if (estado.modo && estado.modo.tipo === 'info') cancelarModo(); else empezarModo({ tipo: 'info' });
  });
  $('vistaInicial').addEventListener('click', function() {
    var e = escenaActual();
    var p = enVisor[e.id].view.parameters();
    e.initialViewParameters = { yaw: p.yaw, pitch: p.pitch, fov: p.fov };
    guardar();
    avisar('Listo: al entrar a «' + e.name + '» se va a mirar hacia acá.');
  });

  document.addEventListener('keydown', function(ev) {
    var escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (ev.key === 'Escape') {
      if (estado.modo) cancelarModo();
      else if (estado.seleccion) seleccionar(null);
      dibujarPanel();
    } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && !escribiendo && estado.seleccion) {
      ev.preventDefault();
      borrarSeleccion();
    }
  });

  // ---------------------------------------------------------------------------
  // Lista de fotos
  // ---------------------------------------------------------------------------
  function dibujarLista() {
    var lista = $('listaEscenas');
    lista.innerHTML = '';
    escenas().forEach(function(e, i) {
      var problema = escenaConProblemas(e);
      lista.appendChild(h('li', {
        class: e.id === estado.actual ? 'actual' : '',
        onclick: function() { if (e.id !== estado.actual) irAEscena(e.id); }
      },
        h('span', { class: 'n' }, e.name),
        i === 0 ? h('span', { class: 'etiqueta', title: 'El tour empieza en esta foto' }, 'inicio') : null,
        problema ? h('span', { class: 'alerta', title: e.linkHotspots.length ? 'Tiene enlaces sin vuelta' : 'No tiene enlaces' }, '⚠') : null,
        h('span', { class: 'mover' },
          h('button', { title: 'Subir', disabled: i === 0, onclick: function(ev) { ev.stopPropagation(); moverEscena(i, -1); } }, '↑'),
          h('button', { title: 'Bajar', disabled: i === escenas().length - 1, onclick: function(ev) { ev.stopPropagation(); moverEscena(i, 1); } }, '↓'))
      ));
    });
    estado.procesando.forEach(function(p) {
      lista.appendChild(h('li', { class: 'procesando' }, h('span', { class: 'n' }, 'Procesando ' + p.nombre + '…')));
    });
  }

  function moverEscena(i, delta) {
    var lista = escenas(), j = i + delta;
    var tmp = lista[i]; lista[i] = lista[j]; lista[j] = tmp;
    dibujarLista();
    guardar();
  }

  function borrarEscena(e) {
    if (!confirm('¿Borrar la foto «' + e.name + '»? También se borran los enlaces que llevan a ella.')) return;
    var lista = escenas(), i = lista.indexOf(e);
    lista.splice(i, 1);
    lista.forEach(function(otra) {
      otra.linkHotspots = otra.linkHotspots.filter(function(l) { return l.target !== e.id; });
    });
    quitarDelVisor(e.id);
    API.borrar(base() + e.equirect).catch(function() { /* si no estaba, no importa */ });
    guardar();
    var siguiente = lista[Math.min(i, lista.length - 1)];
    irAEscena(siguiente ? siguiente.id : null);
  }

  // ---------------------------------------------------------------------------
  // Panel derecho
  // ---------------------------------------------------------------------------
  function campo(etiqueta, control) {
    return h('label', { class: 'campo' }, h('span', null, etiqueta), control);
  }

  function dibujarPanel() {
    var panel = $('panel');
    panel.innerHTML = '';
    var e = escenaActual();
    if (!e) {
      panel.appendChild(h('div', null,
        h('h3', null, 'Cómo armar el tour'),
        h('p', { class: 'nota' }, '1. Agregá tus fotos 360 con el botón de la izquierda.'),
        h('p', { class: 'nota' }, '2. En cada foto, usá «+ Enlace» y hacé click en el piso, donde estaba parada la cámara de la otra foto.'),
        h('p', { class: 'nota' }, '3. Poné también el enlace de vuelta en la otra foto: así la caminata llega mirando para el lado correcto.'),
        h('p', { class: 'nota' }, '4. Tocá «Ver tour» para probarlo. Se guarda solo.')));
      return;
    }
    var datos = datosSeleccion();
    if (datos && estado.seleccion.tipo === 'enlace') panelEnlace(panel, e, datos);
    else if (datos && estado.seleccion.tipo === 'info') panelInfo(panel, datos);
    else panelEscena(panel, e);
  }

  function panelEscena(panel, e) {
    var nombre = h('input', { type: 'text', value: e.name });
    nombre.addEventListener('input', function() {
      e.name = nombre.value.trim() || e.id;
      dibujarLista();
      guardar();
    });
    nombre.addEventListener('change', dibujarHotspots);
    panel.appendChild(h('h3', null, 'Foto'));
    panel.appendChild(campo('Nombre', nombre));

    var otras = escenas().length > 1;
    if (otras) {
      panel.appendChild(h('span', { class: 'nota' }, 'Enlaces desde esta foto'));
      if (!e.linkHotspots.length) {
        panel.appendChild(h('div', { class: 'estado-vuelta falta' },
          'Esta foto todavía no tiene enlaces: desde acá no se puede caminar a ninguna otra.'));
      } else {
        panel.appendChild(h('ul', { class: 'enlaces' }, e.linkHotspots.map(function(l, i) {
          return h('li', { onclick: function() { seleccionar({ tipo: 'enlace', indice: i }); } },
            '→ ' + nombreDe(l.target) + (tieneVuelta(e, l) ? '' : '  ⚠ sin vuelta'));
        })));
      }
      var llegan = escenas().filter(function(x) { return x !== e && enlaceA(x, e.id); });
      if (llegan.length) {
        panel.appendChild(h('span', { class: 'nota' }, 'Se llega caminando desde'));
        panel.appendChild(h('ul', { class: 'enlaces' }, llegan.map(function(x) {
          return h('li', { onclick: function() { irAEscena(x.id); } }, '← ' + x.name);
        })));
      }
    }
    panel.appendChild(h('p', { class: 'nota' },
      '«Usar esta vista al entrar» define hacia dónde se mira al abrir el tour o al saltar desde la lista. ' +
      'Cuando se llega caminando, la dirección sale del enlace de vuelta.'));
    panel.appendChild(h('div', { class: 'separador' }));
    panel.appendChild(h('button', { class: 'peligro', onclick: function() { borrarEscena(e); } }, 'Borrar esta foto'));
  }

  function panelEnlace(panel, e, l) {
    var select = h('select', null, escenas().filter(function(x) { return x.id !== e.id; }).map(function(x) {
      return h('option', { value: x.id, selected: x.id === l.target }, x.name);
    }));
    select.addEventListener('change', function() {
      l.target = select.value;
      dibujarHotspots();
      dibujarLista();
      dibujarPanel();
      guardar();
    });
    panel.appendChild(h('h3', null, 'Enlace'));
    panel.appendChild(campo('Camina hacia', select));

    var destino = escenaPorId(l.target);
    if (destino && enlaceA(destino, e.id)) {
      panel.appendChild(h('div', { class: 'estado-vuelta ok' }, '✓ «' + destino.name + '» tiene enlace de vuelta a esta foto.'));
    } else if (destino) {
      panel.appendChild(h('div', { class: 'estado-vuelta falta' },
        '«' + destino.name + '» no tiene un enlace de vuelta a «' + e.name + '». ' +
        'Ponelo para que la caminata llegue mirando en la dirección correcta.',
        h('br'),
        h('button', { onclick: function() {
          irAEscena(destino.id);
          empezarModo({ tipo: 'enlace', destino: e.id });
        } }, 'Ir a «' + destino.name + '» y ponerlo')));
    }
    panel.appendChild(h('p', { class: 'nota' },
      'Arrastrá el disco para ubicarlo en el piso, justo donde estaba parada la cámara de «' +
      (destino ? destino.name : '') + '».'));
    panel.appendChild(h('div', { class: 'fila' },
      destino ? h('button', { onclick: function() { irAEscena(destino.id); } }, 'Ir a esa foto') : null,
      h('button', { class: 'peligro', onclick: borrarSeleccion }, 'Borrar enlace')));
  }

  function panelInfo(panel, inf) {
    var titulo = h('input', { type: 'text', value: inf.title || '' });
    var texto = h('textarea', null);
    texto.value = inf.text || '';
    titulo.addEventListener('input', function() { inf.title = titulo.value; guardar(); });
    titulo.addEventListener('change', dibujarHotspots);
    texto.addEventListener('input', function() { inf.text = texto.value; guardar(); });
    panel.appendChild(h('h3', null, 'Cartel de información'));
    panel.appendChild(campo('Título', titulo));
    panel.appendChild(campo('Texto', texto));
    panel.appendChild(h('p', { class: 'nota' }, 'Arrastrá el ícono para moverlo.'));
    panel.appendChild(h('button', { class: 'peligro', onclick: borrarSeleccion }, 'Borrar cartel'));
  }

  // ---------------------------------------------------------------------------
  // Agregar fotos
  // ---------------------------------------------------------------------------
  var calidad = $('calidad');
  calidad.value = leerPreferencia('editor-calidad', '6144');
  calidad.addEventListener('change', function() { guardarPreferencia('editor-calidad', calidad.value); });
  calidad.title = 'Normal: carga rápido en cualquier celular. Máxima: más nítida, pero puede no andar en celulares viejos.';

  $('archivos').addEventListener('change', function() {
    agregarFotos(Array.prototype.slice.call(this.files));
    this.value = '';
  });

  function idLibre(nombre) {
    var usados = escenas().map(function(e) { return e.id; })
      .concat(estado.procesando.map(function(p) { return p.id; }));
    var s = slug(nombre) || 'foto', n = 2, candidato = s;
    while (usados.indexOf(candidato) !== -1) { candidato = s + '-' + (n++); }
    return candidato;
  }

  function prepararFoto(archivo, anchoMaximo) {
    return createImageBitmap(archivo).then(function(bmp) {
      var ratio = bmp.width / bmp.height;
      if (Math.abs(ratio - 2) > 0.05) {
        bmp.close();
        throw new Error('«' + archivo.name + '» no es una foto 360 equirectangular (mide ' + bmp.width + '×' + bmp.height +
          '; tiene que ser el doble de ancha que de alta).');
      }
      var ancho = Math.min(anchoMaximo, bmp.width);
      ancho -= ancho % 2;
      var canvas = document.createElement('canvas');
      canvas.width = ancho;
      canvas.height = ancho / 2;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
      return new Promise(function(ok, mal) {
        canvas.toBlob(function(blob) {
          if (blob) ok({ blob: blob, ancho: ancho }); else mal(new Error('No se pudo procesar «' + archivo.name + '».'));
        }, 'image/jpeg', 0.9);
      });
    });
  }

  function agregarFotos(archivos) {
    if (!estado.tour) return;
    archivos = archivos.filter(function(a) { return /^image\//.test(a.type); });
    if (!archivos.length) return avisar('Elegí fotos JPG, PNG o WEBP.', true);
    var slugTour = estado.slug;
    var anchoMaximo = parseInt(calidad.value, 10);
    var pendientes = archivos.map(function(a) {
      var nombre = a.name.replace(/\.[^.]+$/, '');
      var p = { id: idLibre(nombre), nombre: nombre, archivo: a };
      estado.procesando.push(p);
      return p;
    });
    dibujarLista();
    $('vacio').hidden = true;

    // De a una para no llenar la memoria con fotos gigantes.
    return pendientes.reduce(function(cadena, p) {
      return cadena.then(function() {
        return prepararFoto(p.archivo, anchoMaximo).then(function(foto) {
          if (estado.slug !== slugTour) throw new Error('Se cambió de tour antes de terminar de subir «' + p.nombre + '».');
          var ruta = 'panos/' + p.id + '.jpg';
          return API.escribir(base() + ruta, foto.blob).then(function() {
            escenas().push({
              id: p.id,
              name: p.nombre,
              equirect: ruta,
              equirectWidth: foto.ancho,
              initialViewParameters: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
              linkHotspots: [],
              infoHotspots: []
            });
            guardar();
          });
        }).catch(function(err) {
          avisar(err.message, true);
        }).then(function() {
          estado.procesando.splice(estado.procesando.indexOf(p), 1);
          if (estado.slug !== slugTour) return;
          if (!estado.actual && escenas().length) irAEscena(escenas()[0].id);
          else { dibujarLista(); dibujarPanel(); actualizarHerramientas(); }
          $('vacio').hidden = !!escenas().length || estado.procesando.length > 0;
        });
      });
    }, Promise.resolve());
  }

  // Arrastrar fotos a la ventana.
  var arrastres = 0;
  function conArchivos(ev) {
    return ev.dataTransfer && Array.prototype.indexOf.call(ev.dataTransfer.types, 'Files') !== -1;
  }
  window.addEventListener('dragenter', function(ev) {
    if (!conArchivos(ev) || !estado.tour) return;
    arrastres++;
    $('soltar').hidden = false;
  });
  window.addEventListener('dragleave', function(ev) {
    if (!conArchivos(ev) || !estado.tour) return;
    if (--arrastres <= 0) { arrastres = 0; $('soltar').hidden = true; }
  });
  window.addEventListener('dragover', function(ev) { if (conArchivos(ev)) ev.preventDefault(); });
  window.addEventListener('drop', function(ev) {
    if (!conArchivos(ev)) return;
    ev.preventDefault();
    arrastres = 0;
    $('soltar').hidden = true;
    if (estado.tour) agregarFotos(Array.prototype.slice.call(ev.dataTransfer.files));
  });

  window.addEventListener('beforeunload', function(ev) {
    if (timerGuardado) guardarYa();
    if (estado.procesando.length) { ev.preventDefault(); ev.returnValue = ''; }
  });

  // ---------------------------------------------------------------------------
  segunHash();
})();
