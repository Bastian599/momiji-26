// Auto-generiert von build-check.js — Version 40124d6b71
const CACHE='japan2026-8f09bb7512';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-180.png','./koffer/poster.jpg','./koffer/kf3-player.js','./koffer/kf3d.js','./koffer/koffer-film.m4a','./koffer/vendor/three.module.min.js','./koffer/vendor/jsm/postprocessing/EffectComposer.js','./koffer/vendor/jsm/postprocessing/RenderPass.js','./koffer/vendor/jsm/postprocessing/UnrealBloomPass.js','./koffer/vendor/jsm/postprocessing/OutputPass.js','./koffer/vendor/jsm/postprocessing/ShaderPass.js','./koffer/vendor/jsm/postprocessing/Pass.js','./koffer/vendor/jsm/postprocessing/MaskPass.js','./koffer/vendor/jsm/shaders/CopyShader.js','./koffer/vendor/jsm/shaders/LuminosityHighPassShader.js','./koffer/vendor/jsm/shaders/OutputShader.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreSearch:true}).then(hit=>{
    const net=fetch(e.request).then(res=>{if(res&&res.ok)c.put(e.request,res.clone());return res}).catch(()=>hit);
    return hit||net;
  })));
});