// Football kit painter: region masks in bind-pose space drive colour, roughness, cloth inflation and decals.
import * as THREE from 'three';

export const KITS = {
  home: { jersey: 0xc8102e, jerseyAlt: 0xa50d25, trim: 0xffffff, shorts: 0xf4f4f4, shortsTrim: 0xc8102e, sock: 0xc8102e, sockTrim: 0xffffff, boot: 0x0c0c0e, bootAccent: 0xffd400, style: 1, number: '10', name: 'BULUT' , skin: 1.0, hair: 0x1a120c },
  away: { jersey: 0x0d3b8e, jerseyAlt: 0x0a2f74, trim: 0xf2c400, shorts: 0x0a2258, shortsTrim: 0xf2c400, sock: 0x0d3b8e, sockTrim: 0xf2c400, boot: 0xf2f2f2, bootAccent: 0x0d3b8e, style: 2, number: '9', name: 'RAKİP', skin: 0.86, hair: 0x2b1b10 },
  gkHome: { jersey: 0x8bd10a, jerseyAlt: 0x77b508, trim: 0x111111, shorts: 0x111111, shortsTrim: 0x8bd10a, sock: 0x111111, sockTrim: 0x8bd10a, boot: 0x14141a, bootAccent: 0x8bd10a, style: 3, number: '1', name: 'ELDİVEN', glove: 0x1b1b22, gloveAccent: 0x8bd10a, skin: 0.95, hair: 0x3a2618 },
  gkAway: { jersey: 0xff6a00, jerseyAlt: 0xd95a00, trim: 0x101010, shorts: 0x101010, shortsTrim: 0xff6a00, sock: 0x101010, sockTrim: 0xff6a00, boot: 0x14141a, bootAccent: 0xff6a00, style: 3, number: '1', name: 'KALECİ', glove: 0x1b1b22, gloveAccent: 0xff6a00, skin: 0.8, hair: 0x120c08 },
};

export function makeKitDecalTexture(kit) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 512);
  const col = '#' + new THREE.Color(kit.trim).getHexString();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // back (left half): name + number
  g.fillStyle = col;
  g.font = '700 46px "Barlow Condensed", Arial Narrow, sans-serif';
  g.fillText(kit.name, 256, 78);
  g.font = '800 250px "Barlow Condensed", Arial Narrow, sans-serif';
  g.fillText(kit.number, 256, 290);
  // front (right half): sponsor text + crest
  g.font = '800 92px "Barlow Condensed", Arial Narrow, sans-serif';
  g.fillText('BULUT', 768, 250);
  g.font = '600 26px "Barlow Condensed", Arial Narrow, sans-serif';
  g.fillText('P E N A L T I   K U P A S I', 768, 312);
  // crest (left chest, in image right-half left area)
  g.beginPath(); g.arc(880, 110, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#' + new THREE.Color(kit.jersey).getHexString();
  g.beginPath(); g.arc(880, 110, 24, 0, Math.PI * 2); g.fill();
  g.fillStyle = col;
  g.beginPath(); g.arc(880, 110, 11, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
  return t;
}

const MASKS_GLSL = /* glsl */`
float k_segT(vec3 p, vec3 a, vec3 b, out float d){ vec3 ab=b-a; float t=clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0); d=length(p-(a+ab*t)); return t; }
float k_neckSkin(vec3 p, float off){
  float ax=abs(p.x);
  float r=length(p.xz-vec2(0.0,-0.03));
  float vn = step(0.015,p.z) * step(1.43 + ax - off*1.6, p.y) * step(ax, 0.075+off);
  float nk = step(1.492 - off, p.y) * step(r, 0.079 + off);
  return max(vn, nk);
}
// e = edge softness
void kitMasks(vec3 p, float e, out float jersey, out float armSkin, out float shorts, out float sock, out float boot){
  float ax = abs(p.x);
  vec3 q = vec3(ax, p.y, p.z);
  float dU; float tU = k_segT(q, vec3(0.166,1.503,-0.038), vec3(0.31,1.258,-0.06), dU);
  float dF; float tF = k_segT(q, vec3(0.31,1.258,-0.06), vec3(0.45,1.069,0.031), dF);
  float inArm = 1.0 - smoothstep(0.066, 0.080, min(dU, dF));
  float nearU = step(dU, dF + 0.004);
  float sleeve = (1.0 - smoothstep(0.49 - e*4.0, 0.49 + e*4.0, tU)) * nearU;
  armSkin = inArm * (1.0 - sleeve);
  float hem = smoothstep(0.985 - e, 0.985 + e, p.y);
  jersey = hem * (1.0 - armSkin);
  shorts = (1.0 - hem) * smoothstep(0.665 - e, 0.665 + e, p.y);
  sock = smoothstep(0.100 - e, 0.100 + e, p.y + max(0.0, p.z - 0.03) * 0.35) * (1.0 - smoothstep(0.500 - e, 0.500 + e, p.y));
  boot = 1.0 - smoothstep(0.100 - e, 0.100 + e, p.y + max(0.0, p.z - 0.03) * 0.35);
  sock *= 1.0 - boot;
}
`;

export function createBodyMaterial(kit, { decalTex, clothNormal, skinColor }) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.6, metalness: 0.0,
    normalMap: clothNormal, normalScale: new THREE.Vector2(0.9, 0.9),
    sheen: 0.5, sheenRoughness: 0.55, sheenColor: new THREE.Color(0.22, 0.22, 0.22),
  });
  const C = h => new THREE.Color(h);
  const u = {
    uSkin: { value: skinColor.clone() },
    uJersey: { value: C(kit.jersey) }, uJerseyAlt: { value: C(kit.jerseyAlt) }, uTrim: { value: C(kit.trim) },
    uShorts: { value: C(kit.shorts) }, uShortsTrim: { value: C(kit.shortsTrim) },
    uSock: { value: C(kit.sock) }, uSockTrim: { value: C(kit.sockTrim) },
    uBoot: { value: C(kit.boot) }, uBootAccent: { value: C(kit.bootAccent) },
    uStyle: { value: kit.style }, uDecal: { value: decalTex },
  };
  mat.userData.uniforms = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBind;\n${MASKS_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBind = position;
        {
          float j,a,s,so,b; kitMasks(position, 0.02, j,a,s,so,b);
          float infl = j * (0.011 + 0.006 * (1.0 - smoothstep(0.985, 1.16, position.y)))
                     + s * (0.016 + 0.014 * (1.0 - smoothstep(0.665, 0.80, position.y)))
                     + so * 0.004 + b * 0.006;
          transformed += normalize(normal) * infl;
        }`);
    let fs = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBind;
        uniform vec3 uSkin, uJersey, uJerseyAlt, uTrim, uShorts, uShortsTrim, uSock, uSockTrim, uBoot, uBootAccent;
        uniform float uStyle; uniform sampler2D uDecal;
        float g_cloth = 0.0; float g_boot = 0.0;
        ${MASKS_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 p = vBind; float ax = abs(p.x);
          float jersey, armSkin, shorts, sock, boot; kitMasks(p, 0.004, jersey, armSkin, shorts, sock, boot);
          vec3 col = uSkin * (1.0 + 0.03 * sin(p.x*90.0)*sin(p.y*110.0)*sin(p.z*95.0));
          // boots: dark upper, accent band, light sole
          vec3 bcol = uBoot;
          float acc = step(0.05, p.y) * step(p.y, 0.072) * step(-0.03, p.z);
          bcol = mix(bcol, uBootAccent, acc * 0.9);
          bcol = mix(bcol, vec3(0.88), 1.0 - smoothstep(0.012, 0.016, p.y));
          // socks with top band
          vec3 scol = mix(uSock, uSockTrim, smoothstep(0.452, 0.454, p.y) * (1.0 - smoothstep(0.476, 0.478, p.y)));
          // shorts with hem band + outer side panel
          vec3 shcol = mix(uShorts, uShortsTrim, 1.0 - smoothstep(0.688, 0.690, p.y));
          float panel = smoothstep(0.128, 0.130, ax) * (1.0 - smoothstep(0.150, 0.152, ax)) * step(abs(p.z + 0.0), 0.06);
          shcol = mix(shcol, uShortsTrim, panel * 0.0);
          // jersey styles
          vec3 jcol = uJersey;
          if (uStyle > 0.5 && uStyle < 1.5) jcol = mix(uJersey, uJerseyAlt, smoothstep(0.46, 0.54, abs(fract(p.x * 7.0 + 0.5) - 0.5) * 2.0 * 0.5 + 0.25));
          else if (uStyle > 1.5 && uStyle < 2.5) { jcol = mix(uJersey, uJerseyAlt, smoothstep(0.46, 0.54, abs(fract(p.x * 5.0 + 0.5) - 0.5) + 0.25)); float band = step(0.0, p.z) * smoothstep(1.235, 1.24, p.y) * (1.0 - smoothstep(1.29, 1.295, p.y)); jcol = mix(jcol, uTrim, band); }
          else if (uStyle > 2.5) jcol = mix(uJersey, uJerseyAlt, smoothstep(0.55, 0.65, 0.5 + 0.5 * sin((p.x * 1.5 + p.y) * 38.0)));
          float ad; float at = k_segT(vec3(ax,p.y,p.z), vec3(0.166,1.503,-0.038), vec3(0.31,1.258,-0.06), ad);
          float cuff = smoothstep(0.30, 0.302, at) * (1.0 - step(0.49, at)) * (1.0 - smoothstep(0.066, 0.080, ad));
          jcol = mix(jcol, uTrim, cuff);
          float collar = clamp(k_neckSkin(p, 0.016) - k_neckSkin(p, 0.0), 0.0, 1.0);
          jcol = mix(jcol, uTrim, collar);
          jcol = mix(jcol, uTrim, smoothstep(0.985, 0.987, p.y) * (1.0 - smoothstep(1.003, 1.005, p.y)) * 0.9);
          float jmask = jersey * (1.0 - k_neckSkin(p, 0.0));
          // decals: back name+number, chest sponsor + crest
          float back = step(p.z, -0.02);
          vec2 duv = back > 0.5 ? vec2((-p.x + 0.16) / 0.32 * 0.5, (p.y - 1.02) / 0.42)
                                : vec2(0.5 + (p.x + 0.16) / 0.32 * 0.5, (p.y - 1.08) / 0.42);
          vec4 dc = texture2D(uDecal, vec2(duv.x, clamp(duv.y, 0.0, 1.0)));
          float dmask = step(0.0, duv.x) * step(duv.x, 1.0) * step(0.0, duv.y) * step(duv.y, 1.0);
          dmask *= (1.0 - smoothstep(0.12, 0.17, ax)) * step(1.0, p.y);
          jcol = mix(jcol, dc.rgb, dc.a * dmask * jmask);
          col = mix(col, bcol, boot);
          col = mix(col, scol, sock);
          col = mix(col, shcol, shorts);
          col = mix(col, jcol, jmask);
          g_cloth = clamp(jmask + shorts + sock, 0.0, 1.0);
          g_boot = boot;
          diffuseColor.rgb = col;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.52, 0.88, g_cloth); roughnessFactor = mix(roughnessFactor, 0.36, g_boot);`);
    const before = fs;
    fs = fs.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * g_cloth;'));
    if (before === fs) console.warn('kit: normal_fragment_maps not patched');
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'kitbody';
  return mat;
}
