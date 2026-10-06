// Bounded, shared transport. Each consumer owns its cancellation separately.
const metrics={requests:0,encodedBytes:0,expectedEncodedBytes:0,decodedBytes:0,deduplicated:0,active:0,maxActive:0,abortedRequests:0,indexRefreshes:0};
window.sourceMetrics=metrics;
const inFlight=new Map(),queue=[],jobs=new Map(),workers=[],decodeQueue=[];
let nextId=0,closed=false;
let indexPromise=fetch('./data/transport.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Source index unavailable');return r.json();});
export async function planSourceLoad(urls) {
 const index=await indexPromise;
 const paths=new Set(urls.map(url=>new URL(url,document.baseURI).pathname));
 metrics.expectedEncodedBytes=[...paths].reduce((total,path)=>total+(index.entries[path]?.encoded_bytes||0),0);
 progress();
}
const abortError=()=>new DOMException('Aborted','AbortError');
function progress(){metrics.receivedBytes=metrics.encodedBytes+[...inFlight.values()].reduce((total,record)=>total+(record.received||0),0);dispatchEvent(new CustomEvent('source-progress',{detail:{...metrics,queued:queue.length}}));}
async function readSource(response,record,expectedBytes){
 if(!response.body?.getReader)return response.arrayBuffer();
 const reader=response.body.getReader();let data=new Uint8Array(expectedBytes||1048576),offset=0,lastUpdate=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;if(offset+value.byteLength>data.byteLength){const larger=new Uint8Array(Math.max(offset+value.byteLength,data.byteLength*2));larger.set(data);data=larger;}data.set(value,offset);offset+=value.byteLength;record.received=offset;const now=performance.now();if(now-lastUpdate>100){progress();lastUpdate=now;}}progress();return offset===data.byteLength?data.buffer:data.buffer.slice(0,offset);}finally{reader.releaseLock();}
}
function worker(){
 const w=new Worker(new URL('./asset-worker.js',import.meta.url),{type:'module'});w.busy=false;
 w.onmessage=({data})=>{const j=jobs.get(data.id);jobs.delete(data.id);w.busy=false;if(j){data.error?j.reject(Error(data.error)):j.resolve(data.buffer);}pump();};
 w.onerror=()=>{for(const [id,j]of jobs)if(j.worker===w){j.reject(Error('Source decode worker failed'));jobs.delete(id);}w.busy=false;pump();};workers.push(w);return w;
}
function pump(){if(closed)return;for(let i=0;i<2&&decodeQueue.length;i++){const w=workers[i]||worker();if(w.busy)continue;const j=decodeQueue.shift();w.busy=true;j.worker=w;jobs.set(j.id,j);w.postMessage({id:j.id,buffer:j.buffer,entry:j.entry},[j.buffer]);}}
function decode(buffer,entry){return new Promise((resolve,reject)=>{decodeQueue.push({id:++nextId,buffer,entry,resolve,reject});pump();});}
export const decodeGzip=(buffer,entry)=>decode(buffer,{...entry,encoding:'gzip'});
async function acquire(signal){
 if(signal.aborted)throw abortError();
 if(metrics.active<4){metrics.active++;metrics.maxActive=Math.max(metrics.maxActive,metrics.active);}
 else await new Promise((resolve,reject)=>{
  const ticket={resolve:()=>{signal.removeEventListener('abort',cancel);resolve();},reject};
  const cancel=()=>{const index=queue.indexOf(ticket);if(index>=0){queue.splice(index,1);reject(abortError());progress();}};
  queue.push(ticket);signal.addEventListener('abort',cancel,{once:true});
 });
 progress();
}
function release(){if(queue.length)queue.shift().resolve();else metrics.active--;progress();}
function subscribe(record,signal){
 const owner={};record.owners.add(owner);
 return new Promise((resolve,reject)=>{
  let done=false;
  const finish=(fn,value)=>{if(done)return;done=true;record.owners.delete(owner);signal?.removeEventListener('abort',cancel);fn(value);};
  const cancel=()=>{
   finish(reject,abortError());
   if(!record.settled&&!record.owners.size&&!record.controller.signal.aborted){
    metrics.abortedRequests++;record.controller.abort();
    if(inFlight.get(record.key)===record)inFlight.delete(record.key);
   }
  };
  record.promise.then(value=>finish(resolve,value),error=>finish(reject,error));
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 });
}
export async function sourceBuffer(url,signal){
 if(closed)throw Error('Source transport closed');if(signal?.aborted)throw abortError();
 const target=new URL(url,document.baseURI);if(target.origin!==location.origin)throw Error('Source assets must stay local.');
 if(inFlight.has(target.href)){metrics.deduplicated++;return subscribe(inFlight.get(target.href),signal);}
 const record={key:target.href,controller:new AbortController(),owners:new Set(),settled:false};
 record.promise=(async()=>{
  let acquired=false;const signal=record.controller.signal;
  try{
   await acquire(signal);acquired=true;signal.throwIfAborted();
   let index=await indexPromise,entry=index.entries[target.pathname];if(!entry&&/\/data\/assets\/[a-f0-9]{64}\.bin$/.test(target.pathname)){index=await refreshIndex();entry=index.entries[target.pathname];if(!entry)throw Error('Source asset is absent from the current index');}const destination=entry?new URL(entry.url,document.baseURI):target;
   for(let attempt=0;attempt<3;attempt++){
    record.received=0;signal.throwIfAborted();
    try{
     const response=await fetch(destination,{signal});
     if(!response.ok){await response.body?.cancel();if(![502,503,504].includes(response.status)||attempt===2)throw Error('Source HTTP '+response.status);}
     else{
      const bytes=await readSource(response,record,entry?.encoded_bytes);signal.throwIfAborted();metrics.requests++;metrics.encodedBytes+=bytes.byteLength;record.received=0;
      const result=entry?await decode(bytes,entry):bytes;signal.throwIfAborted();metrics.decodedBytes+=result.byteLength;progress();return result;
     }
    }catch(e){if(!(e instanceof TypeError)||attempt===2||signal.aborted)throw e;}
    await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
   }
  }finally{record.settled=true;if(acquired)release();if(inFlight.get(target.href)===record)inFlight.delete(target.href);}
 })();
 inFlight.set(target.href,record);return subscribe(record,signal);
}
addEventListener('pagehide',()=>{closed=true;for(const record of inFlight.values())record.controller.abort();for(const w of workers)w.terminate();const error=Error('Page closed');for(const j of [...queue,...decodeQueue,...jobs.values()])j.reject(error);queue.length=decodeQueue.length=0;jobs.clear();});

let indexRefresh=null;
function refreshIndex(){if(!indexRefresh){metrics.indexRefreshes++;indexRefresh=fetch('./data/transport.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Source index unavailable');return r.json();}).then(index=>{indexPromise=Promise.resolve(index);return index;}).finally(()=>indexRefresh=null);}return indexRefresh;}
