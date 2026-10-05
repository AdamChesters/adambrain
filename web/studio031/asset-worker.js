self.onmessage=async({data:{id,buffer,entry}})=>{
 try{
  const decoded=entry.encoding==='gzip'?await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():buffer;
  if(decoded.byteLength!==entry.bytes)throw Error('Source length mismatch');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',decoded)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==entry.sha256)throw Error('Source checksum mismatch');
  self.postMessage({id,buffer:decoded},[decoded]);
 }catch(e){self.postMessage({id,error:e.message});}
};
