const allowed=new Set(['https://container-load-planner.pages.dev','https://container-load-planner-gray.vercel.app','https://container-load-planner.guodongbuding66.workers.dev']);
const fragment=new URLSearchParams(location.hash.slice(1)),origin=fragment.get('origin'),channel=fragment.get('channel');
const status=document.getElementById('status');
async function api(path,method='GET',body){const response=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok){if(response.status===401)throw Error('请先登录外贸 OS，再点击重新检查登录');throw Error(data.error||'请求未完成');}return data;}
const send=data=>{if(allowed.has(origin)&&window.opener)window.opener.postMessage({channel,...data},origin);};
async function ready(){try{const data=await api('/api/auth/me');status.textContent='已连接团队：'+data.tenant.name+'。请回到装柜页操作。';send({type:'ready'});}catch(e){status.textContent=e.message;send({type:'error',message:e.message});}}
window.addEventListener('message',async e=>{
  if(!allowed.has(e.origin)||e.origin!==origin||e.source!==window.opener||e.data?.channel!==channel||e.data?.type!=='request')return;
  const {id,action,args={}}=e.data;
  try{let result;
    if(action==='list')result=await api('/api/cargo-workspaces');
    else if(action==='save')result=await api('/api/cargo-workspaces','POST',{name:args.name,payload:args.payload});
    else if(action==='load')result=await api('/api/cargo-workspaces?id='+encodeURIComponent(args.id));
    else if(action==='share')result=await api('/api/cargo-shares','POST',{workspaceId:args.id,days:args.days});
    else if(action==='shares')result=await api('/api/cargo-shares');
    else if(action==='revoke')result=await api('/api/cargo-shares','DELETE',{id:args.id});
    else if(action==='orders')result=await api('/api/orders');
    else if(action==='order')result=await api('/api/orders/'+encodeURIComponent(args.id));
    else if(action==='skus')result=await api('/api/skus');
    else if(action==='sendplan')result=await api('/api/cargo-load-plan','POST',args.plan);
    else throw Error('不支持的操作');
    send({type:'response',id,result});status.textContent='操作完成，请回到装柜页。';
  }catch(e){send({type:'response',id,error:e.message});status.textContent=e.message;}
});document.getElementById('retry').onclick=ready;
if(allowed.has(origin)&&channel&&window.opener)ready();else status.textContent='请从装柜智算的云工作区入口打开此页面。';
