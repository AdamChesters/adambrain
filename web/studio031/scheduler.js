// Sleep while settled. Active motion uses stable deadlines capped at 60 fps.
export function createFrameScheduler(draw,continues){
 let frame=0,drawing=false,requested=false,disposed=false,last=null,due=0;
 const interval=1000/60;
 const stats={callbacks:0,wakes:0,targetFPS:60};
 function queue(){frame=requestAnimationFrame(tick);}
 function wake(){if(disposed||document.hidden)return;requested=true;stats.wakes++;if(!drawing&&!frame)queue();}
 function tick(time){frame=0;if(disposed||document.hidden)return;
  stats.callbacks++;
  if(last===null)due=time;
  if(last!==null&&time<due-.1){queue();return;}
  drawing=true;requested=false;
  const dt=last===null?interval/1000:Math.max(0,Math.min(.1,(time-last)/1000));last=time;
  // Advance the deadline, not the previous draw time: fractional refresh ratios
  // stay on rate without accumulating drift or bursting after a delayed frame.
  due=due>0&&time-due<interval?due+interval:time+interval;
  try{draw(time,dt);}finally{drawing=false;if(requested||continues())queue();else{last=null;due=0;}}
 }
 function stop(){cancelAnimationFrame(frame);frame=0;requested=false;last=null;due=0;}
 const visibility=()=>document.hidden?stop():wake();document.addEventListener('visibilitychange',visibility);
 function dispose(){disposed=true;stop();document.removeEventListener('visibilitychange',visibility);}
 return {wake,stop,dispose,stats,get pending(){return !!frame;}};
}
