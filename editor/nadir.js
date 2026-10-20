/*
 * Logo del trípode (nadir): difumina el piso justo debajo de la cámara y pone
 * encima el logo de la inmobiliaria, directamente sobre la foto equirectangular.
 *
 * Se trabaja sobre un plano horizontal debajo de la cámara: un punto del plano a
 * distancia r del centro es la dirección que está a atan(r) del nadir. La parte
 * de arriba del plano es el frente de la foto (yaw 0), así el logo se lee derecho
 * al mirar hacia abajo desde el frente.
 */
'use strict';

(function() {
  var LADO = 1024;        // lado en píxeles del plano donde se arma el parche
  var BORDE = 1.3;        // el difuminado se funde con el piso hasta 1,3 veces el radio
  var MAXIMO = 80 * Math.PI / 180;

  function lienzo(ancho, alto) {
    var c = document.createElement('canvas');
    c.width = ancho;
    c.height = alto || ancho;
    return c;
  }

  // Filas de abajo de la foto que cubren el plano [-R, R] entero, esquinas incluidas.
  function filasDeAbajo(canvas, R) {
    var H = canvas.height;
    var alfa = Math.atan(R * Math.SQRT2);
    var fila0 = Math.max(0, Math.floor(H * (1 - alfa / Math.PI)) - 2);
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    return { ctx: ctx, fila0: fila0, H: H, img: ctx.getImageData(0, fila0, canvas.width, H - fila0) };
  }

  // Vista del plano de lado x lado que cubre [-R, R]. Adentro de "relleno" no se
  // mira el piso (ahí está el trípode): se estira el color del anillo de alrededor.
  function plano(abajo, lado, R, relleno) {
    var img = abajo.img, W = img.width, h = img.height, src = img.data, H = abajo.H;
    var salida = new ImageData(lado, lado), dst = salida.data;
    var p = 0;
    for (var j = 0; j < lado; j++) {
      var fwd = (1 - 2 * (j + 0.5) / lado) * R;
      for (var i = 0; i < lado; i++) {
        var der = (2 * (i + 0.5) / lado - 1) * R;
        var r = Math.sqrt(der * der + fwd * fwd);
        if (r < relleno) r = relleno * 1.04;
        var alfa = Math.atan(r);
        var yaw = Math.atan2(der, fwd);
        var u = (yaw / (2 * Math.PI) + 0.5) * W - 0.5;
        var v = (1 - alfa / Math.PI) * H - 0.5 - abajo.fila0;

        var x0 = Math.floor(u), y0 = Math.floor(v);
        var fx = u - x0, fy = v - y0;
        var xa = ((x0 % W) + W) % W, xb = (xa + 1) % W;
        var ya = y0 < 0 ? 0 : (y0 >= h ? h - 1 : y0);
        var yb = y0 + 1 >= h ? h - 1 : (y0 + 1 < 0 ? 0 : y0 + 1);
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

  // Difumina achicando a la mitad hasta 8 px y volviendo a agrandar de a el doble.
  // Tan chico que adentro del círculo queda una mancha lisa con los colores del piso.
  function difuminar(canvas) {
    var tamanos = [];
    var actual = canvas;
    while (actual.width > 8) {
      var chico = lienzo(actual.width / 2);
      var cctx = chico.getContext('2d');
      cctx.imageSmoothingQuality = 'high';
      cctx.drawImage(actual, 0, 0, chico.width, chico.height);
      tamanos.push(actual.width);
      actual = chico;
    }
    while (tamanos.length) {
      var grande = lienzo(tamanos.pop());
      var gctx = grande.getContext('2d');
      gctx.imageSmoothingQuality = 'high';
      gctx.drawImage(actual, 0, 0, grande.width, grande.height);
      actual = grande;
    }
    return actual;
  }

  // Estampa el parche en la foto (canvas equirectangular). grados: radio del
  // círculo que tapa el trípode. logo puede ser null (solo difumina).
  function aplicar(canvas, logo, grados) {
    var rho = Math.min(grados * Math.PI / 180, MAXIMO / BORDE);
    var alfaMax = rho * BORDE;
    var Rd = Math.tan(rho), Rf = Math.tan(alfaMax);
    var abajo = filasDeAbajo(canvas, Rf);

    // 1. Piso sin el trípode, difuminado.
    var P = lienzo(LADO);
    P.getContext('2d').putImageData(plano(abajo, LADO, Rf, Rd), 0, 0);
    var F = difuminar(P);
    var fctx = F.getContext('2d', { willReadFrequently: true });
    var c = LADO / 2, escala = LADO / (2 * Rf);

    // 2. El logo, entero adentro del círculo.
    if (logo) {
      var diametro = 2 * Rd * escala * 0.92;
      var k = Math.min(diametro / logo.width, diametro / logo.height);
      var lw = logo.width * k, lh = logo.height * k;
      fctx.imageSmoothingQuality = 'high';
      fctx.drawImage(logo, c - lw / 2, c - lh / 2, lw, lh);
    }

    // 3. Opaco hasta el radio y desvanecido suave hasta el borde.
    fctx.globalCompositeOperation = 'destination-in';
    var g = fctx.createRadialGradient(c, c, Rd * escala, c, c, Rf * escala);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.25, 'rgba(0,0,0,0.84)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.5)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    fctx.fillStyle = g;
    fctx.fillRect(0, 0, LADO, LADO);
    var parche = fctx.getImageData(0, 0, LADO, LADO).data;

    // 4. De vuelta a la foto: cada píxel de abajo toma el parche del plano.
    var img = abajo.img, W = img.width, dst = img.data;
    var senos = new Float64Array(W), cosenos = new Float64Array(W);
    for (var x = 0; x < W; x++) {
      var yaw = ((x + 0.5) / W - 0.5) * 2 * Math.PI;
      senos[x] = Math.sin(yaw);
      cosenos[x] = Math.cos(yaw);
    }
    for (var y = 0; y < img.height; y++) {
      var alfa = (1 - (y + abajo.fila0 + 0.5) / abajo.H) * Math.PI;
      if (alfa >= alfaMax) continue;
      var r = Math.tan(alfa) * escala;
      var p = y * W * 4;
      for (x = 0; x < W; x++, p += 4) {
        var u = c + r * senos[x] - 0.5, v = c - r * cosenos[x] - 0.5;
        var x0 = Math.floor(u), y0 = Math.floor(v);
        if (x0 < 0 || y0 < 0 || x0 + 1 >= LADO || y0 + 1 >= LADO) continue;
        var fx = u - x0, fy = v - y0;
        var a = (y0 * LADO + x0) * 4, b = a + 4, cc = a + LADO * 4, d = cc + 4;
        var w1 = (1 - fx) * (1 - fy), w2 = fx * (1 - fy), w3 = (1 - fx) * fy, w4 = fx * fy;
        var op = (parche[a + 3] * w1 + parche[b + 3] * w2 + parche[cc + 3] * w3 + parche[d + 3] * w4) / 255;
        if (op <= 0) continue;
        for (var k2 = 0; k2 < 3; k2++) {
          var col = parche[a + k2] * w1 + parche[b + k2] * w2 + parche[cc + k2] * w3 + parche[d + k2] * w4;
          dst[p + k2] = dst[p + k2] * (1 - op) + col * op;
        }
      }
    }
    abajo.ctx.putImageData(img, 0, abajo.fila0);
    return canvas;
  }

  // Lo que se ve mirando derecho hacia abajo, hasta "grados" desde el nadir.
  function vistaAbajo(canvas, lado, grados) {
    var R = Math.tan(grados * Math.PI / 180);
    var vista = lienzo(lado);
    vista.getContext('2d').putImageData(plano(filasDeAbajo(canvas, R), lado, R, 0), 0, 0);
    return vista;
  }

  window.Nadir = { aplicar: aplicar, vistaAbajo: vistaAbajo };
})();
