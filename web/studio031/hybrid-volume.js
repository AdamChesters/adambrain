import {sourceBuffer,planSourceLoad} from './source-data.js?v=086.1';
import {StructureVolumes} from './structure-volumes.js?v=086.1';
import * as THREE from 'three';
const vertex=`varying vec3 p;varying vec3 eye;void main(){p=position;eye=(inverse(modelMatrix)*vec4(cameraPosition,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const baseFragment=`precision highp float;precision highp sampler3D;
uniform sampler3D aData,aWeights,hData,hWeights,aRegions;uniform vec4 aLight;uniform vec3 hLight;uniform float faceLight,stepMM;uniform bool nativeSignal;uniform float surfaceContextOpacity,faceContextOpacity;uniform bool facialGrouping;uniform vec3 faceContextColor;
uniform vec3 aDims,hDims,bMin,bMax,offset;uniform mat4 aInverse,hInverse,viewProjection;
uniform mat3 aGradient,hGradient;
uniform vec2 aTF[16],hTF[16];uniform int aCount,hCount;
uniform vec2 brainDepthRange;uniform float brainDepthMax,brainDepthFeather;
uniform float density,lightGain;uniform bool classColorOnly;
uniform vec3 classOpacity,aColor,vColor,oColor;uniform float rawOpacity;uniform vec3 rawColor;uniform vec3 headOpacity;uniform vec3 brainColor,headColor,deepHeadColor;
varying vec3 p,eye;
bool inside(vec3 t){return all(greaterThanEqual(t,vec3(0.)))&&all(lessThanEqual(t,vec3(1.)));}
float tf(float raw,vec2 points[16],int count){if(raw<=points[0].x)return points[0].y;for(int j=1;j<16;j++){if(j>=count)break;if(raw<=points[j].x)return mix(points[j-1].y,points[j].y,(raw-points[j-1].x)/(points[j].x-points[j-1].x));}return points[count-1].y;}
// The opacity control changes optical density continuously, including at100%.
float opticalGain(float opacity){return -log(max(1.-.999*clamp(opacity,0.,1.),.001));}
vec3 shade(vec3 gradient,vec3 view,vec3 color){
 float len=length(gradient);if(len<.001)return color*.66;
 vec3 n=-gradient/len;if(dot(n,view)<0.)n=-n;
 vec3 light=normalize(vec3(-.4,.7,-.6));
 float diffuse=max(0.,dot(n,light)),front=max(0.,dot(n,view));
 return color*(.29+.59*lightGain*diffuse+.2*front)+vec3(.04)*lightGain*pow(max(0.,dot(n,normalize(light+view))),28.);
}
vec3 lighting(sampler3D data,vec3 t,vec3 dims,mat3 physicalGradient,vec3 view,vec3 color){
 vec3 e=1./dims;
 vec3 g=vec3(texture(data,t+vec3(e.x,0,0)).r-texture(data,t-vec3(e.x,0,0)).r,texture(data,t+vec3(0,e.y,0)).r-texture(data,t-vec3(0,e.y,0)).r,texture(data,t+vec3(0,0,e.z)).r-texture(data,t-vec3(0,0,e.z)).r);
 return shade(physicalGradient*g,view,color);
}
/* EXTRA_HELPERS */
float brainDepthMask(float depth){
 if(brainDepthMax<=0.||(brainDepthRange.x<=0.&&brainDepthRange.y>=brainDepthMax))return 1.;
 float halfFeather=brainDepthFeather*.5;
 float nearEdge=brainDepthRange.x<=0.?1.:smoothstep(brainDepthRange.x-halfFeather,brainDepthRange.x+halfFeather,depth);
 float farEdge=brainDepthRange.y>=brainDepthMax?1.:1.-smoothstep(brainDepthRange.y-halfFeather,brainDepthRange.y+halfFeather,depth);
 return nearEdge*farEdge;
}
void main(){
 vec3 ray=normalize(p-eye);

#ifdef INCLUDE_FLAIR
 if(cInspect){
  float origin=cPlane==0?eye.x:cPlane==1?-eye.z:eye.y;
  float direction=cPlane==0?ray.x:cPlane==1?-ray.z:ray.y;
  if(abs(direction)<.000001)discard;
  float hit=(cPosition*.001-origin)/direction;if(hit<=0.||density<=0.)discard;
  vec3 point=eye+ray*hit,t=((e6Inverse*vec4(point,1.)).xyz+.5)/e6Dims;
  if(!inside(t))discard;
  float support=texture(e6Weights0,t).r;if(support<.001)discard;
  float signal=clamp((texture(e6Data,t).r-e6Window.x)/max(e6Window.y-e6Window.x,.000001),0.,1.);
  vec3 col=exColor[19];col=mix(col,lighting(e6Data,t,e6Dims,e6Gradient,-ray,col),exLight[19]);
  col=mix(col*12.92,1.055*pow(max(col,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),col));
  gl_FragColor=vec4(signal*col,clamp(exOpacity[19]*density*support,0.,1.));
  vec4 clip=viewProjection*vec4(point+offset,1.);gl_FragDepth=clip.z/clip.w*.5+.5;return;
 }

#endif
 vec3 t0=(bMin-eye)/ray,t1=(bMax-eye)/ray;
 vec3 nearT=min(t0,t1),farT=max(t0,t1);
 float enter=max(max(nearT.x,nearT.y),max(nearT.z,0.)),leave=min(min(farT.x,farT.y),farT.z);
 if(leave<=enter||density<=0.)discard;
 int steps=min(int(ceil((leave-enter)/(stepMM*.001))),1900);float dt=(leave-enter)/float(steps),mm=dt*1000.;
 vec3 at=eye+ray*(enter+dt*.5);vec4 accum=vec4(0.);float outputDepth=1.;
 vec3 headGain=vec3(opticalGain(headOpacity.x),opticalGain(headOpacity.y),opticalGain(headOpacity.z));
 for(int i=0;i<1900;i++){
  if(i>=steps)break;
  float extinction=0.;vec3 emitted=vec3(0.);
  vec3 ta=((aInverse*vec4(at,1.)).xyz+.5)/aDims;
  if((nativeSignal||dot(classOpacity,vec3(1.))+rawOpacity+(facialGrouping?faceContextOpacity:0.)>0.)&&inside(ta)){
   float raw=texture(aData,ta).r,alpha=clamp(tf(raw,aTF,aCount),0.,.9999);
   if(alpha>.00001){vec4 w=texture(aWeights,ta),region=texture(aRegions,ta);float regionGain=1.-region.a*(1.-surfaceContextOpacity),contextFraction=facialGrouping?region.b:0.;vec4 selected=w*vec4(classOpacity,rawOpacity)*regionGain*(1.-contextFraction);float contextSelected=dot(w,vec4(1.))*contextFraction*faceContextOpacity*regionGain;if(nativeSignal){selected=vec4(0.,0.,0.,1.);contextSelected=0.;}float sum=dot(selected,vec4(1.))+contextSelected;
    if(sum>.00001){float ext=-log(1.-alpha)*sum;vec3 col=(selected.x*aColor+selected.y*vColor+selected.z*oColor+selected.w*rawColor+contextSelected*faceContextColor)/sum;if(!classColorOnly)col=mix(col,lighting(aData,ta,aDims,aGradient,-ray,col),(dot(selected,aLight)+contextSelected*faceLight)/sum);extinction+=ext;emitted+=col*ext;}}
  }
  float headCoverage=0.;
  extraIntegrate(at,-ray,extinction,emitted,headCoverage);
  vec3 th=((hInverse*vec4(at,1.)).xyz+.5)/hDims;
  if(inside(th)&&dot(headGain,vec3(1.))>0.){
   float raw=texture(hData,th).r,alpha=clamp(tf(raw,hTF,hCount),0.,.9999);
   if(alpha>.00001){vec4 fields=texture(hWeights,th);vec2 w=fields.rg*(1.-headCoverage);float combinedHeadGain=mix(headGain.z,headGain.y,fields.a);vec3 combinedHeadColor=mix(deepHeadColor,headColor,combinedHeadGain>0.?fields.a*headGain.y/combinedHeadGain:0.);if(brainDepthMax>0.&&(brainDepthRange.x>0.||brainDepthRange.y<brainDepthMax))w.x*=brainDepthMask(texture(hWeights,th).b*brainDepthMax);vec2 selected=w*vec2(headGain.x,combinedHeadGain);float sum=selected.x+selected.y;
    if(sum>.00001){float ext=-log(1.-alpha)*sum;vec3 col=(selected.x*brainColor+selected.y*combinedHeadColor)/sum;col=mix(col,lighting(hData,th,hDims,hGradient,-ray,col),(selected.x*hLight.x+selected.y*mix(hLight.z,hLight.y,fields.a))/sum);extinction+=ext;emitted+=col*ext;}}
  }
  if(extinction>.00001){float a=1.-exp(-extinction*density*mm);accum.rgb+=(1.-accum.a)*a*emitted/extinction;accum.a+=(1.-accum.a)*a;}
  if(accum.a>=.997){vec4 clip=viewProjection*vec4(at+offset,1.);outputDepth=clip.z/clip.w*.5+.5;accum.rgb/=accum.a;accum.a=1.;break;}
  at+=ray*dt;
 }
 if(accum.a<.003)discard;
 gl_FragColor=vec4(accum.rgb/max(accum.a,.00001),accum.a);gl_FragDepth=outputDepth;
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
function local(url){const u=new URL(url,document.baseURI);if(u.origin!==location.origin)throw Error('Hybrid assets must stay local.');return u.href;}
const matrix=rows=>new THREE.Matrix4().set(...rows.flat());
export class HybridVolume{
 constructor(renderer,scene,camera){this.renderer=renderer;this.scene=scene;this.camera=camera;this.volumeScene=new THREE.Scene();this.ready=false;this.error=null;this.active=false;this.overlayCount=0;this.structures=new StructureVolumes();this.coverageId="original";this.coverageCache=new Map();this.coverageSerial=0;this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true});this.target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);}
 async initialize(url,shared=null,structureURL='./data/structure-volumes.json'){try{const r=await fetch(local(url),{cache:'no-store'});if(!r.ok)throw Error('Hybrid manifest: HTTP '+r.status);this.manifest=await r.json();const sr=await fetch(local(structureURL),{cache:'no-store'});if(!sr.ok)throw Error('Structure manifest: HTTP '+sr.status);const structureManifest=await sr.json();const entries=[this.manifest.angiography,this.manifest.head];const sourceURLs=entries.flatMap(e=>[e.url,e.weights.url]);if(this.manifest.angiography.compartments)sourceURLs.push(this.manifest.angiography.compartments.url);for(const slot of structureManifest.slots){const e=structureManifest.datasets.find(d=>d.id===slot.defaultId);if(e.spineAtlas)sourceURLs.push(e.intensityAtlas.url,e.weightAtlas.url);else if(e.weightAtlas)sourceURLs.push(e.weightAtlas.url);else{sourceURLs.push(...e.weights);if(!e.sharedT1)sourceURLs.push(e.url);}}await planSourceLoad(sourceURLs);const datasets=shared?shared.datasets:await Promise.all(entries.map(async e=>{const [rb,wb]=await Promise.all([sourceBuffer(local(e.url)),sourceBuffer(local(e.weights.url))]);const count=e.dimensions.reduce((a,b)=>a*b,1);if(rb.byteLength!==count*4||wb.byteLength!==count*4)throw Error('Hybrid texture size mismatch.');const wm=e.weights.voxelIndexToWorld||e.weights.affine;if(wm&&JSON.stringify(wm)!==JSON.stringify(e.voxelIndexToWorld))throw Error('Weight texture affine mismatch.');const dims=e.dimensions;if(e.weights.dimensions.some((n,i)=>n!==dims[i]))throw Error('Weight texture grid mismatch.');const tex=new THREE.Data3DTexture(new Float32Array(rb),...dims);tex.format=THREE.RedFormat;tex.type=THREE.FloatType;const weights=new THREE.Data3DTexture(new Uint8Array(wb),...dims);weights.format=THREE.RGBAFormat;weights.type=THREE.UnsignedByteType;for(const t of [tex,weights]){t.minFilter=t.magFilter=THREE.LinearFilter;t.unpackAlignment=1;t.needsUpdate=true;}const m=matrix(e.voxelIndexToWorld),bounds=new THREE.Box3();for(const x of [-.5,dims[0]-.5])for(const y of [-.5,dims[1]-.5])for(const z of [-.5,dims[2]-.5])bounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(m));return {entry:e,tex,weights,m,bounds,bytes:rb.byteLength+wb.byteLength};}));
 if(!this.renderer.extensions.has('OES_texture_float_linear'))throw Error('Float interpolation unsupported on this GPU.');this.datasets=datasets;if(shared){this.regionTexture=shared.regionTexture;this.regionData=shared.regionData;this.regionDims=shared.regionDims;this.regionInverse=shared.regionInverse.clone();this.regionIndex=new THREE.Vector3();this.regionInfo=shared.regionInfo;}else await this.loadRegions(this.manifest.angiography.compartments);await this.structures.initialize(structureURL,structureManifest);for(const slot of this.structures.slots)if(slot.sharedT1&&slot.data.entry.sourceScalarId!==this.datasets[1].entry.id)throw Error('Shared source identity mismatch.');const [a,h]=datasets,bounds=a.bounds.clone().union(h.bounds);this.headBounds=bounds.clone();this.bounds=bounds;const curve=e=>{const points=e.opacityPoints.map(p=>new THREE.Vector2(...p));while(points.length<16)points.push(points.at(-1).clone());return points;};this.depthMaxMM=Number(this.manifest.head.depth?.maxDepthMM)||0;this.u={aLight:{value:new THREE.Vector4(1,1,1,1)},hLight:{value:new THREE.Vector3(1,1,1)},faceLight:{value:1},stepMM:{value:.45},nativeSignal:{value:false},aRegions:{value:this.regionTexture},surfaceContextOpacity:{value:0},faceContextOpacity:{value:0},faceContextColor:{value:new THREE.Color('#b58ca5')},facialGrouping:{value:true},brainDepthRange:{value:new THREE.Vector2(0,this.depthMaxMM)},brainDepthMax:{value:this.depthMaxMM},brainDepthFeather:{value:.75},hForward:{value:h.m},classColorOnly:{value:false},aData:{value:a.tex},aWeights:{value:a.weights},hData:{value:h.tex},hWeights:{value:h.weights},aDims:{value:new THREE.Vector3(...a.entry.dimensions)},hDims:{value:new THREE.Vector3(...h.entry.dimensions)},aInverse:{value:a.m.clone().invert()},hInverse:{value:h.m.clone().invert()},aGradient:{value:new THREE.Matrix3().setFromMatrix4(a.m).invert().transpose()},hGradient:{value:new THREE.Matrix3().setFromMatrix4(h.m).invert().transpose()},aTF:{value:curve(a.entry)},hTF:{value:curve(h.entry)},aCount:{value:a.entry.opacityPoints.length},hCount:{value:h.entry.opacityPoints.length},bMin:{value:bounds.min},bMax:{value:bounds.max},offset:{value:new THREE.Vector3()},meshDepth:{value:this.target.depthTexture},invProjection:{value:this.camera.projectionMatrixInverse},cameraWorld:{value:this.camera.matrixWorld},screenSize:{value:new THREE.Vector2()},density:{value:1},lightGain:{value:1},tissueStyle:{value:1},viewProjection:{value:new THREE.Matrix4()},rawOpacity:{value:0},rawColor:{value:new THREE.Color('#a4afb7')},classOpacity:{value:new THREE.Vector3(1,1,1)},headOpacity:{value:new THREE.Vector3(.14,0,0)},aColor:{value:new THREE.Color('#f66d55')},vColor:{value:new THREE.Color('#459ddb')},oColor:{value:new THREE.Color('#e3af55')},brainColor:{value:new THREE.Color('#a8dce9')},headColor:{value:new THREE.Color('#aacbd5')},deepHeadColor:{value:new THREE.Color('#bd9e97')}};
 Object.assign(this.u,this.structures.u);const extraShader=this.structures.shader(new Set(['eyes','cortex023']));const fragment=baseFragment.replace('/* EXTRA_HELPERS */',extraShader.helpers).replace('/* EXTRA_SETUP */',extraShader.setup).replace('/* EXTRA_INTEGRATE */',extraShader.integrate);const required=7+(this.structures.slots.some(s=>s.weightAtlas)?1:0)+this.structures.slots.filter(s=>!s.spineAtlas&&!s.weightAtlas).reduce((n,s)=>n+s.packCount+(s.sharedT1?0:1),0);if(this.renderer.capabilities.maxTextures<required)throw Error('This candidate needs '+required+' texture units; this device does not expose enough texture units.');
 const g=new THREE.BoxGeometry(...bounds.getSize(new THREE.Vector3()).toArray());g.translate(...bounds.getCenter(new THREE.Vector3()).toArray());const material=new THREE.ShaderMaterial({defines:{},uniforms:this.u,vertexShader:vertex,fragmentShader:fragment,side:THREE.BackSide,transparent:true,depthWrite:true,depthTest:true,depthFunc:THREE.AlwaysDepth});this.mesh=new THREE.Mesh(g,material);this.volumeScene.add(this.mesh);this.variants=new Map([['eyes,cortex023',material]]);this.variantKey='eyes,cortex023';this.ready=true;}catch(e){this.error=e.message;throw e;}}
 updateVariant(){
 const ids=this.structures.slots.filter(s=>this.structures.u[`e${s.index}Enabled`].value).map(s=>s.id),key=ids.join(',');
 if(key===this.variantKey)return;
 let material=this.variants.get(key);
 if(!material){const extra=this.structures.shader(new Set(ids)),fragment=baseFragment.replace('/* EXTRA_HELPERS */',extra.helpers).replace('/* EXTRA_SETUP */',extra.setup).replace('/* EXTRA_INTEGRATE */',extra.integrate);material=new THREE.ShaderMaterial({defines:ids.includes('flair023')?{INCLUDE_FLAIR:1}:{},uniforms:this.u,vertexShader:vertex,fragmentShader:fragment,side:THREE.BackSide,transparent:true,depthWrite:true,depthTest:true,depthFunc:THREE.AlwaysDepth});}
 this.variants.delete(key);this.variants.set(key,material);this.mesh.material=material;this.variantKey=key;
 while(this.variants.size>8){const oldest=this.variants.keys().next().value;this.variants.get(oldest).dispose();this.variants.delete(oldest);}
 }
 sync(current,state,layer,preset,density){this.active=!!(this.ready&&current&&current.edition==='008'&&true);if(!this.active)return;const s=k=>{const p=layer(k);return current.study!=='spine'&&p.visible?p.opacity:0;};this.u.aLight.value.set(...["arterial","venous","uncertain","unclassified-scan"].map(k=>layer(k).lighting??1));this.u.hLight.value.set(state.brainLighting??1,layer("head-envelope").lighting??1,1);this.u.faceLight.value=layer("facial-context").lighting??1;this.u.nativeSignal.value=current.study!=='spine'&&!!document.getElementById("nativeSignal")?.checked;this.u.brainDepthRange.value.set(...state.brainDepth);this.structures.sync(current,layer,density,preset);this.updateVariant();
      this.u.cInspect.value=false;this.updateBounds(current);this.u.classOpacity.value.set(s('arterial'),s('venous'),s('uncertain'));this.u.rawOpacity.value=s('unclassified-scan');this.u.rawColor.value.set(layer('unclassified-scan').color);this.u.faceContextOpacity.value=s('facial-context');this.u.faceContextColor.value.set(layer('facial-context').color);this.u.facialGrouping.value=true;const outer=s('head-envelope');this.u.surfaceContextOpacity.value=s('skin-outer');this.u.headOpacity.value.set(preset==='vessels'||current.study==='spine'?0:state.brainOpacity,outer,0);for(const [uniform,key] of [['aColor','arterial'],['vColor','venous'],['oColor','uncertain'],['headColor','head-envelope'],['deepHeadColor','skin-outer']])this.u[uniform].value.set(layer(key).color);this.u.brainColor.value.set(state.brainColor);this.u.density.value=density;this.u.classColorOnly.value=false;this.u.tissueStyle.value=document.getElementById('tissueStyle')?.value==='volume'?0:1;this.u.lightGain.value=+(document.getElementById("lighting")?.value??100)/100;this.mesh.position.copy(current.root.position);this.u.offset.value.copy(current.root.position);}

 async loadRegions(e){
  if(!e||e.channels?.[2]!=='nasal-context-fraction017')throw Error('Reviewed017 context fields are not available yet.');
  const d=this.datasets[0],dims=d.entry.dimensions;
  if(JSON.stringify(e.dimensions)!==JSON.stringify(dims)||JSON.stringify(e.voxelIndexToWorld)!==JSON.stringify(d.entry.voxelIndexToWorld))throw Error('Location field grid mismatch.');
  const bytes=await sourceBuffer(local(e.url));if(bytes.byteLength!==dims.reduce((x,y)=>x*y,1)*4)throw Error('Location field size mismatch.');
  this.regionData=new Uint8Array(bytes);this.regionInfo=e;
  const t=new THREE.Data3DTexture(this.regionData,...dims);t.format=THREE.RGBAFormat;t.type=THREE.UnsignedByteType;t.minFilter=t.magFilter=THREE.LinearFilter;t.unpackAlignment=1;t.needsUpdate=true;this.regionTexture=t;
 }
 updateBounds(current){if(this.boundsStudy===current.study)return;this.boundsStudy=current.study;const b=this.structures.getBounds(current);if(current.study!=='spine')b.union(this.headBounds);this.bounds=b;this.u.bMin.value=b.min;this.u.bMax.value=b.max;const g=new THREE.BoxGeometry(...b.getSize(new THREE.Vector3()).toArray());g.translate(...b.getCenter(new THREE.Vector3()).toArray());this.mesh.geometry.dispose();this.mesh.geometry=g;}
 async setCoverage(id){const serial=++this.coverageSerial;if(!this.coverage){const r=await fetch(local('./data/vascular-coverage.json'));if(!r.ok)throw Error('Vascular coverage options unavailable');this.coverage=await r.json();this.coverageCache.set(this.manifest.angiography.coverageId||'original',this.datasets[0].weights);}const option=this.coverage.options.find(o=>o.id===id);if(!option)throw Error('Unknown vascular coverage');let tex=this.coverageCache.get(id);if(!tex){const bytes=await sourceBuffer(local(option.weights.url)),dims=this.datasets[0].entry.dimensions;if(bytes.byteLength!==dims.reduce((a,b)=>a*b,1)*4||JSON.stringify(option.weights.dimensions)!==JSON.stringify(dims)||JSON.stringify(option.weights.voxelIndexToWorld)!==JSON.stringify(this.datasets[0].entry.voxelIndexToWorld))throw Error('Vascular coverage grid mismatch');tex=new THREE.Data3DTexture(new Uint8Array(bytes),...dims);tex.format=THREE.RGBAFormat;tex.type=THREE.UnsignedByteType;tex.minFilter=tex.magFilter=THREE.LinearFilter;tex.unpackAlignment=1;tex.needsUpdate=true;this.coverageCache.set(id,tex);}if(serial!==this.coverageSerial)return;this.u.aWeights.value=tex;this.coverageId=id;}
 render(current){
 if(!this.active||!current){this.renderer.render(this.scene,this.camera);return;}
 const r=this.renderer;this.camera.updateMatrixWorld();this.u.viewProjection.value.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
 const saved=[];this.scene.traverse(m=>{if(m.isMesh){saved.push([m,m.visible]);m.visible=false;}});
 r.setRenderTarget(null);r.render(this.scene,this.camera);
 const auto=r.autoClear;r.autoClear=false;r.render(this.volumeScene,this.camera);
 this.overlayCount=0;
 for(const [m,v] of saved)m.visible=v;r.autoClear=auto;
 }
 inspect(){return {shaderVariants:this.variants?.size,activeVariant:this.variantKey,locationPartition:{channels:this.regionInfo?.channels,surfaceContextOpacity:this.u?.surfaceContextOpacity.value,facialGrouping:this.u?.facialGrouping.value,faceContextOpacity:this.u?.faceContextOpacity.value,faceContextColor:this.u?.faceContextColor.value.getHexString(),definition:'Only reviewed surface enhancement follows skin; supported extracranial vessels remain independent'},brainDepth:{rangeMM:this.u?.brainDepthRange.value.toArray(),maxDepthMM:this.depthMaxMM||0,featherMM:.75,available:!!this.depthMaxMM,definition:'Depth below enclosing brain surface; not cortical thickness'},coverage:this.coverageId,classColorOnly:this.u?.classColorOnly.value,structures:this.structures.inspect(),ready:this.ready,error:this.error,active:this.active,opaqueDepthOcclusion:true,transparentComposition:'all selected source signals share one physical ray integration; legacy anatomy meshes never enter source display',tissueStyle:'direct-volume',tissueSurfaceThreshold:null,legacyAnatomyRendered:false,reconstruction:'Native evidence and provisional scan-supported anatomy; generated anatomy withdrawn; no meshes or claimed new measured detail',transparentOverlayCount:this.overlayCount,classes:this.u?.classOpacity.value.toArray(),unclassifiedScanOpacity:this.u?.rawOpacity.value,unclassifiedScanColor:this.u?.rawColor.value.getHexString(),lightGain:this.u?.lightGain.value,headOpacity:this.u?.headOpacity.value.toArray(),physicalOffset:this.u?.offset.value.toArray(),bounds:this.bounds?[this.bounds.min.toArray(),this.bounds.max.toArray()]:null,datasets:this.datasets?.map(d=>({id:d.entry.id,dimensions:d.entry.dimensions,indexToWeb:d.m.toArray(),bytes:d.bytes}))};}
}
