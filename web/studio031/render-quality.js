/** Screen quality: adapt moving work, then refine the stationary image. */
export function createRenderQuality({initialPixels=700000,minPixels=65536,targetMS=1000/30}={}){
 let budget=initialPixels,stillBudget=null,mode='auto',samples=0,lastMS=null,source=null,motionPeak=0,wasMoving=false;
 function setMode(value){if(!['auto','performance','mobile','detail'].includes(value))return false;mode=value;budget=value==='performance'?350000:initialPixels;stillBudget=null;motionPeak=0;wasMoving=false;samples=0;lastMS=null;source=null;return true;}
 function observe(ms,pixels,kind='gpu',phase='moving'){
  if(mode==='detail'||!Number.isFinite(ms)||ms<=0||!Number.isFinite(pixels)||pixels<=0)return;
  lastMS=ms;source=kind;samples++;
  // Performance uses predictable fixed budgets. Delayed samples from a different
  // motion phase cannot train either moving or stationary resolution.
  if(mode==='performance'||mode==='mobile'||phase==='ignore')return;
  const desired=Math.max(minPixels,pixels*targetMS/Math.max(ms,1));
  if(phase==='still'){
   stillBudget=Math.max(stillBudget??budget,budget,initialPixels,motionPeak);
   // Fine stationary ray sampling costs more. Never respond by pixelating the
   // settled image; only increase its resolution when the measured load allows.
   if(ms<targetMS*.7)stillBudget=Math.max(stillBudget,Math.min(desired,stillBudget*1.10));
  }else{
   stillBudget=null;
   if(ms>targetMS*1.15)budget=Math.min(budget,desired*.9);
   else if(ms<targetMS*.7)budget=Math.max(budget,Math.min(desired,budget*1.10));
   budget=Math.max(minPixels,budget);
  }
 }
 function ratio(width,height,dpr=1,full=false,moving=true){
  const native=Math.min(Math.max(dpr,1),2),area=Math.max(1,width)*Math.max(1,height),nativePixels=area*native*native;
  if(full||mode==='detail')return native;
  if(mode==='performance')return Math.min(native,Math.sqrt((moving?350000:700000)/area));
  // Mobile stays at half full-detail dimensions when still; moving work is
  // heavily reduced even on small screens and capped on larger displays.
  if(mode==='mobile')return moving?Math.min(native*.15,Math.sqrt(65536/area)):native*.5;
  budget=Math.min(budget,nativePixels);
  if(moving){if(!wasMoving)motionPeak=0;wasMoving=true;motionPeak=Math.max(motionPeak,budget);stillBudget=null;return Math.min(native,Math.sqrt(budget/area));}
  wasMoving=false;
  stillBudget=Math.min(nativePixels,Math.max(stillBudget??budget,budget,initialPixels,motionPeak));
  return Math.min(native,Math.sqrt(stillBudget/area));
 }
 function inspect(){return {mode,budget_pixels:Math.round(budget),still_budget_pixels:stillBudget==null?null:Math.round(stillBudget),target_ms:targetMS,samples,last_ms:lastMS,timing_source:source};}
 return {setMode,observe,ratio,inspect};
}
