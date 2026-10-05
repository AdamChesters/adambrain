import {sourceBuffer} from './source-data.js?v=063.1';
import * as THREE from 'three';

// Extra MRI sources keep native grids. Only annotation weights are interpolated.
const matrix = rows => new THREE.Matrix4().set(...rows.flat());
const local = url => {
  const u = new URL(url, location.href);
  if (u.origin !== location.origin) throw Error('Structure assets must stay local.');
  return u.href;
};
async function json(url) {
  const r = await fetch(local(url),{cache:'no-store'});
  if (!r.ok) throw Error(`Structure manifest: HTTP ${r.status}`);
  return r.json();
}
function texture(buffer, dims, weights = false) {
  if (buffer.byteLength !== dims.reduce((a,b) => a*b, 1)*4) throw Error('Structure texture size mismatch');
  const t = new THREE.Data3DTexture(weights ? new Uint8Array(buffer) : new Float32Array(buffer), ...dims);
  t.format = weights ? THREE.RGBAFormat : THREE.RedFormat;
  t.type = weights ? THREE.UnsignedByteType : THREE.FloatType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
function bounds(m, dims) {
  const b = new THREE.Box3();
  for (const x of [-.5,dims[0]-.5]) for (const y of [-.5,dims[1]-.5]) for (const z of [-.5,dims[2]-.5])
    b.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(m));
  return b;
}

export class StructureVolumes {
  constructor() { this.ready=false; this.error=null; this.enabled=true; this.cache=new Map(); this.atlasCache=new Map(); this.atlasTextures=new Map(); this.selecting=new Set(); this.loadControllers=new Map(); this.retentionMS=15000; this.residencyTimer=null; this.residencyDeadline=0; this.releasedBytes=0; this.slots=[]; this.serial={}; this.pending=new Map(); this.failures=new Map(); this.zero=texture(new ArrayBuffer(4),[1,1,1],true); this.residentHeadAtlas=null; this.scalarZero=texture(new ArrayBuffer(4),[1,1,1]); }
  async initialize(url) {
    this.manifest=await json(url);
    this.keys=this.manifest.channels;
    this.sources=new Map(this.manifest.datasets.map(d=>[d.id,d]));
    const loaded=await Promise.all(this.manifest.slots.map(s=>['eyes','cortex023'].includes(s.id)?this.load(s.defaultId):this.placeholder(s.defaultId)));
    this.u={headAtlasDims:{value:new THREE.Vector3(1,1,1)},extraFinish:{value:2.5},headFields:{value:null},spineData:{value:null},spineWeights:{value:null},cortexSmooth:{value:true},cInspect:{value:false},cPlane:{value:2},cPosition:{value:40},exLight:{value:this.keys.map(()=>1)},spineSmooth:{value:true},spineRegional:{value:false},exBoundary:{value:false},exOpacity:{value:this.keys.map(()=>0)},exColor:{value:this.keys.map(()=>new THREE.Color())}};
    this.slots=this.manifest.slots.map((s,i)=>({...s,index:i,data:loaded[i]}));
    for (const s of this.slots) {
      const prefix=`e${s.index}`;
      this.u[prefix+'Inverse']={value:new THREE.Matrix4()};
      this.u[prefix+'Gradient']={value:new THREE.Matrix3()};
      this.u[prefix+'Dims']={value:new THREE.Vector3()};
      this.u[prefix+'Invert']={value:0};
      this.u[prefix+'Window']={value:new THREE.Vector2()};
      this.u[prefix+'Enabled']={value:false};
      for(let p=0;p<s.packCount;p++) {
        if(!s.spineAtlas&&!s.weightAtlas)this.u[prefix+'Weights'+p]={value:null};
        this.u[prefix+'Low'+p]={value:new THREE.Vector4()};
        this.u[prefix+'High'+p]={value:new THREE.Vector4()};
      }
      if(!s.sharedT1&&!s.spineAtlas) this.u[prefix+'Data']={value:null};
      this.bind(s);
    }
    this.ready=true;
  }
  placeholder(id) {
    const entry=this.sources.get(id);
    return {entry,loaded:false,intensity:entry.sharedT1?null:this.scalarZero,weights:entry.weights.map(()=>this.zero),m:matrix(entry.voxelIndexToWorld),nativeM:entry.voxelIndexToSpineWorld?matrix(entry.voxelIndexToSpineWorld):null};
  }
  request(s) {
    if(s.data.loaded!==false||this.pending.has(s.id)||this.failures.has(s.id))return;
    const id=s.data.entry.id, serial=this.serial[s.id]=(this.serial[s.id]||0)+1;
    const job=this.load(id).then(data=>{
      if(serial===this.serial[s.id]){s.data=data;this.bind(s);this.frame=null;}
    }).catch(e=>{if(e.name!=='AbortError'&&serial===this.serial[s.id])this.failures.set(s.id,e.message);}).finally(()=>{
      this.pending.delete(s.id);this.trim();this.scheduleResidency();dispatchEvent(new Event('structures-ready'));
    });
    this.pending.set(s.id,job);dispatchEvent(new Event('structures-loading'));
  }
  retryDeferred(){this.failures.clear();dispatchEvent(new Event('structures-ready'));}
  async loadAtlas(spec,weights=false,signal) {
    signal?.throwIfAborted();const key=spec.url;
    if(weights&&spec.compatiblePrefix&&this.residentHeadAtlas?.prefix===spec.compatiblePrefix&&this.residentHeadAtlas.tex.image.depth>=spec.dimensions[2])return this.residentHeadAtlas.tex;
    if(this.atlasTextures.has(key))return this.atlasTextures.get(key);
    // Each dataset subscribes separately; transport shares bytes, then this map shares the texture.
    const buffer=await sourceBuffer(local(spec.url),signal);signal?.throwIfAborted();
    if(!this.atlasTextures.has(key)){const tex=texture(buffer,spec.dimensions,weights);this.atlasTextures.set(key,tex);this.atlasCache.set(key,tex);}
    return this.atlasTextures.get(key);
  }
  async load(id) {
    if(this.cache.has(id)) return this.cache.get(id);
    const entry=this.sources.get(id);
    if(!entry) throw Error('Unknown source '+id);
    const loadRecord={controller:new AbortController(),unwantedSince:null};this.loadControllers.set(id,loadRecord);const signal=loadRecord.controller.signal;
    const promise=(async()=>{
      if(entry.weightAtlas&&!entry.spineAtlas){const tex=await this.loadAtlas(entry.weightAtlas,true,signal);return {entry,intensity:null,weights:[tex],m:matrix(entry.voxelIndexToWorld),nativeM:null};}
      if(entry.spineAtlas){
        const [intensity,atlas]=await Promise.all([this.loadAtlas(entry.intensityAtlas,false,signal),this.loadAtlas(entry.weightAtlas,true,signal)]);
        return {entry,intensity,weights:entry.weights.map(()=>atlas),m:matrix(entry.voxelIndexToWorld),nativeM:matrix(entry.voxelIndexToSpineWorld)};
      }
      const urls=[...(!entry.sharedT1?[entry.url]:[]),...entry.weights];
      const buffers=await Promise.all(urls.map(url=>sourceBuffer(local(url),signal)));
      const intensity=entry.sharedT1?null:texture(buffers.shift(),entry.dimensions);
      const weights=buffers.map(b=>texture(b,entry.dimensions,true));
      return {entry,intensity,weights,m:matrix(entry.voxelIndexToWorld),nativeM:entry.voxelIndexToSpineWorld?matrix(entry.voxelIndexToSpineWorld):null};
    })();
    loadRecord.promise=promise;this.cache.set(id,promise);
    try { const result=await promise;this.cache.set(id,result);return result; }
    catch(e){if(this.cache.get(id)===promise)this.cache.delete(id);loadRecord.controller.abort();throw e;}
    finally{if(this.loadControllers.get(id)===loadRecord)this.loadControllers.delete(id);}
  }
  ownedTextures() {
    const all=new Set(this.atlasTextures.values());
    for(const data of [...this.cache.values(),...this.slots.map(s=>s.data)])
      if(data.entry)for(const tex of [data.intensity,...data.weights])if(tex)all.add(tex);
    if(this.residentHeadAtlas)all.add(this.residentHeadAtlas.tex);
    all.delete(this.zero);all.delete(this.scalarZero);return all;
  }
  trim() {
    // A shared decode/selection may not have attached its textures to a slot yet.
    if(this.pending.size||this.selecting.size)return;
    const before=this.ownedTextures(),live=this.slots.filter(s=>s.data.loaded!==false);
    const active=new Set(live.map(s=>s.data));
    for(const [id,data]of this.cache)if(data.entry&&!active.has(data))this.cache.delete(id);
    const head=live.filter(s=>s.data.entry.weightAtlas?.compatiblePrefix);
    if(!head.length)this.residentHeadAtlas=null;
    else if(this.residentHeadAtlas){
      const spec=head.map(s=>s.data.entry.weightAtlas).sort((a,b)=>b.dimensions[2]-a.dimensions[2])[0];
      const old=this.residentHeadAtlas.tex,dims=spec.dimensions;
      if(old.image.depth>dims[2]&&old.image.width===dims[0]&&old.image.height===dims[1]){
        // Copy only the exact retained prefix, allowing the larger backing buffer to be freed.
        const tex=texture(old.image.data.slice(0,dims.reduce((a,b)=>a*b,4)).buffer,dims,true);
        this.residentHeadAtlas={prefix:spec.compatiblePrefix,tex};
        for(const slot of head)slot.data.weights=slot.data.weights.map(()=>tex);
      }
    }
    const used=new Set(live.flatMap(s=>[s.data.intensity,...s.data.weights]).filter(Boolean));
    for(const [url,tex]of this.atlasTextures)if(!used.has(tex)){this.atlasTextures.delete(url);this.atlasCache.delete(url);}
    for(const slot of this.slots)this.bind(slot);
    const spine=live.find(s=>s.spineAtlas);
    this.u.spineData.value=spine?.data.intensity||this.scalarZero;
    this.u.spineWeights.value=spine?.data.weights[0]||this.zero;
    this.u.headFields.value=this.residentHeadAtlas?.tex||this.zero;
    const im=this.u.headFields.value.image;this.u.headAtlasDims.value.set(im.width,im.height,im.depth);
    for(const tex of before)if(!used.has(tex)){this.releasedBytes+=tex.image.data.byteLength;tex.dispose();}
  }
  updateLoadDemand(){
    if(!this.ready)return;
    const latest=[...this.selecting].filter(t=>t.serial===this.serial[t.slot]);
    const wanted=new Set(this.slots.filter(s=>s.wanted).map(s=>latest.find(t=>t.slot===s.id)?.id||s.data.entry.id));
    for(const token of latest)wanted.add(token.id);
    const now=performance.now();
    for(const [id,record]of this.loadControllers){
      if(wanted.has(id))record.unwantedSince=null;else record.unwantedSince??=now;
      if(record.unwantedSince!=null&&now-record.unwantedSince>=this.retentionMS){
        record.controller.abort();if(this.cache.get(id)===record.promise)this.cache.delete(id);
        this.loadControllers.delete(id);
      }
    }
  }
  scheduleResidency() {
    this.updateLoadDemand();
    const deadlines=this.slots.filter(s=>s.data.loaded!==false&&!s.wanted&&s.hiddenSince!=null).map(s=>s.hiddenSince+this.retentionMS);
    for(const record of this.loadControllers.values())if(record.unwantedSince!=null)deadlines.push(record.unwantedSince+this.retentionMS);
    if(!deadlines.length){clearTimeout(this.residencyTimer);this.residencyTimer=null;this.residencyDeadline=0;return;}
    let deadline=Math.min(...deadlines);
    if(deadline<=performance.now()&&(this.pending.size||this.selecting.size))deadline=(Math.floor(performance.now()/500)+1)*500;
    if(this.residencyTimer&&Math.abs(deadline-this.residencyDeadline)<1)return;
    clearTimeout(this.residencyTimer);this.residencyDeadline=deadline;
    this.residencyTimer=setTimeout(()=>{this.residencyTimer=null;this.releaseHidden();},Math.max(0,deadline-performance.now()));
  }
  releaseHidden() {
    this.updateLoadDemand();
    if(this.pending.size||this.selecting.size){this.scheduleResidency();return;}
    const now=performance.now();let released=false;
    for(const slot of this.slots)if(slot.data.loaded!==false&&!slot.wanted&&slot.hiddenSince!=null&&now-slot.hiddenSince>=this.retentionMS){
      slot.data=this.placeholder(slot.data.entry.id);this.u[`e${slot.index}Enabled`].value=false;released=true;
    }
    // Keep the detached datasets in cache until trim has captured all texture owners.
    if(released){this.trim();this.frame=null;dispatchEvent(new Event('structures-ready'));}
    this.scheduleResidency();
  }
  bind(s) {
    const e=s.data.entry,p=`e${s.index}`;
    this.u[p+'Dims'].value.set(...e.dimensions);
    this.u[p+'Invert'].value=e.invert?1:0;
    this.u[p+'Window'].value.set(...e.window);
    for(let i=0;i<s.packCount;i++) {
      if(!s.spineAtlas&&!s.weightAtlas)this.u[p+'Weights'+i].value=s.data.weights[i];
      const gates=Array.from({length:4},(_,j)=>e.gates[i*4+j]||[0,1]);
      this.u[p+'Low'+i].value.set(...gates.map(g=>g[0]));
      this.u[p+'High'+i].value.set(...gates.map(g=>g[1]));
    }
    if(s.weightAtlas){
      const spec=e.weightAtlas, tex=s.data.weights[0];
      if(spec.compatiblePrefix&&s.data.loaded!==false){
        const old=this.residentHeadAtlas;
        if(!old||tex.image.depth>old.tex.image.depth){
          this.residentHeadAtlas={prefix:spec.compatiblePrefix,tex};
          if(old&&old.tex!==tex){
            for(const data of this.cache.values())if(data.entry?.weightAtlas?.compatiblePrefix===spec.compatiblePrefix)data.weights=data.weights.map(()=>tex);
            for(const slot of this.slots)if(slot.data.loaded!==false&&slot.data.entry.weightAtlas?.compatiblePrefix===spec.compatiblePrefix)slot.data.weights=slot.data.weights.map(()=>tex);
            for(const [url,owned]of this.atlasTextures)if(owned===old.tex){this.atlasTextures.delete(url);this.atlasCache.delete(url);}old.tex.dispose();
          }
        }
      }
      const active=this.residentHeadAtlas?.tex||tex;if(active!==tex&&s.data.loaded!==false){s.data.weights=s.data.weights.map(()=>active);this.atlasCache.delete(e.weightAtlas.url);this.atlasTextures.delete(e.weightAtlas.url);if(tex!==this.zero)tex.dispose();}this.u.headFields.value=active;this.u.headAtlasDims.value.set(active.image.width,active.image.height,active.image.depth);
    }
    if(s.spineAtlas){this.u.spineData.value=s.data.intensity;this.u.spineWeights.value=s.data.weights[0];}else if(!s.sharedT1)this.u[p+'Data'].value=s.data.intensity;
  }
  async select(slot,id) {
    const s=this.slots.find(s=>s.id===slot);
    if(!s||!s.sourceIds.includes(id))throw Error('Invalid structure source');
    const serial=this.serial[slot]=(this.serial[slot]||0)+1,token={slot,id,serial};this.selecting.add(token);
    try {
      const data=await this.load(id);
      if(serial!==this.serial[slot])return false;
      s.data=data;this.failures.delete(slot);this.bind(s);this.frame=null;return true;
    } catch(e){if(e.name==='AbortError'&&serial!==this.serial[slot])return false;throw e;} finally {this.selecting.delete(token);this.trim();this.scheduleResidency();}
  }
  sync(current,layer,density,preset) {
    if(!this.ready)return;
    this.enabled=true;this.u.extraFinish.value=2.5;this.u.cortexSmooth.value=true;this.u.cPlane.value=Number(document.getElementById('cPlane')?.value??2);this.u.cPosition.value=Number(document.getElementById('cPosition')?.value??40);
    this.u.spineRegional.value=document.getElementById('spineDisplay')?.value==='regional';
    this.u.spineSmooth.value=document.getElementById('spineShading')?.value!=='detail';
    this.u.exBoundary.value=false;
    const spine=current.study==='spine';
    const station=document.getElementById('spineSource')?.value||'combined';
    this.u.exOpacity.value=this.keys.map(k=>{
      if(!this.enabled||!current.meshes[k]||!this.channelEnabled(k))return 0;
      if(preset==='vessels'&&(k.startsWith('cortex023-')||k==='flair023-C'))return 0;const l=layer(k);return l.visible?l.opacity:0;
    });
    for(let i=0;i<this.keys.length;i++){this.u.exColor.value[i].set(layer(this.keys[i]).color);this.u.exLight.value[i]=layer(this.keys[i]).lighting??1;}
    for(const s of this.slots) {
      const enabled=this.enabled&&(s.family==='spine'?current.study!=='head'&&(station==='combined'||station===s.id):!spine);
      const wanted=enabled&&density>0&&(s.channelIndices.some(i=>this.u.exOpacity.value[i]>0)||current.pinnedSlots?.has(s.id)); s.wanted=wanted;if(wanted)s.hiddenSince=null;else s.hiddenSince??=performance.now();if(wanted)this.request(s); this.u[`e${s.index}Enabled`].value=wanted&&s.data.loaded!==false;
      const m=spine&&s.data.nativeM?s.data.nativeM:s.data.m;
      this.u[`e${s.index}Inverse`].value.copy(m).invert();
      this.u[`e${s.index}Gradient`].value.setFromMatrix4(m).invert().transpose();
    }
  this.scheduleResidency();
  }
  channelEnabled(key) {
    const regional=document.getElementById('spineDisplay')?.value==='regional';
    if(key==='regional-spine-signal'&&!regional)return false;
    if(['spine-cord-canal-source','spine-vertebral-bodies-source','spine-discs-source','paraspinal-left-source','paraspinal-right-source'].includes(key)&&regional)return false;
    const index=this.keys.indexOf(key);
    return this.slots.some(s=>{const j=s.channelIndices.indexOf(index);return j>=0&&s.data.entry.classAvailability?.[j]?.enabled!==false;});
  }
  channelBounds(keys,current) {
    const box=new THREE.Box3();
    const station=document.getElementById('spineSource')?.value||'combined';
    for(const s of this.slots){
      if(s.family==='spine'&&station!=='combined'&&station!==s.id)continue;
      if(s.family==='spine'?current.study==='head':current.study==='spine')continue;
      const m=current.study==='spine'&&s.data.nativeM?s.data.nativeM:s.data.m;
      s.channelIndices.forEach((index,j)=>{
        if(!keys.includes(this.keys[index])||!this.channelEnabled(this.keys[index])||s.data.entry.classAvailability?.[j]?.enabled===false)return;
        const b=s.data.entry.indexBounds?.[j];if(!b)return;
        for(const x of [b[0][0],b[1][0]])for(const y of [b[0][1],b[1][1]])for(const z of [b[0][2],b[1][2]])box.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(m));
      });
    }
    return box;
  }
  getBounds(current) {
    const b=new THREE.Box3();
    for(const s of this.slots)if(s.family==='spine'&&current.study!=='head') {
      const m=current.study==='spine'?s.data.nativeM:s.data.m;
      b.union(bounds(m,s.data.entry.dimensions));
    }
    return b;
  }
  replacedKeys(current) {
    if(!this.enabled||!this.ready)return [];
    const ids=new Set(this.slots.filter(s=>s.family==='spine'?current.study!=='head':current.study!=='spine').flatMap(s=>s.channelIndices));
    return [...ids].map(i=>this.keys[i]);
  }
  inspect() {
    return {retentionMS:this.retentionMS,releasedBytes:this.releasedBytes,residentTextureBytes:[...this.ownedTextures()].reduce((n,t)=>n+t.image.data.byteLength,0),selecting:this.selecting.size,cancellableLoads:this.loadControllers.size,loading:[...this.pending.keys()],loadErrors:Object.fromEntries(this.failures),residentSlots:this.slots.filter(s=>s.data.loaded!==false).map(s=>s.id),spineShading:this.u?.spineSmooth.value?'smooth':'detail',ready:this.ready,error:this.error,enabled:this.enabled,channels:this.keys,opacities:this.u?.exOpacity.value,sources:this.slots.map(s=>({slot:s.id,id:s.data.entry.id,active:this.u[`e${s.index}Enabled`].value,dimensions:s.data.entry.dimensions,gates:s.data.entry.gates,window:s.data.entry.window,indexToWorld:this.u[`e${s.index}Inverse`].value.clone().invert().toArray(),spacing:s.data.entry.spacing,sharedT1:!!s.sharedT1})),occupancy:'Native/inferred response fields; values are not calibrated probabilities',overlap:'continuous visibility-dependent cervical preference; separate native poses retained'};
  }
  shader(activeIds=null) {
    const defs=["uniform sampler3D spineData,spineWeights;"],evaluate=[];
    for(const s of this.slots){
      if(activeIds&&!activeIds.has(s.id))continue;
      const p=`e${s.index}`;
      defs.push(`uniform mat4 ${p}Inverse;uniform mat3 ${p}Gradient;uniform vec3 ${p}Dims;uniform vec2 ${p}Window;uniform float ${p}Invert;uniform bool ${p}Enabled;`);
      if(!s.spineAtlas&&!s.weightAtlas)for(let j=0;j<s.packCount;j++)defs.push(`uniform sampler3D ${p}Weights${j};`);
      if(!s.sharedT1&&!s.spineAtlas)defs.push(`uniform sampler3D ${p}Data;`);
      if(s.spineAtlas){
        const ia=s.data.entry.intensityAtlas,wa=s.data.entry.weightAtlas;
        defs.push(`vec3 ${p}Atlas(vec3 t,vec3 offset,vec3 size){return (clamp(t*${p}Dims,vec3(.5),${p}Dims-.5)+offset)/size;}
          float ${p}Raw(vec3 t){return texture(spineData,${p}Atlas(t,vec3(${ia.offset.join(',')}),vec3(${ia.dimensions.join(',')}))).r;}
          vec3 ${p}NativeLight(vec3 t,vec3 dims,mat3 gradient,vec3 view,vec3 color){vec3 e=1./dims;
          vec3 g=vec3(${p}Raw(t+vec3(e.x,0,0))-${p}Raw(t-vec3(e.x,0,0)),${p}Raw(t+vec3(0,e.y,0))-${p}Raw(t-vec3(0,e.y,0)),${p}Raw(t+vec3(0,0,e.z))-${p}Raw(t-vec3(0,0,e.z)));return shade(gradient*g,view,color);}`);
        for(let j=0;j<s.packCount;j++)defs.push(`vec4 ${p}Weight${j}(vec3 t){return texture(spineWeights,${p}Atlas(t,vec3(${wa.offsets[j].join(',')}),vec3(${wa.dimensions.join(',')})));}`);
      }
      if(s.weightAtlas){const wa=s.data.entry.weightAtlas;for(let j=0;j<s.packCount;j++)defs.push(`vec4 ${p}Weight${j}(vec3 t){return texture(headFields,(clamp(t*${p}Dims,vec3(.5),${p}Dims-.5)+vec3(${wa.offsets[j].join(',')}))/headAtlasDims);}`);}
      const sample=[],weights=[];const depth=s.envelopeDepth?'brainDepthMask(texture(hWeights,((hInverse*vec4(q,1.)).xyz+.5)/hDims).b*brainDepthMax)':'1.';
      for(let j=0;j<s.packCount;j++){
        const v=`w${j}`,indices=s.channelIndices.slice(j*4,j*4+4);sample.push(s.spineAtlas||s.weightAtlas?`vec4 ${v}=${p}Weight${j}(t);`:`vec4 ${v}=texture(${p}Weights${j},t);`);
        for(let c=0;c<indices.length;c++){
          const k=indices[c],regional=this.keys[k]==='regional-spine-signal';
          const mode=s.family==='spine'?(regional?'spineRegional':'!spineRegional'):'true';
          sample.push(`if(${mode}){float a=${v}[${c}]*${Number(s.responseScales?.[j*4+c]||1).toFixed(8)}*opticalGain(exOpacity[${k}])*${depth};selected+=a;weighted+=a*exColor[${k}];weightedLight+=a*exLight[${k}];}`);
          if(s.family==='head')weights.push(`${v}[${c}]*clamp(exOpacity[${k}],0.,1.)*${depth}`);
        }
      }

      // Lighting only: native scalar samples and rebuilt class fields remain unchanged.
      if(s.family==='spine'){
       const terms=s.channelIndices.slice(0,5).map((k,j)=>s.spineAtlas?`${p}Weight${Math.floor(j/4)}(t)[${j%4}]*opticalGain(exOpacity[${k}])`:`texture(${p}Weights${Math.floor(j/4)},t)[${j%4}]*opticalGain(exOpacity[${k}])`);
       const delta=s.data.entry.spacing.map(v=>Math.max(1,1/v)).join(',');
       defs.push(`float ${p}Selected(vec3 t){if(!inside(t))return 0.;return ${terms.join('+')};}
       vec3 ${p}SpineLight(sampler3D data,vec3 t,vec3 dims,mat3 gradient,vec3 view,vec3 color){
        if(spineRegional)return ${s.spineAtlas?p+'NativeLight(t,dims,gradient,view,color)':'lighting(data,t,dims,gradient,view,color)'};
        vec3 delta=vec3(${delta}),e=delta/dims,g;
        if(spineSmooth)g=vec3(${p}Selected(t+vec3(e.x,0,0))-${p}Selected(t-vec3(e.x,0,0)),${p}Selected(t+vec3(0,e.y,0))-${p}Selected(t-vec3(0,e.y,0)),${p}Selected(t+vec3(0,0,e.z))-${p}Selected(t-vec3(0,0,e.z)));
        else g=vec3(${s.spineAtlas?p+'Raw(t+vec3(e.x,0,0))':'texture(data,t+vec3(e.x,0,0)).r'}-${s.spineAtlas?p+'Raw(t-vec3(e.x,0,0))':'texture(data,t-vec3(e.x,0,0)).r'},${s.spineAtlas?p+'Raw(t+vec3(0,e.y,0))':'texture(data,t+vec3(0,e.y,0)).r'}-${s.spineAtlas?p+'Raw(t-vec3(0,e.y,0))':'texture(data,t-vec3(0,e.y,0)).r'},${s.spineAtlas?p+'Raw(t+vec3(0,0,e.z))':'texture(data,t+vec3(0,0,e.z)).r'}-${s.spineAtlas?p+'Raw(t-vec3(0,0,e.z))':'texture(data,t-vec3(0,0,e.z)).r'});
        return shade(gradient*(g/delta),view,color);
       }`);
      }
      if(s.id==='cortex023'||s.fieldLighting){
        const terms=s.channelIndices.map((k,j)=>s.weightAtlas?`${p}Weight${Math.floor(j/4)}(t)[${j%4}]*opticalGain(exOpacity[${k}])`:`texture(${p}Weights${Math.floor(j/4)},t)[${j%4}]*opticalGain(exOpacity[${k}])`);
        defs.push(`float ${p}TissueResponse(vec3 t){if(!inside(t))return 0.;return ${terms.join('+')};}
        vec3 ${p}TissueLight(vec3 t,vec3 view,vec3 color){vec3 delta=${s.id==='head037'||s.id==='head038'||s.id.startsWith('art-')?'max(vec3(1.25),vec3(extraFinish)/vec3('+s.data.entry.spacing.join(',')+'))':'vec3(1.25)'},e=delta/${p}Dims;
          vec3 g=vec3(${p}TissueResponse(t+vec3(e.x,0,0))-${p}TissueResponse(t-vec3(e.x,0,0)),${p}TissueResponse(t+vec3(0,e.y,0))-${p}TissueResponse(t-vec3(0,e.y,0)),${p}TissueResponse(t+vec3(0,0,e.z))-${p}TissueResponse(t-vec3(0,0,e.z)));
          return shade(${p}Gradient*(g/delta),view,color);}`);
      }
      const coverage=s.family==='head'&&s.replacesHead!==false?`coverage+=${weights.join('+')};`:'';
      const response=s.responseOnly?'1.':s.id==='flair023'?'10.':s.family==='spine'?'(spineRegional?.06*pow(signal,2.):(.12+.38*signal))':'pow(signal,.8)';
      const intensitySample=s.sharedT1?'texture(hData,((hInverse*vec4(q,1.)).xyz+.5)/hDims).r':s.spineAtlas?`${p}Raw(t)`:`texture(${p}Data,t).r`;
      const lightArgs=s.sharedT1?'hData,((hInverse*vec4(q,1.)).xyz+.5)/hDims,hDims,hGradient':s.spineAtlas?`spineData,t,${p}Dims,${p}Gradient`:`${p}Data,t,${p}Dims,${p}Gradient`;
      const prior='';const overlap=s.id==='thoracic'?'*(1.-cervicalCoverage(q))':'';
      evaluate.push(`if(${p}Enabled${prior}){
       vec3 t=((${p}Inverse*vec4(q,1.)).xyz+.5)/${p}Dims;
       if(inside(t)){float selected=0.;float weightedLight=0.;vec3 weighted=vec3(0.);${sample.join('')}${coverage}
        if(selected>.00001${s.id==='flair023'?'&&abs((cPlane==0?q.x:cPlane==1?-q.z:q.y)*1000.-cPosition)<.65':''}){float raw=${intensitySample};float signal=clamp((raw-${p}Window.x)/max(${p}Window.y-${p}Window.x,1.),0.,1.);signal=mix(signal,1.-signal,${p}Invert);
         float ext=selected*${response}${overlap};vec3 col=${s.family==='spine'?p+'SpineLight':'lighting'}(${lightArgs},view,weighted/selected);${s.fieldLighting?`col=${p}TissueLight(t,view,weighted/selected);`:s.id==='cortex023'?`if(cortexSmooth)col=${p}TissueLight(t,view,weighted/selected);`:''}col=mix(weighted/selected,col,weightedLight/selected);extinction+=ext;emitted+=ext*col${s.id==='flair023'?'*signal':''};}
       }
      }`);
    }
    const cerv=this.slots.find(s=>s.id==='cervical');
    return {helpers:`float brainDepthMask(float depth);
uniform sampler3D headFields;uniform vec3 headAtlasDims;uniform float extraFinish;uniform bool cInspect,cortexSmooth;uniform int cPlane;uniform float cPosition;uniform bool spineRegional,spineSmooth;uniform float exOpacity[${this.keys.length}],exLight[${this.keys.length}];uniform vec3 exColor[${this.keys.length}];
${defs.join('\n')}
${cerv&&(!activeIds||activeIds.has(cerv.id))?`float cervicalCoverage(vec3 q){vec3 t=((e${cerv.index}Inverse*vec4(q,1.)).xyz+.5)/e${cerv.index}Dims;if(!e${cerv.index}Enabled||!inside(t))return 0.;float response=spineRegional?opticalGain(exOpacity[11]):e${cerv.index}Selected(t);return 1.-exp(-max(response,0.));}`:'float cervicalCoverage(vec3 q){return 0.;}'}
void extraIntegrate(vec3 q,vec3 view,inout float extinction,inout vec3 emitted,out float headCoverage){float coverage=0.;${evaluate.join('\n')}headCoverage=clamp(coverage,0.,1.);}
`,setup:'',integrate:''};
  }
}
