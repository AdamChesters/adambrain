import {reduceSource} from './source-data.js?v=086.7';
// Lite mode halves every display volume per axis (1/8 memory) for phones and tablets.
// ?lite=1 forces it, ?lite=0 turns it off; otherwise touch-first devices use it.
const param=new URLSearchParams(location.search).get('lite');
export const lite=param==='1'||(param!=='0'&&matchMedia('(pointer: coarse)').matches);
const half=n=>n+1>>1;
// New index i maps to source index 2i+0.5, the centre of its 2x2x2 block.
function matrix(rows){if(!rows)return rows;const r=rows.map(row=>row.slice());for(let k=0;k<3;k++){r[k][3]+=.5*(r[k][0]+r[k][1]+r[k][2]);for(let j=0;j<3;j++)r[k][j]*=2;}return r;}
function grid(o,keys=['voxelIndexToWorld','voxelIndexToHeadRAS','voxelIndexToSpineWorld','affine']){for(const k of keys)if(o[k])o[k]=matrix(o[k]);}
function register(url,dims,kind,mode){if(url)reduceSource(url,{dims,kind,mode});}
export function liteVolumeGroups(m){
 if(!lite)return m;
 for(const [key,mode] of [['angiography','max'],['head','mean']]){const e=m[key],dims=e.dimensions.slice();
  register(e.url,dims,'f32',mode);e.dimensions=dims.map(half);grid(e);
  if(e.weights){register(e.weights.url,e.weights.dimensions,'rgba8',mode);e.weights.dimensions=e.weights.dimensions.map(half);grid(e.weights);}
  if(e.compartments){register(e.compartments.url,e.compartments.dimensions,'rgba8','mean');e.compartments.dimensions=e.compartments.dimensions.map(half);grid(e.compartments);}
  if(e.brainIndexBounds)e.brainIndexBounds=e.brainIndexBounds.map(b=>b.map(v=>v/2));
  if(e.spacingMM)e.spacingMM=e.spacingMM.map(v=>v*2);}
 return m;
}
export function liteCoverage(c,dims){
 if(!lite)return c;
 for(const o of c.options){if(!o.weights)continue;register(o.weights.url,o.weights.dimensions,'rgba8','max');o.weights.dimensions=o.weights.dimensions.map(half);grid(o.weights);}
 return c;
}
export function liteStructures(m){
 if(!lite)return m;
 // Atlas-packed sources keep full resolution; their offsets index the shared atlas.
 for(const e of m.datasets){if(e.weightAtlas||e.intensityAtlas||e.spineAtlas)continue;const dims=e.dimensions.slice();
  if(!e.sharedT1&&e.url)register(e.url,dims,'f32','mean');for(const url of e.weights||[])register(url,dims,'rgba8','mean');
  e.dimensions=dims.map(half);grid(e);if(e.spacing)e.spacing=e.spacing.map(v=>v*2);if(e.indexBounds)e.indexBounds=e.indexBounds.map(b=>b&&b.map(p=>p.map(v=>v/2)));}
 return m;
}
