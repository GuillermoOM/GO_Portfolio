import * as THREE from "three";
import { size, min_zoom } from "./constants.js";

export const iconMaterial = new THREE.ShaderMaterial({
  transparent: true,
  vertexShader: `
    varying vec3 vColor;
    void main() {
      vColor = instanceColor;
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    void main() { 
      if (vColor.x == 0.0 && vColor.y == 0.0 && vColor.z == 0.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      } else {
        gl_FragColor = vec4(vColor.x, vColor.y, vColor.z, 1.0);
      }
    }
  `,
});

export const CRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      float scanline = sin(uv.y * 800.0 * 3.14159) * 0.04;
      float shift = 0.0008; // Reduced chromatic aberration
      vec4 color;
      color.r = texture2D(tDiffuse, vec2(uv.x + shift, uv.y)).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, vec2(uv.x - shift, uv.y)).b;
      color.a = texture2D(tDiffuse, uv).a;
      float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
      vignette = clamp(pow(16.0 * vignette, 0.1), 0.0, 1.0);
      gl_FragColor = vec4(color.rgb * vignette - scanline, color.a);
    }
  `,
};

export function getMapMaterial(map_heightMap) {
  return new THREE.ShaderMaterial({
    uniforms: {
      bumpTexture: { value: map_heightMap },
      bumpScale: { value: 100 },
      selection: { value: false },
      highlight_zone: { value: new THREE.Vector2(0.0, 0.0) },
      zone: { value: new THREE.Vector2(0.0, 0.0) },
      current_range: { value: size },
      zoom: { value: min_zoom },
    },
    vertexShader: `
      uniform sampler2D bumpTexture;
      uniform float bumpScale;
      uniform float zoom;
      varying float vAmount;
      varying vec2 vUV;
      varying vec4 pos;
      void main() {
          vUV = uv;
          vec4 bumpData = texture2D(bumpTexture, uv);
          vAmount = bumpData.r;
          vec3 newPosition = position + normal * bumpScale * vAmount;
          pos = vec4(newPosition, 1.0);
          gl_PointSize = zoom;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
      `,
    fragmentShader: `
      uniform float current_range;
      uniform bool selection;
      uniform vec2 zone;
      uniform vec2 highlight_zone;
      varying vec2 vUV;
      varying float vAmount;
      varying vec4 pos;
      void main() {
          float length = 100.0;
          float border = 3.0;
          if (selection){
            if ((pos.x > (highlight_zone.x - length - border) && pos.x < (highlight_zone.x + length + border)) && (pos.y > (highlight_zone.y - length - border) && pos.y < (highlight_zone.y + length + border))){
              if ((pos.x > (highlight_zone.x - length + border) && pos.x < (highlight_zone.x + length - border)) && (pos.y > (highlight_zone.y - length + border) && pos.y < (highlight_zone.y + length - border))) {
                gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
              } else {
                gl_FragColor = vec4(0.8,0.8,1.0, 1.0);
              }
            } else {
              if ((pos.x > (zone.x - current_range) && pos.x < (zone.x + current_range)) && (pos.y > (zone.y - current_range) && pos.y < (zone.y + current_range))) {
                gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
              } else {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
              }
            }
          } else {
              if ((pos.x > (zone.x - current_range) && pos.x < (zone.x + current_range)) && (pos.y > (zone.y - current_range) && pos.y < (zone.y + current_range))) {
                gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
              } else {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
              }
          }
      }
      `,
    wireframe: false,
  });
}
