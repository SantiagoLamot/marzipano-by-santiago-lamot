/*
 * Copyright 2026 Santiago Lamot. Modificación sobre Marzipano (Google Inc.).
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

/*
 * Transición "caminar" (estilo Matterport) entre escenas.
 *
 * Sin datos de profundidad no hay paralaje real, así que se imita con lo que
 * sí es geométricamente correcto en la dirección de marcha:
 *
 *  1. Girar:   la vista actual rota suavemente hacia el punto de destino.
 *  2. Avanzar: la escena vieja se "acerca" (cierra el FOV) mientras la nueva,
 *     que está más adelante, arranca más abierta y se va cerrando hasta su FOV
 *     normal. Las dos escalas coinciden en cada cuadro (escalado por tan(fov/2)),
 *     así que el fundido cruzado no "salta": se siente como desplazarse.
 *  3. Llegar:  la escena nueva queda mirando en la misma dirección de marcha,
 *     con un leve desenfoque de movimiento durante el trayecto.
 */

var Viewer = require('./Viewer');
var Scene = require('./Scene');
var tween = require('./util/tween');
var noop = require('./util/noop');

var TWO_PI = 2 * Math.PI;

function normalizeAngle(a) {
  a = a % TWO_PI;
  if (a > Math.PI) { a -= TWO_PI; }
  if (a < -Math.PI) { a += TWO_PI; }
  return a;
}

function shortestDelta(from, to) {
  return normalizeAngle(to - from);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function clamp01(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }

function smoothstep(e0, e1, t) {
  t = clamp01((t - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

var easings = {
  linear: function(t) { return t; },
  easeInOutCubic: function(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },
  easeInOutSine: function(t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
  // Arranque suave (como dar un paso) y frenado más largo al llegar.
  walk: function(t) {
    return -(Math.cos(Math.PI * Math.pow(t, 0.85)) - 1) / 2;
  }
};

// FOV escalado por un factor de magnificación m (en espacio tan(fov/2)).
function scaleFov(fov, m) {
  return 2 * Math.atan(Math.tan(fov / 2) / m);
}

function viewOf(scene) {
  return scene.view();
}

function isRectilinear(view) {
  return typeof view.yaw === 'function' && typeof view.fov === 'function';
}

/**
 * Camina hacia otra escena con una transición estilo Matterport.
 *
 * @param {Scene} newScene Escena de destino.
 * @param {Object} opts
 * @param {number} opts.yaw Yaw (en la escena actual) hacia donde se camina,
 *     normalmente el yaw del hotspot clickeado.
 * @param {number} [opts.pitch=0] Pitch del hotspot en la escena actual.
 * @param {number} [opts.arrivalYaw=opts.yaw] Yaw con el que se llega a la
 *     escena nueva (misma dirección de marcha, en coordenadas de esa escena).
 * @param {number} [opts.arrivalPitch=0] Pitch al llegar.
 * @param {number} [opts.arrivalFov] FOV al llegar (por defecto el actual).
 * @param {number} [opts.lookPitchFactor=0.3] Cuánto se inclina la mirada hacia
 *     el hotspot al avanzar (0 = mirar al horizonte).
 * @param {number} [opts.zoom=1.9] Cuánto "avanza" visualmente la cámara
 *     (magnificación). Más alto = pasos más largos.
 * @param {number} [opts.turnDuration] ms para girar. Por defecto depende del
 *     ángulo a girar (0 si ya se está mirando al destino).
 * @param {number} [opts.walkDuration=1100] ms del desplazamiento.
 * @param {number} [opts.motionBlur=2.5] px máximos de desenfoque (0 = sin).
 * @param {boolean} [opts.disableControls=true] Bloquear controles al caminar.
 * @param {function} [done]
 * @return {function} Función para cancelar la transición.
 */
Viewer.prototype.walkTo = function(newScene, opts, done) {
  var self = this;
  opts = opts || {};
  done = done || noop;

  // Cancelar una caminata en curso.
  if (this._cancelWalk) {
    this._cancelWalk();
  }

  var oldScene = this.scene();
  if (!oldScene || oldScene === newScene) {
    this.switchScene(newScene, opts, done);
    return noop;
  }

  var oldView = viewOf(oldScene);
  var newView = viewOf(newScene);
  if (!isRectilinear(oldView) || !isRectilinear(newView)) {
    this.switchScene(newScene, opts, done);
    return noop;
  }

  var targetYaw = opts.yaw != null ? opts.yaw : oldView.yaw();
  var targetPitch = opts.pitch != null ? opts.pitch : 0;
  var lookPitchFactor = opts.lookPitchFactor != null ? opts.lookPitchFactor : 0.3;
  var lookPitch = targetPitch * lookPitchFactor;
  var arrivalYaw = opts.arrivalYaw != null ? opts.arrivalYaw : targetYaw;
  var arrivalPitch = opts.arrivalPitch != null ? opts.arrivalPitch : 0;
  var zoom = opts.zoom != null ? opts.zoom : 1.9;
  var walkDuration = opts.walkDuration != null ? opts.walkDuration : 1100;
  var maxBlur = opts.motionBlur != null ? opts.motionBlur : 2.5;
  var disableControls = opts.disableControls !== false;

  var startYaw = oldView.yaw();
  var startPitch = oldView.pitch();
  var startFov = oldView.fov();
  var arrivalFov = opts.arrivalFov != null ? opts.arrivalFov : startFov;

  var dYaw = shortestDelta(startYaw, targetYaw);
  var dPitch = lookPitch - startPitch;
  var angle = Math.sqrt(dYaw * dYaw + dPitch * dPitch);
  var turnDuration = opts.turnDuration != null ? opts.turnDuration :
      (angle < 0.03 ? 0 : Math.round(260 + 520 * Math.min(angle / Math.PI, 1)));

  var canvas = this.stage().domElement();
  var cancelled = false;
  var cancelTurn = null;
  var cancelWalkTween = null;

  // Quitar limitadores durante la transición para que el FOV no se recorte y
  // las escalas de ambas escenas coincidan.
  var oldLimiter = oldView.limiter();
  var newLimiter = newView.limiter();

  var controls = this.controls();
  var controlsWereEnabled = controls.enabled();

  function setBlur(px) {
    if (!maxBlur) { return; }
    canvas.style.filter = px > 0.05 ? 'blur(' + px.toFixed(2) + 'px)' : '';
  }

  function cleanup() {
    setBlur(0);
    oldView.setLimiter(oldLimiter);
    newView.setLimiter(newLimiter);
    // Reaplicar el limitador a la vista final.
    newView.setParameters({
      yaw: newView.yaw(), pitch: newView.pitch(), fov: newView.fov()
    });
    newScene.hotspotContainer().domElement().style.opacity = '';
    if (disableControls && controlsWereEnabled) { controls.enable(); }
    self._cancelWalk = null;
    self.emit('walkEnd', newScene, oldScene);
  }

  function cancel() {
    if (cancelled) { return; }
    cancelled = true;
    if (cancelTurn) { cancelTurn(); }
    if (cancelWalkTween) { cancelWalkTween(); }
    cleanup();
  }
  this._cancelWalk = cancel;

  if (disableControls) { controls.disable(); }
  this.stopMovement();
  this.emit('walkStart', newScene, oldScene);

  // --- Fase 1: girar hacia el destino ---------------------------------------
  function turn(next) {
    if (turnDuration <= 0) {
      oldView.setParameters({ yaw: targetYaw, pitch: lookPitch });
      next();
      return;
    }
    var ease = easings.easeInOutCubic;
    cancelTurn = tween(turnDuration, function(t) {
      var e = ease(t);
      oldView.setParameters({
        yaw: normalizeAngle(startYaw + dYaw * e),
        pitch: startPitch + dPitch * e
      });
    }, function() {
      cancelTurn = null;
      if (!cancelled) { next(); }
    });
  }

  // --- Fase 2: avanzar -------------------------------------------------------
  function walk() {
    oldView.setLimiter(null);
    newView.setLimiter(null);

    var ease = easings.walk;
    var fovOld0 = oldView.fov();

    // La escena nueva arranca como se vería desde el punto anterior:
    // misma dirección, más "lejos" (FOV más abierto por el factor zoom).
    newView.setParameters({
      yaw: arrivalYaw,
      pitch: lookPitch,
      fov: scaleFov(arrivalFov, 1 / zoom)
    });

    var newHotspots = newScene.hotspotContainer().domElement();

    var update = function(t, scene, prevScene) {
      var e = ease(t);
      var m = lerp(1, zoom, e); // magnificación acumulada

      // Vieja: avanza (se amplía) y termina de apuntar al horizonte de llegada.
      prevScene.view().setParameters({
        yaw: targetYaw,
        pitch: lookPitch,
        fov: scaleFov(fovOld0, m)
      });

      // Nueva: misma escala relativa, termina en su FOV normal.
      scene.view().setParameters({
        yaw: arrivalYaw,
        pitch: lerp(lookPitch, arrivalPitch, smoothstep(0.35, 1, t)),
        fov: scaleFov(arrivalFov, m / zoom)
      });

      // Fundido cruzado centrado en el medio del trayecto.
      scene.layer().setEffects({ opacity: smoothstep(0.3, 0.7, t) });
      newHotspots.style.opacity = smoothstep(0.85, 1, t);

      // Desenfoque de movimiento proporcional a la velocidad.
      setBlur(maxBlur * Math.sin(Math.PI * clamp01(t)) * Math.min(1, 1.3 - 0.3 * t));
    };

    self.switchScene(newScene, {
      transitionDuration: walkDuration,
      transitionUpdate: update
    }, function() {
      // Restaurar opacidad normal de la capa.
      newScene.layer().setEffects({ opacity: 1 });
      if (!cancelled) {
        cancelled = true;
        cleanup();
        done();
      }
    });
  }

  turn(walk);
  return cancel;
};

/**
 * Atajo: `scene.walkTo(opts, done)` camina desde la escena actual hacia esta.
 */
Scene.prototype.walkTo = function(opts, done) {
  return this._viewer.walkTo(this, opts, done);
};

/**
 * Calcula el yaw de llegada a partir del hotspot de "vuelta" en la escena
 * destino (el que apunta a la escena de origen): la dirección de marcha es la
 * opuesta a ese hotspot. Devuelve null si no se puede calcular.
 *
 * @param {number} yaw Yaw del hotspot de ida en la escena de origen.
 * @param {Object} opts
 * @param {number} [opts.returnYaw] Yaw del hotspot de vuelta en el destino.
 * @param {number} [opts.fromNorth] "Norte" (yaw) de la escena de origen.
 * @param {number} [opts.toNorth] "Norte" (yaw) de la escena destino.
 */
function arrivalYaw(yaw, opts) {
  opts = opts || {};
  if (opts.fromNorth != null && opts.toNorth != null) {
    return normalizeAngle(yaw - opts.fromNorth + opts.toNorth);
  }
  if (opts.returnYaw != null) {
    return normalizeAngle(opts.returnYaw + Math.PI);
  }
  return null;
}

module.exports = {
  arrivalYaw: arrivalYaw,
  easings: easings,
  normalizeAngle: normalizeAngle
};
