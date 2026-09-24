import {connectCloud} from './cloud.js';
import {completeConfirmation} from './auth-return.js';
const result = await completeConfirmation({
  url:location.href,
  connect:connectCloud,
  storage:{setItem:(key,value)=>localStorage.setItem(key,value)},
  clearUrl:()=>history.replaceState(null,'',location.pathname)
});
document.querySelector('#auth-status').textContent=result.message;
if(result.ok) location.replace('./#contacts');
