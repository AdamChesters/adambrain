self.onmessage=async({data:{id,buffer,entry}})=>{
 try{
  const decoded=entry.encoding==='gzip'?await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():buffer;
  if(decoded.byteLength!==entry.bytes)throw Error('Source length mismatch');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',decoded)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==entry.sha256)throw Error('Source checksum mismatch');
  const out=entry.reduce?reduce(decoded,entry.reduce):decoded;
  self.postMessage({id,buffer:out},[out]);
 }catch(e){self.postMessage({id,error:e.message});}
};
// Lite display: each output voxel combines the 2x2x2 source block starting at 2i (edges clamp).
// Angiography keeps the block maximum so thin vessels stay continuous; other fields average.
function reduce(buffer,{dims:[X,Y,Z],kind,mode}){
 const C=kind==='rgba8'?4:1,src=kind==='rgba8'?new Uint8Array(buffer):new Float32Array(buffer),x2=X+1>>1,y2=Y+1>>1,z2=Z+1>>1,out=kind==='rgba8'?new Uint8Array(x2*y2*z2*4):new Float32Array(x2*y2*z2),max=mode==='max';
 for(let z=0,o=0;z<z2;z++){const za=2*z,zb=Math.min(za+1,Z-1);for(let y=0;y<y2;y++){const ya=2*y,yb=Math.min(ya+1,Y-1);for(let x=0;x<x2;x++,o++){const xa=2*x,xb=Math.min(xa+1,X-1);
  for(let c=0;c<C;c++){let acc=max?-Infinity:0;for(const zz of [za,zb])for(const yy of [ya,yb])for(const xx of [xa,xb]){const v=src[((zz*Y+yy)*X+xx)*C+c];acc=max?(v>acc?v:acc):acc+v;}out[o*C+c]=max?acc:(C===4?Math.round(acc/8):acc/8);}}}}
 return out.buffer;
}
