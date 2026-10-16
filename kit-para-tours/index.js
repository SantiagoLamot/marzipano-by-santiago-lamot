/*
 * index.js para exports del Marzipano Tool — versión "caminar" (estilo Matterport).
 *
 * Basado en el index.js original del Marzipano Tool (Copyright 2016 Google Inc.,
 * Apache License 2.0). Modificado por Santiago Lamot, 2026.
 *
 * Reemplaza el index.js de cualquier export del Tool. Requiere vendor/marzipano.js
 * compilado desde el fork (trae Viewer#walkTo).
 *
 * Mejoras:
 *  - Transición "caminar": gira hacia el destino y avanza con zoom geométrico +
 *    fundido cruzado + desenfoque de movimiento, llegando con la misma dirección.
 *  - Orientación automática de llegada usando el hotspot de vuelta (o "north"
 *    opcional por escena en data.js).
 *  - Hotspots de enlace como discos apoyados en el piso (tipo Matterport).
 *  - Cursor-disco que sigue al mouse sobre el piso; click en el piso camina al
 *    punto de enlace más cercano en esa dirección.
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA || window.data;

  // ---------------------------------------------------------------------------
  // Ajustes de la experiencia (se pueden sobreescribir con data.settings.walk)
  // ---------------------------------------------------------------------------
  var WALK = Object.assign({
    zoom: 1.9,              // cuánto "avanza" la cámara en cada paso
    walkDuration: 1100,     // ms del desplazamiento
    motionBlur: 2.5,        // px de desenfoque máximo (0 = sin)
    lookPitchFactor: 0.3,   // cuánto mira hacia abajo al avanzar
    floorHotspots: true,    // hotspots como disco en el piso
    floorPitch: 0.12,       // pitch > esto = hotspot en el piso (en Marzipano pitch>0 mira abajo)
    floorCursor: true,      // disco que sigue al mouse en el piso
    clickFloorToWalk: true, // click en el piso -> camina al enlace más cercano
    clickMaxAngle: 0.45     // rad: tolerancia para asociar el click a un enlace
  }, (data.settings && data.settings.walk) || {});

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  var isTouch = false;
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    isTouch = true;
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
    hideFloorCursor();
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser && bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  if (typeof viewer.walkTo !== 'function') {
    console.warn('[walk] vendor/marzipano.js no es la versión con walkTo: se usa fundido.');
  }

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var source, geometry, limiter;

    if (data.equirect) {
      // Extensión opcional: panorama equirectangular único.
      source = Marzipano.ImageUrlSource.fromString(data.equirect);
      geometry = new Marzipano.EquirectGeometry([{ width: data.equirectWidth || 4096 }]);
      limiter = Marzipano.RectilinearView.limit.traditional(
        (data.equirectWidth || 4096) / 4, 100*Math.PI/180, 120*Math.PI/180);
    } else {
      // Formato estándar del Marzipano Tool (cubos en tiles/).
      var urlPrefix = "tiles";
      source = Marzipano.ImageUrlSource.fromString(
        urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
        { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
      geometry = new Marzipano.CubeGeometry(data.levels);
      limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    }

    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var onFloor = WALK.floorHotspots && hotspot.pitch > WALK.floorPitch;
      var element = onFloor ? createFloorHotspotElement(hotspot) : createLinkHotspotElement(hotspot);
      var opts = onFloor ? { perspective: floorPerspective(hotspot.pitch) } : undefined;
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch }, opts);
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  var currentScene = null;
  var walking = false;

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull && screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', toggleSceneList);

  // Start with the scene list open on desktop.
  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    if (!el) { return; }
    el.addEventListener('click', function() {
      goToScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  if (viewUpElement) {
    controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
    controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
    controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
    controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
    controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
    controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);
  }

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  // ---------------------------------------------------------------------------
  // Navegación
  // ---------------------------------------------------------------------------

  // Cambio directo (primera escena o sin dirección conocida): fundido suave.
  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo({ transitionDuration: 700 });
    afterSceneChange(scene);
  }

  // Desde la lista de escenas: si hay enlace directo, camina; si no, fundido.
  function goToScene(scene) {
    if (!currentScene || scene === currentScene) { return switchScene(scene); }
    var link = findLink(currentScene, scene.data.id);
    if (link) { return walkToScene(scene, link); }
    switchScene(scene);
  }

  // Camina desde la escena actual hacia `target` por el enlace `link`.
  function walkToScene(target, link) {
    if (walking) { return; }
    if (typeof viewer.walkTo !== 'function' || !currentScene) {
      return switchScene(target);
    }
    stopAutorotate();
    hideFloorCursor();
    walking = true;
    document.body.classList.add('walking');

    viewer.walkTo(target.scene, {
      yaw: link.yaw,
      pitch: link.pitch,
      arrivalYaw: computeArrivalYaw(currentScene, target, link),
      arrivalPitch: 0,
      zoom: WALK.zoom,
      walkDuration: WALK.walkDuration,
      motionBlur: WALK.motionBlur,
      lookPitchFactor: WALK.lookPitchFactor
    }, function() {
      walking = false;
      document.body.classList.remove('walking');
      startAutorotate();
    });
    afterSceneChange(target);
  }

  // Dirección con la que se llega a la escena nueva (en sus coordenadas).
  //  1. Si ambas escenas tienen "north" en data.js, se usa eso.
  //  2. Si el destino tiene un hotspot de vuelta, se mira en sentido opuesto.
  //  3. Si no, se usa la vista inicial del destino.
  function computeArrivalYaw(from, to, link) {
    var yaw = Marzipano.walk.arrivalYaw(link.yaw, {
      fromNorth: from.data.north,
      toNorth: to.data.north,
      returnYaw: (findLink(to, from.data.id) || {}).yaw
    });
    return yaw != null ? yaw : to.data.initialViewParameters.yaw;
  }

  function afterSceneChange(scene) {
    currentScene = scene;
    updateSceneName(scene);
    updateSceneList(scene);
    if (!walking) { startAutorotate(); }
  }

  function findLink(scene, targetId) {
    var list = scene.data.linkHotspots;
    for (var i = 0; i < list.length; i++) {
      if (list[i].target === targetId) { return list[i]; }
    }
    return null;
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  // ---------------------------------------------------------------------------
  // Hotspots
  // ---------------------------------------------------------------------------

  // Transformación para que un hotspot embebido quede apoyado en el piso.
  function floorPerspective(pitch) {
    var tilt = (Math.PI / 2 - pitch) * 180 / Math.PI;
    return { radius: 1000, extraTransforms: 'rotateX(' + tilt.toFixed(2) + 'deg)' };
  }

  function createFloorHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot', 'floor-hotspot');

    var disc = document.createElement('div');
    disc.classList.add('floor-hotspot-disc');
    wrapper.appendChild(disc);

    var tooltip = document.createElement('div');
    tooltip.classList.add('floor-hotspot-tooltip');
    var target = findSceneDataById(hotspot.target);
    tooltip.innerHTML = target ? sanitize(target.name) : '';
    wrapper.appendChild(tooltip);

    wrapper.addEventListener('click', function(e) {
      e.stopPropagation();
      var scene = findSceneById(hotspot.target);
      if (scene) { walkToScene(scene, hotspot); }
    });
    wrapper.addEventListener('mouseenter', hideFloorCursor);

    stopTouchAndScrollEventPropagation(wrapper);
    return wrapper;
  }

  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create image element.
    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      var scene = findSceneById(hotspot.target);
      if (scene) { walkToScene(scene, hotspot); }
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    var target = findSceneDataById(hotspot.target);
    tooltip.innerHTML = target ? target.name : '';

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    // Create image element.
    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Create close element.
    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    // Construct header element.
    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    // Place header and text into wrapper element.
    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
    };

    // Show content when hotspot is clicked.
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);

    // Hide content when close icon is clicked.
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    wrapper.addEventListener('mouseenter', hideFloorCursor);

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // ---------------------------------------------------------------------------
  // Cursor en el piso + click para caminar
  // ---------------------------------------------------------------------------
  var cursorEl = document.createElement('div');
  cursorEl.className = 'floor-cursor';
  cursorEl.innerHTML = '<div class="floor-cursor-disc"></div>';

  function hideFloorCursor() {
    cursorEl.classList.remove('visible');
  }

  function screenCoords(e) {
    var rect = panoElement.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function angularDistance(a, b) {
    var ca = Math.cos(a.pitch), cb = Math.cos(b.pitch);
    var va = [ca * Math.sin(a.yaw), Math.sin(a.pitch), ca * Math.cos(a.yaw)];
    var vb = [cb * Math.sin(b.yaw), Math.sin(b.pitch), cb * Math.cos(b.yaw)];
    var dot = va[0]*vb[0] + va[1]*vb[1] + va[2]*vb[2];
    return Math.acos(Math.max(-1, Math.min(1, dot)));
  }

  // Enlace más cercano (en ángulo) a la posición clickeada.
  function nearestLink(coords) {
    var best = null, bestDist = Infinity;
    currentScene.data.linkHotspots.forEach(function(h) {
      var d = Math.abs(Marzipano.walk.normalizeAngle(h.yaw - coords.yaw));
      // En el piso importa sobre todo la dirección (yaw).
      var dist = coords.pitch > WALK.floorPitch ? d : angularDistance(h, coords);
      if (dist < bestDist) { best = h; bestDist = dist; }
    });
    return bestDist <= WALK.clickMaxAngle ? best : null;
  }

  var cursorHotspot = null;
  var cursorScene = null;

  function placeCursor(coords) {
    if (!WALK.floorCursor || isTouch || walking || !currentScene) { return hideFloorCursor(); }
    if (coords.pitch <= WALK.floorPitch) { return hideFloorCursor(); }
    var container = currentScene.scene.hotspotContainer();
    if (cursorScene !== currentScene) {
      if (cursorHotspot && cursorScene) {
        try { cursorScene.scene.hotspotContainer().destroyHotspot(cursorHotspot); } catch (err) {}
      }
      cursorHotspot = container.createHotspot(cursorEl, coords, { perspective: floorPerspective(coords.pitch) });
      cursorScene = currentScene;
    } else {
      cursorHotspot.setPosition(coords);
      cursorHotspot.setPerspective(floorPerspective(coords.pitch));
    }
    cursorEl.classList.add('visible');
    cursorEl.classList.toggle('active', !!nearestLink(coords));
  }

  var downPos = null;
  panoElement.addEventListener('pointerdown', function(e) {
    downPos = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  panoElement.addEventListener('pointermove', function(e) {
    if (e.pointerType === 'touch' || !currentScene) { return; }
    if (e.buttons) { return hideFloorCursor(); }
    placeCursor(currentScene.view.screenToCoordinates(screenCoords(e)));
  });
  panoElement.addEventListener('pointerleave', hideFloorCursor);
  panoElement.addEventListener('pointerup', function(e) {
    if (!WALK.clickFloorToWalk || !downPos || walking || !currentScene) { return; }
    var moved = Math.abs(e.clientX - downPos.x) + Math.abs(e.clientY - downPos.y);
    var quick = Date.now() - downPos.t < 400;
    downPos = null;
    if (moved > 6 || !quick) { return; }
    var coords = currentScene.view.screenToCoordinates(screenCoords(e));
    var link = nearestLink(coords);
    if (link) {
      var scene = findSceneById(link.target);
      if (scene) { walkToScene(scene, link); }
    }
  });

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element) {
    var eventList = [
      'touchstart', 'touchmove', 'touchend', 'touchcancel',
      'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
      'wheel'
    ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // Exponer para depurar desde la consola.
  window.tour = { viewer: viewer, scenes: scenes, walkToScene: walkToScene, findLink: findLink,
    current: function() { return currentScene; } };

  // Display the initial scene.
  switchScene(scenes[0]);

})();
