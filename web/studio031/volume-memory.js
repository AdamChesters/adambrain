// Display-volume memory: half-float scalars, CPU copies freed after GPU upload,
// and 2^3-voxel support bricks kept for empty-space skipping.
// Test switches: ?half=1 stores scalars as half-float (stalled the first frame on an Adreno 650),
// ?keep=1 keeps CPU copies.
const params=new URLSearchParams(location.search);
export const useHalf=params.get('half')==='1',keepCopies=params.get('keep')==='1';
const base=new Uint16Array(512),shift=new Uint8Array(512);
for(let i=0;i<256;i++){const e=i-127;let b,s;
 if(e<-27){b=0;s=24;}else if(e<-14){b=0x0400>>(-e-14);s=-e-1;}else if(e<=15){b=(e+15)<<10;s=13;}else if(e<128){b=0x7c00;s=24;}else{b=0x7c00;s=13;}
 base[i]=b;base[i|0x100]=b|0x8000;shift[i]=shift[i|0x100]=s;}
export function halfData(f32){if(!useHalf)return f32;const u=new Uint32Array(f32.buffer,f32.byteOffset,f32.length),out=new Uint16Array(f32.length);for(let i=0;i<u.length;i++){const b=u[i],e=b>>>23;out[i]=base[e]+((b&0x7fffff)>>shift[e]);}return out;}
export const brickDims=dims=>dims.map(n=>n+1>>1);
function bricks(dims,visit){const [X,Y,Z]=dims,[BX,BY,BZ]=brickDims(dims),out=new Uint8Array(BX*BY*BZ);for(let z=0,o=0;z<Z;z++)for(let y=0;y<Y;y++){const row=((z>>1)*BY+(y>>1))*BX;for(let x=0;x<X;x++,o++){const v=visit(o);if(v)out[row+(x>>1)]|=v;}}return out;}
// 1 where any voxel in the brick exceeds the opacity curve's zero point.
export const scalarBricks=(f32,dims,threshold)=>bricks(dims,o=>f32[o]>threshold?1:0);
// Bit c set where channel c is non-zero anywhere in the brick.
export const weightBricks=(u8,dims)=>bricks(dims,o=>(u8[o*4]?1:0)|(u8[o*4+1]?2:0)|(u8[o*4+2]?4:0)|(u8[o*4+3]?8:0));
export function threshold(points){const j=points.findIndex(p=>p[1]>1e-5);return j<=0?-Infinity:points[j-1][0];}
// A context restore reloads the viewer, so the uploaded arrays are not needed again.
export function releaseAfterUpload(tex){if(keepCopies)return tex;tex.cpuBytes=tex.image.data.byteLength;tex.onUpdate=()=>{tex.image.data=null;tex.onUpdate=null;};return tex;}
export const textureBytes=tex=>tex.image.data?.byteLength??tex.cpuBytes??0;
