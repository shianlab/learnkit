'use strict';
function createSleepTimer(notify,now=()=>Date.now()){
  let state={mode:'off',deadline:null},timeout;
  function snapshot(){return {...state};}
  function cancel(){clearTimeout(timeout);state={mode:'off',deadline:null};}
  function check(){clearTimeout(timeout);if(state.mode==='deadline'){const remaining=state.deadline-now();if(remaining<=0){cancel();notify({type:'sleep-expired',timer:snapshot()});}else timeout=setTimeout(check,Math.min(remaining,30000));}return snapshot();}
  return {snapshot,check,
    set(options){if(!options||!['off','minutes','end'].includes(options.mode))throw new Error('无效定时设置');if(options.mode==='minutes'&&![5,15,30,45,60].includes(options.minutes))throw new Error('无效定时分钟数');cancel();if(options.mode==='minutes'){state={mode:'deadline',deadline:now()+options.minutes*60000};check();}else if(options.mode==='end')state={mode:'end',deadline:null};notify({type:'timer-changed',timer:snapshot()});return snapshot();},
    lessonEnded(){if(state.mode==='end'){cancel();notify({type:'sleep-expired',timer:snapshot()});return true;}const expired=state.mode==='deadline'&&state.deadline<=now();check();return expired;},
    close:cancel
  };
}
module.exports={createSleepTimer};
