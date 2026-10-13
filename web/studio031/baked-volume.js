import * as THREE from 'three';

// Classify once, march cheaply. The full classification (every scan, weight field,
// opacity curve and control) runs once per grid voxel into a colour+opacity volume and
// is redone only when a control or a loaded layer changes. The per-frame ray march then
// reads three textures: occupancy, colour/opacity and normal/lighting.

const quadVertex = `varying vec3 p;varying vec3 eye;void main(){p=vec3(0.);eye=vec3(0.);gl_Position=vec4(position.xy,0.,1.);}`;

// Bake shaders reuse the volume shader's own declarations and per-sample body.
export function bakeFragment(base, mode) {
  const head = base.slice(0, base.indexOf('void main(){\n vec3 ray=normalize(p-eye);'));
  const body = base.slice(base.indexOf('  float extinction=0.;vec3 emitted=vec3(0.);'), base.indexOf('  if(extinction>.00001){float a='));
  const out = mode === 'mix'
    ? 'gl_FragColor=vec4(extinction>.00001?clamp(emitted.r/extinction,0.,1.):0.,0.,0.,1.);'
    : 'float aref=extinction>.00001?min(1.-exp(-extinction),.999):0.;vec3 col=extinction>.00001?clamp(emitted/extinction,0.,1.):vec3(0.);gl_FragColor=vec4(sqrt(col),sqrt(aref));';
  return head + `uniform vec3 bakeMin,bakeCell;uniform float bakeZ;
void main(){
 vec3 ray=vec3(0.,0.,1.),at=bakeMin+vec3(gl_FragCoord.xy,bakeZ+.5)*bakeCell;
 vec3 headGain=vec3(opticalGain(headOpacity.x),opticalGain(headOpacity.y),opticalGain(headOpacity.z));
${body}
 ${out}
}`;
}

// Normals from the classified opacity; alpha carries the per-voxel lighting mix.
const normalFragment = `precision highp float;precision highp sampler3D;
uniform sampler3D bakedColor,bakedMix;uniform ivec3 dims;uniform float bakeZ;
float a(ivec3 c){c=clamp(c,ivec3(0),dims-1);float v=texelFetch(bakedColor,c,0).a;return v*v;}
void main(){ivec3 c=ivec3(ivec2(gl_FragCoord.xy),int(bakeZ));
 vec3 g=vec3(a(c+ivec3(1,0,0))-a(c-ivec3(1,0,0)),a(c+ivec3(0,1,0))-a(c-ivec3(0,1,0)),a(c+ivec3(0,0,1))-a(c-ivec3(0,0,1)));
 float len=length(g);gl_FragColor=vec4(len>1e-4?g/len*.5+.5:vec3(.5),texelFetch(bakedMix,c,0).r);}`;

// One occupancy cell per OCC^3 voxels, padded one voxel for trilinear support.
const OCC = 4;
const occupancyFragment = `precision highp float;precision highp sampler3D;
uniform sampler3D bakedColor;uniform ivec3 dims;uniform float bakeZ;
void main(){ivec3 c=ivec3(ivec2(gl_FragCoord.xy),int(bakeZ))*${OCC};float m=0.;
 for(int z=-1;z<=${OCC};z++)for(int y=-1;y<=${OCC};y++)for(int x=-1;x<=${OCC};x++){ivec3 q=clamp(c+ivec3(x,y,z),ivec3(0),dims-1);m=max(m,texelFetch(bakedColor,q,0).a);}
 gl_FragColor=vec4(m>0.?1.:0.,0.,0.,1.);}`;

export const renderFragment = `precision highp float;precision highp sampler3D;
uniform sampler3D bakedColor,bakedNormal,bakedOcc;
uniform vec3 gridMin,gridSize,occDims,occCell,offset;uniform mat4 viewProjection;
uniform float stepMM,density,lightGain,jitter,frame;
varying vec3 p,eye;
vec3 shade(vec3 gradient,vec3 view,vec3 color){
 float len=length(gradient);if(len<.05)return color*.66;
 vec3 n=-gradient/len;if(dot(n,view)<0.)n=-n;
 vec3 light=normalize(vec3(-.4,.7,-.6));
 float diffuse=max(0.,dot(n,light)),front=max(0.,dot(n,view));
 return color*(.29+.59*lightGain*diffuse+.2*front)+vec3(.04)*lightGain*pow(max(0.,dot(n,normalize(light+view))),28.);
}
void main(){
 vec3 ray=normalize(p-eye),gridMax=gridMin+gridSize;
 vec3 t0=(gridMin-eye)/ray,t1=(gridMax-eye)/ray,nearT=min(t0,t1),farT=max(t0,t1);
 float enter=max(max(nearT.x,nearT.y),max(nearT.z,0.)),leave=min(min(farT.x,farT.y),farT.z);
 if(leave<=enter||density<=0.)discard;
 int steps=min(int(ceil((leave-enter)/(stepMM*.001))),2048);float dt=(leave-enter)/float(steps),mm=dt*1000.;
 // Interleaved gradient noise offsets each ray start while moving; still frames stay exact.
 float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy+frame*vec2(5.588238,7.348283),vec2(.06711056,.00583715))));
 vec3 start=eye+ray*(enter+dt*mix(.5,noise,jitter));
 vec4 accum=vec4(0.);float outputDepth=1.;int i=0;
 for(int k=0;k<2048;k++){
  if(i>=steps)break;
  vec3 at=start+ray*(dt*float(i)),t=(at-gridMin)/gridSize;
  ivec3 ci=ivec3(floor((at-gridMin)/occCell));
  int skip=0;
  if(any(lessThan(ci,ivec3(0)))||any(greaterThanEqual(ci,ivec3(occDims)))||texelFetch(bakedOcc,clamp(ci,ivec3(0),ivec3(occDims)-1),0).r<.5){
   vec3 lo=gridMin+vec3(ci)*occCell,tt=mix(at-lo,lo+occCell-at,step(0.,ray))/max(abs(ray),vec3(1e-6));
   skip=int(clamp(min(min(tt.x,tt.y),tt.z),0.,1.)/dt)+1;}
  if(skip>0){i+=skip;}else{
   vec4 c=texture(bakedColor,t);float aref=c.a*c.a;
   if(aref>1e-5){
    float a=1.-pow(1.-aref,density*mm);
    vec4 nl=texture(bakedNormal,t);vec3 col=c.rgb*c.rgb;
    col=mix(col,shade(nl.xyz*2.-1.,-ray,col),nl.a);
    accum.rgb+=(1.-accum.a)*a*col;accum.a+=(1.-accum.a)*a;
    if(accum.a>=.997){vec4 clip=viewProjection*vec4(at+offset,1.);outputDepth=clip.z/clip.w*.5+.5;accum.rgb/=accum.a;accum.a=1.;break;}
   }
   i++;}
 }
 if(accum.a<.003)discard;
 gl_FragColor=vec4(accum.rgb/max(accum.a,.00001),accum.a);gl_FragDepth=outputDepth;
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

// Uniforms that only affect drawing, never classification.
const renderOnly = new Set(['stepMM','viewProjection','offset','density','lightGain','meshDepth','invProjection','cameraWorld','screenSize','tissueStyle','cInspect','occGrid','occMin','occCell','occDims','occMask','occEnabled','bakeMin','bakeCell','bakeZ','hForward']);
function signature(u) {
  const parts = [];
  for (const [k, {value: v}] of Object.entries(u)) {
    if (renderOnly.has(k) || v == null) continue;
    if (v.isTexture) parts.push(k + ':' + v.uuid + '.' + v.version);
    else if (Array.isArray(v)) parts.push(k + ':' + v.map(x => x?.toArray ? x.toArray().join(',') : x?.isColor ? x.getHexString() : x).join(';'));
    else if (v.isColor) parts.push(k + ':' + v.getHexString());
    else if (v.toArray) parts.push(k + ':' + v.toArray().join(','));
    else parts.push(k + ':' + v);
  }
  return parts.join('|');
}

export class VolumeBaker {
  constructor(renderer, cellMM) {
    this.renderer = renderer; this.cellMM = cellMM; this.signature = ''; this.materials = new Map(); this.bakes = 0; this.lastBakeMS = 0;
    this.scene = new THREE.Scene(); this.camera = new THREE.Camera();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false; this.scene.add(this.quad);
    const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({vertexShader: quadVertex, fragmentShader, uniforms, depthTest: false, depthWrite: false});
    this.pu = {bakedColor: {value: null}, bakedMix: {value: null}, dims: {value: new THREE.Vector3()}, bakeZ: {value: 0}};
    this.normalPass = pass(normalFragment, this.pu);
    this.occPass = pass(occupancyFragment, this.pu);
    this.ru = {bakedColor: {value: null}, bakedNormal: {value: null}, bakedOcc: {value: null}, gridMin: {value: new THREE.Vector3()}, gridSize: {value: new THREE.Vector3()}, occDims: {value: new THREE.Vector3()}, occCell: {value: new THREE.Vector3()}, jitter: {value: 0}, frame: {value: 0}};
  }
  target(dims, format = THREE.RGBAFormat, linear = true) {
    const t = new THREE.WebGL3DRenderTarget(...dims, {format, type: THREE.UnsignedByteType, depthBuffer: false});
    t.texture.minFilter = t.texture.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
    t.texture.wrapS = t.texture.wrapT = t.texture.wrapR = THREE.ClampToEdgeWrapping;
    return t;
  }
  allocate(bounds) {
    const key = bounds.min.toArray().concat(bounds.max.toArray()).join(',');
    if (key === this.boundsKey) return;
    this.boundsKey = key; this.signature = '';
    for (const t of [this.color, this.mix, this.normal, this.occ]) t?.dispose();
    const cell = this.cellMM / 1000, size = bounds.getSize(new THREE.Vector3());
    this.dims = size.clone().divideScalar(cell).ceil().toArray();
    this.cell = new THREE.Vector3(size.x / this.dims[0], size.y / this.dims[1], size.z / this.dims[2]);
    this.occDims = this.dims.map(n => Math.ceil(n / OCC));
    this.color = this.target(this.dims); this.mix = this.target(this.dims, THREE.RedFormat, false);
    this.normal = this.target(this.dims); this.occ = this.target(this.occDims, THREE.RedFormat, false);
    this.min = bounds.min.clone(); this.size = size;
    Object.assign(this.ru.bakedColor, {value: this.color.texture}); this.ru.bakedNormal.value = this.normal.texture; this.ru.bakedOcc.value = this.occ.texture;
    this.ru.gridMin.value.copy(bounds.min); this.ru.gridSize.value.copy(size);
    // Occupancy covers whole cells; its extent can pass the grid edge.
    this.ru.occDims.value.set(...this.occDims); this.ru.gridSize.value.copy(size);
    this.ru.occCell.value.copy(this.cell).multiplyScalar(OCC);
  }
  material(key, mode, uniforms, build) {
    const id = key + '/' + mode;
    let m = this.materials.get(id);
    if (!m) { m = new THREE.ShaderMaterial({defines: build.defines(mode), vertexShader: quadVertex, fragmentShader: build.fragment(mode), uniforms, depthTest: false, depthWrite: false}); this.materials.set(id, m); }
    return m;
  }
  slices(target, depth, material) {
    const r = this.renderer; this.quad.material = material;
    for (let z = 0; z < depth; z++) { this.pu.bakeZ.value = z; if (material.uniforms.bakeZ) material.uniforms.bakeZ.value = z; r.setRenderTarget(target, z); r.render(this.scene, this.camera); }
  }
  // Rebakes when any classification input changed. Returns true when it baked.
  update(u, key, build, colours) {
    const sig = signature(u) + '#' + key;
    if (sig === this.signature) return false;
    const t0 = performance.now(), r = this.renderer, saved = r.getRenderTarget(), auto = r.autoClear;
    u.bakeMin = u.bakeMin || {value: new THREE.Vector3()}; u.bakeCell = u.bakeCell || {value: new THREE.Vector3()}; u.bakeZ = u.bakeZ || {value: 0};
    u.bakeMin.value.copy(this.min); u.bakeCell.value.copy(this.cell);
    r.autoClear = false;
    this.slices(this.color, this.dims[2], this.material(key, 'color', u, build));
    // Light-mix pass: unlit colours black, lit colour white, so emitted/extinction is the mix.
    const kept = colours.map(([name]) => [name, u[name].value]);
    for (const [name, black] of colours) u[name].value = black;
    try { this.slices(this.mix, this.dims[2], this.material(key, 'mix', u, build)); }
    finally { for (const [name, value] of kept) u[name].value = value; }
    this.pu.bakedColor.value = this.color.texture; this.pu.bakedMix.value = this.mix.texture; this.pu.dims.value.set(...this.dims);
    this.slices(this.normal, this.dims[2], this.normalPass);
    this.slices(this.occ, this.occDims[2], this.occPass);
    r.setRenderTarget(saved); r.autoClear = auto;
    this.signature = sig; this.bakes++; this.lastBakeMS = Math.round(performance.now() - t0);
    return true;
  }
  inspect() { return {cellMM: this.cellMM, dims: this.dims, occDims: this.occDims, bakes: this.bakes, lastBakeSubmitMS: this.lastBakeMS, materials: this.materials.size}; }
}
