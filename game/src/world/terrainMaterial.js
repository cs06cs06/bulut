import * as THREE from 'three';

// Stylised splat terrain: hand-painted grass/dirt/rock textures (CC0, OpenGameArt "rubberduck")
// blended by two splat maps, with ploughed-row stripes, golden wheat and anti-tiling.
export function createTerrainMaterial(tex, splatA, splatB, origin, size, outer = false) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.0 });
  mat.name = outer ? 'terrain_outer' : 'terrain';
  const uniforms = {
    tGrass: { value: tex.grass }, tGrassN: { value: tex.grass_n },
    tDirt: { value: tex.dirt }, tDirtN: { value: tex.dirt_n },
    tRock: { value: tex.rock }, tRockN: { value: tex.rock_n },
    tSplatA: { value: splatA }, tSplatB: { value: splatB },
    uOrigin: { value: origin }, uSize: { value: size }, uOuter: { value: outer ? 1 : 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNor = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNor;
uniform sampler2D tGrass, tGrassN, tDirt, tDirtN, tRock, tRockN, tSplatA, tSplatB;
uniform float uOrigin, uSize, uOuter;
float th(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }
float fbm3(vec2 p){ return vnoise(p)*0.55 + vnoise(p*2.03+7.1)*0.3 + vnoise(p*4.1-3.3)*0.15; }
// two rotated, differently scaled taps blended by noise → hides tiling
vec4 tex2(sampler2D t, vec2 uv, float m){
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.43 + 0.37;
  return mix(texture2D(t, uv), texture2D(t, uv2), m);
}
`)
      .replace('#include <map_fragment>', `
vec2 wuv = vWPos.xz;
vec2 suv = (vWPos.xz - uOrigin) / uSize;
bool inside = suv.x > 0.0 && suv.y > 0.0 && suv.x < 1.0 && suv.y < 1.0;
vec4 sA = texture2D(tSplatA, suv);
vec4 sB = texture2D(tSplatB, suv);
float macro = fbm3(wuv * 0.004);
float mid = fbm3(wuv * 0.03);
if (uOuter > 0.5 || !inside) {
  // procedural fields for the horizon
  float cell = vnoise(floor(wuv / 260.0 + vec2(fbm3(wuv*0.003)*1.5)) * 1.7);
  float slope = 1.0 - vWNor.y;
  float farm = 1.0 - smoothstep(0.06, 0.12, slope);
  sA = vec4(0.0, smoothstep(0.16, 0.3, slope), cell < 0.45 ? farm : 0.0, (cell > 0.7 && cell < 0.85) ? farm : 0.0);
  sB = vec4((cell >= 0.45 && cell < 0.7) ? farm : 0.0, cell, 0.0, 0.0);
}
float m = smoothstep(0.35, 0.65, mid);
float dist = length(vWPos - cameraPosition);
float detailFade = 1.0 - smoothstep(60.0, 450.0, dist);

// textures only provide luminance detail; colour comes from a calibrated stylised palette
vec3 tG = tex2(tGrass, wuv * 0.11, m).rgb, tD = tex2(tDirt, wuv * 0.09, m).rgb, tR = tex2(tRock, wuv * 0.06, m).rgb;
tR = mix(tR, texture2D(tRock, vec2(wuv.x + vWPos.y, vWPos.y) * 0.05).rgb, smoothstep(0.5, 0.9, abs(vWNor.x)));
tR = mix(tR, texture2D(tRock, vec2(wuv.y + vWPos.y, vWPos.y) * 0.05).rgb, smoothstep(0.5, 0.9, abs(vWNor.z)));
vec3 rG = tG / vec3(0.265, 0.490, 0.168), rD = tD / vec3(0.366, 0.279, 0.184), rR = tR / vec3(0.223);
float lG = pow(dot(rG, vec3(0.2126, 0.7152, 0.0722)), 1.25);
float lD = pow(dot(rD, vec3(0.2126, 0.7152, 0.0722)), 1.15);
float lR = dot(rR, vec3(0.333));
lG = mix(1.0, lG, detailFade * 0.85 + 0.15); lD = mix(1.0, lD, detailFade * 0.85 + 0.15);
vec3 grass = vec3(0.115, 0.19, 0.045) * mix(vec3(lG), rG, 0.18);
grass = mix(grass, vec3(0.30, 0.26, 0.085) * lG, smoothstep(0.5, 0.82, macro) * 0.6);   // dry patches
grass *= mix(0.85, 1.12, mid);
vec3 dirt = vec3(0.40, 0.27, 0.14) * mix(vec3(lD), rD, 0.3);
vec3 rock = vec3(0.16, 0.148, 0.132) * lR;
vec3 grassLum = vec3(lG);
// field rows
float ang = sB.g * 3.14159;
vec2 rd = vec2(cos(ang), sin(ang));
float rows = sin(dot(vWPos.xz, rd) * 6.2831 / 1.7);
float rowsFine = mix(rows, 0.0, 1.0 - detailFade);
float hueVar = th(floor(vec2(sB.g * 97.0)));

vec3 wheat = grassLum * vec3(0.62, 0.40, 0.10) * mix(0.9, 1.1, hueVar);
wheat = mix(wheat, wheat * vec3(1.1, 0.9, 0.62), smoothstep(0.3, 0.8, mid) * 0.5);
wheat *= 1.0 + rowsFine * 0.06;
vec3 green = grassLum * vec3(0.12, 0.25, 0.035) * mix(0.88, 1.12, hueVar);
green *= 1.0 + rowsFine * 0.12;
vec3 plowed = vec3(0.17, 0.09, 0.048) * lD * mix(0.85, 1.12, hueVar);
plowed *= 1.0 + rowsFine * 0.28;
vec3 fallow = grassLum * vec3(0.42, 0.33, 0.14);

vec3 col = grass;
col = mix(col, wheat, sA.b);
col = mix(col, green, sB.r);
col = mix(col, plowed, sA.a);
col = mix(col, fallow, sB.a);
col = mix(col, dirt * vec3(0.85, 0.82, 0.8), sB.b);
col = mix(col, rock, sA.g);
col = mix(col, dirt, sA.r);
col *= mix(0.92, 1.06, macro);
diffuseColor.rgb *= col;
`)
      .replace('#include <normal_fragment_maps>', `
{
  vec3 nG = tex2(tGrassN, wuv * 0.11, m).xyz * 2.0 - 1.0;
  vec3 nD = tex2(tDirtN, wuv * 0.09, m).xyz * 2.0 - 1.0;
  vec3 nR = tex2(tRockN, wuv * 0.06, m).xyz * 2.0 - 1.0;
  vec3 tn = nG;
  tn = mix(tn, nD, max(sA.r, sA.a));
  tn = mix(tn, nR, sA.g);
  tn.xy *= detailFade * 0.9;
  tn.x += rowsFine * 0.22 * (sA.a + sB.r * 0.5) * rd.x;
  tn.y += rowsFine * 0.22 * (sA.a + sB.r * 0.5) * rd.y;
  vec3 N = normalize(vWNor);
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
  vec3 B = normalize(cross(T, N));
  vec3 wn = normalize(T * tn.x + B * tn.y + N * max(tn.z, 0.2));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
roughnessFactor = mix(roughnessFactor, 0.8, sA.g);
`);
  };
  mat.customProgramCacheKey = () => 'terrain_v1';
  return mat;
}
