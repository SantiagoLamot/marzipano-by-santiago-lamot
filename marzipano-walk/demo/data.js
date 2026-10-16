var APP_DATA = {
  "scenes": [
    {
      "id": "0-living",
      "name": "Living",
      "equirect": "panos/0-living.jpg",
      "levels": [
        {
          "tileSize": 512,
          "size": 512,
          "fallbackOnly": true
        }
      ],
      "faceSize": 2048,
      "initialViewParameters": {
        "yaw": 0,
        "pitch": 0,
        "fov": 1.4
      },
      "linkHotspots": [
        {
          "yaw": 0.0,
          "pitch": 0.40489178628508343,
          "rotation": 0,
          "target": "1-centro"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.9,
          "pitch": -0.05,
          "title": "Cuadro",
          "text": "Hotspot de informaci\u00f3n de prueba"
        }
      ]
    },
    {
      "id": "1-centro",
      "name": "Centro",
      "equirect": "panos/1-centro.jpg",
      "levels": [
        {
          "tileSize": 512,
          "size": 512,
          "fallbackOnly": true
        }
      ],
      "faceSize": 2048,
      "initialViewParameters": {
        "yaw": 0,
        "pitch": 0,
        "fov": 1.4
      },
      "linkHotspots": [
        {
          "yaw": -3.141592653589793,
          "pitch": 0.40489178628508343,
          "rotation": 0,
          "target": "0-living"
        },
        {
          "yaw": 0.49934672168012995,
          "pitch": 0.3796814864473165,
          "rotation": 0,
          "target": "2-fondo"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "2-fondo",
      "name": "Fondo",
      "equirect": "panos/2-fondo.jpg",
      "levels": [
        {
          "tileSize": 512,
          "size": 512,
          "fallbackOnly": true
        }
      ],
      "faceSize": 2048,
      "initialViewParameters": {
        "yaw": 0,
        "pitch": 0,
        "fov": 1.4
      },
      "linkHotspots": [
        {
          "yaw": 2.3409393752699232,
          "pitch": 0.3796814864473165,
          "rotation": 0,
          "target": "1-centro"
        }
      ],
      "infoHotspots": []
    }
  ],
  "name": "Demo",
  "settings": {
    "mouseViewMode": "drag",
    "autorotateEnabled": false,
    "fullscreenButton": true,
    "viewControlButtons": false
  }
};
