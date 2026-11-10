'use strict';
const API='https://nhdqfexqymbdarbtmohj.supabase.co/functions/v1/capture-vault';
const $=id=>document.getElementById(id);
const purposes={general:'일반 사진 증빙',trade:'중고거래 · 물품 상태',profile:'맞선 · 프로필 제출',work:'작업 완료 · 현장 보고'};
let stream=null,session=null,photo=null,capturedAt=null,photoUrl=null,receiptUrl=null,facing='environment',mirrorFront=true,actualFacing='environment',busy=false,opening=false,cameraRun=0,currentToken=null,receiptRun=0;
const management=new Map();
function show(name){for(const id of ['home','capture','receipt'])$(id).hidden=id!==name;window.scrollTo({top:0,behavior:'instant'});$(name+'-title').focus({preventScroll:true});}
function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}$('video').srcObject=null;$('video').hidden=true;$('live-label').hidden=true;$('shutter').hidden=true;$('switch-camera').hidden=true;$('mirror-camera').hidden=true;}
function updateMirror(){const front=actualFacing==='user';$('mirror-camera').hidden=!front||!stream;$('mirror-camera').setAttribute('aria-pressed',String(mirrorFront));$('mirror-camera').textContent='전면 좌우반전 '+(mirrorFront?'켜짐':'꺼짐');$('video').style.transform=front&&mirrorFront?'scaleX(-1)':'none';}
function cameraError(message){$('camera-error').textContent=message;$('camera-error').hidden=false;}
async function request(action,{method='GET',tokenType,token,id,body,headers={}}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{const response=await fetch(API+'?action='+action,{method,headers:{...headers,...(tokenType?{['x-'+tokenType+'-token']:token}:{}),...(id?{'x-record-id':id}:{})},body,signal:controller.signal,cache:'no-store'});if(!response.ok){const failure=await response.json().catch(()=>({}));throw new Error(failure.error||'서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');}return response;}
 catch(e){if(e.name==='AbortError')throw new Error('서버 응답을 기다리는 시간이 길어졌습니다. 촬영본은 화면에 유지되니 다시 시도해 주세요.');throw e;}
 finally{clearTimeout(timer);}
}
async function startCamera({newSession=false}={}){
 if(busy||opening)return;opening=true;$('begin').disabled=true;$('retry-camera').disabled=true;$('switch-camera').disabled=true;$('retake').disabled=true;const run=++cameraRun;show('capture');stopCamera();photo=null;$('share-consent').checked=false;$('save-area').hidden=true;$('shot').hidden=true;$('retake').hidden=true;$('retry-camera').hidden=true;$('camera-error').hidden=true;$('camera-placeholder').hidden=false;$('camera-status').textContent='카메라를 연결하고 있습니다.';$('capture-purpose').textContent='제출 용도: '+purposes[$('purpose').value];
 if(newSession)session=null;
 try{
  if(!window.isSecureContext)throw new Error('카메라는 HTTPS 연결에서 사용할 수 있습니다. 공개 사이트에서 열어 주세요.');
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('이 브라우저에서는 카메라를 사용할 수 없습니다. 휴대전화의 Safari 또는 Chrome으로 열어 주세요.');
  let expired=false,permissionTimer;
  const streamRequest=navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1440}},audio:false});
  streamRequest.then(value=>{if(expired||run!==cameraRun)value.getTracks().forEach(t=>t.stop());},()=>{});
  let next;try{next=await Promise.race([streamRequest,new Promise((_,reject)=>{permissionTimer=setTimeout(()=>{expired=true;reject(new Error('카메라 권한 응답을 기다리고 있습니다. 허용 창을 확인한 뒤 다시 연결해 주세요.'));},30000);})]);}finally{clearTimeout(permissionTimer);}
  if(run!==cameraRun){next.getTracks().forEach(t=>t.stop());return;}stream=next;actualFacing=next.getVideoTracks()[0].getSettings().facingMode||facing;$('video').srcObject=next;$('video').hidden=false;await $('video').play();
  $('camera-placeholder').hidden=true;$('camera-status').textContent='서버에 촬영 세션을 준비하고 있습니다.';
  if(!session||Date.parse(session.expiresAt)<Date.now()+60000){session=await(await request('start',{method:'POST',body:JSON.stringify({purpose:$('purpose').value}),headers:{'Content-Type':'application/json'}})).json();}
  if(run!==cameraRun){stopCamera();return;}$('live-label').hidden=false;$('shutter').hidden=false;$('switch-camera').hidden=false;updateMirror();$('camera-status').textContent='준비됐습니다. 사진을 촬영해 주세요.';
 }catch(e){if(run!==cameraRun)return;stopCamera();$('camera-placeholder').hidden=false;$('camera-status').textContent='촬영을 시작하지 못했습니다.';
 const text=e.name==='NotAllowedError'?'카메라 사용이 허용되지 않았습니다. 브라우저 주소창의 카메라 권한을 허용한 뒤 다시 연결해 주세요.':e.name==='NotFoundError'?'연결된 카메라를 찾을 수 없습니다. 카메라가 있는 휴대전화에서 열거나 노트북 카메라 연결을 확인해 주세요.':e.name==='NotReadableError'?'다른 앱이 카메라를 사용 중일 수 있습니다. 다른 카메라 앱을 닫고 다시 연결해 주세요.':e.message||'카메라를 연결하지 못했습니다.';cameraError(text);$('retry-camera').hidden=false;}finally{opening=false;$('begin').disabled=false;$('retry-camera').disabled=false;$('switch-camera').disabled=false;$('retake').disabled=false;}
}
$('mirror-camera').addEventListener('click',()=>{if(stream&&!busy){mirrorFront=!mirrorFront;updateMirror();}});
$('begin').addEventListener('click',()=>startCamera({newSession:true}));$('retry-camera').addEventListener('click',()=>startCamera());$('retake').addEventListener('click',()=>startCamera());$('switch-camera').addEventListener('click',()=>{facing=facing==='environment'?'user':'environment';startCamera();});
$('shutter').addEventListener('click',async()=>{
 if(!stream||busy||!session)return;const v=$('video');if(!v.videoWidth||!v.videoHeight){cameraError('카메라 화면을 준비하고 있습니다. 잠시 후 다시 촬영해 주세요.');return;}
 const run=cameraRun;capturedAt=new Date().toISOString();const scale=Math.min(1,1920/Math.max(v.videoWidth,v.videoHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(v.videoWidth*scale);canvas.height=Math.round(v.videoHeight*scale);const ctx=canvas.getContext('2d');if(actualFacing==='user'&&mirrorFront){ctx.translate(canvas.width,0);ctx.scale(-1,1);}ctx.drawImage(v,0,0,canvas.width,canvas.height);$('shutter').disabled=true;
 try{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));if(run!==cameraRun)return;if(!blob)throw new Error('촬영본을 만들지 못했습니다. 다시 촬영해 주세요.');if(blob.size>5*1024*1024)throw new Error('촬영본이 너무 큽니다. 다시 촬영해 주세요.');photo=blob;stopCamera();if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(blob);$('shot').src=photoUrl;$('shot').hidden=false;$('retake').hidden=false;$('save-area').hidden=false;$('save-detail').textContent=canvas.width+' × '+canvas.height+' · '+(blob.size/1024/1024).toFixed(2)+' MB · 서버 저장 전';$('camera-status').textContent='촬영됐습니다. 사진을 확인한 뒤 원본을 보관하세요.';$('camera-error').hidden=true;}
 catch(e){cameraError(e.message);}finally{$('shutter').disabled=false;}
});
$('save').addEventListener('click',async()=>{
 if(busy||!photo||!session)return;if(!$('share-consent').checked){cameraError('링크를 가진 사람이 사진을 볼 수 있음을 먼저 확인해 주세요.');$('share-consent').focus();return;}
 busy=true;$('save').disabled=true;$('retake').disabled=true;$('capture-back').disabled=true;$('camera-error').hidden=true;$('camera-status').textContent='촬영본을 서버에 보관하고 있습니다. 화면을 닫지 마세요.';
 try{const response=await request('seal',{method:'POST',tokenType:'upload',token:session.uploadToken,id:session.id,body:photo,headers:{'Content-Type':'image/jpeg','x-captured-at':capturedAt}});const record=await response.json();const digest=await sha256(await photo.arrayBuffer());if(record.sha256!==digest)throw new Error('서버 보관 확인값이 촬영본과 다릅니다. 확인 링크를 제출하지 마세요.');management.set(session.viewToken,{id:session.id,ownerToken:session.ownerToken});try{sessionStorage.setItem('barocheck-owner:'+session.viewToken,JSON.stringify(management.get(session.viewToken)));}catch{}location.hash='/v/'+session.viewToken;photo=null;}
 catch(e){cameraError(e.message);$('camera-status').textContent='서버 보관을 완료하지 못했습니다. 촬영본을 유지했습니다.';}
 finally{busy=false;$('save').disabled=false;$('retake').disabled=false;$('capture-back').disabled=false;}
});
async function sha256(buffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),x=>x.toString(16).padStart(2,'0')).join('');}
function owner(token){if(management.has(token))return management.get(token);try{return JSON.parse(sessionStorage.getItem('barocheck-owner:'+token)||'null');}catch{return null;}}
async function viewReceipt(token){
 stopCamera();++cameraRun;const run=++receiptRun;currentToken=token;show('receipt');$('receipt-loading').hidden=false;$('receipt-error').hidden=true;$('retry-receipt').hidden=true;$('receipt-content').hidden=true;$('stored-badge').hidden=true;
 try{if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('확인 링크 형식이 올바르지 않습니다. 전달받은 링크 전체를 다시 열어 주세요.');const record=await(await request('view',{tokenType:'view',token})).json();const response=await request('image',{tokenType:'view',token}),blob=await response.blob();const digest=await sha256(await blob.arrayBuffer());if(run!==receiptRun)return;if(digest!==record.sha256)throw new Error('사진이 서버 기록의 확인값과 다릅니다. 이 사진을 원본으로 신뢰하지 마세요.');
  if(receiptUrl)URL.revokeObjectURL(receiptUrl);receiptUrl=URL.createObjectURL(blob);$('original').src=receiptUrl;$('record-purpose').textContent=purposes[record.purpose]||'일반 사진 증빙';const date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' (한국 시간)':'기록 없음';$('received-at').textContent=date(record.receivedAt);$('captured-at').textContent=date(record.clientCapturedAt);$('record-size').textContent=record.width+' × '+record.height+' · '+(record.byteSize/1024/1024).toFixed(2)+' MB';$('record-id').textContent=record.id;$('record-hash').textContent=record.sha256;$('integrity').textContent='확인 완료 · 이 사진의 SHA-256이 서버에 기록된 원본 확인값과 일치합니다.';$('receipt-subtitle').textContent='사진은 서버에 보관된 파일이며, 촬영 기기의 진위는 별도로 검증하지 않았습니다.';$('share-link').value=location.origin+location.pathname+'#/v/'+token;$('owner-area').hidden=!owner(token);$('native-share').hidden=!navigator.share;$('copy-status').textContent='';$('receipt-content').hidden=false;$('stored-badge').hidden=false;
 }catch(e){if(run!==receiptRun)return;$('receipt-error').textContent=e.message||'원본을 불러오지 못했습니다.';$('receipt-error').hidden=false;$('retry-receipt').hidden=false;}
 finally{if(run===receiptRun)$('receipt-loading').hidden=true;}
}
$('retry-receipt').addEventListener('click',()=>viewReceipt(currentToken));
$('copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('share-link').value);$('copy-status').textContent='확인 링크를 복사했습니다.';}catch{$('share-link').focus();$('share-link').select();$('copy-status').textContent='자동 복사가 제한됐습니다. 선택된 링크를 직접 복사해 주세요.';}});
$('native-share').addEventListener('click',async()=>{try{await navigator.share({title:'바로체크 · 보관 원본 확인',url:$('share-link').value});$('copy-status').textContent='공유 창을 열었습니다.';}catch(e){if(e.name!=='AbortError')$('copy-status').textContent='공유하지 못했습니다. 링크 복사를 이용해 주세요.';}});
$('revoke').addEventListener('click',async()=>{const auth=owner(currentToken);if(!auth||busy)return;if(!confirm('이 링크의 사진 열람을 중단할까요? 다시 활성화할 수 없습니다. 서버 원본은 삭제되지 않으며, 이미 내려받은 사진은 회수할 수 없습니다.'))return;busy=true;$('revoke').disabled=true;try{await request('revoke',{method:'POST',tokenType:'owner',token:auth.ownerToken,id:auth.id});await viewReceipt(currentToken);}catch(e){$('copy-status').textContent=e.message;}finally{busy=false;$('revoke').disabled=false;}});
function home(){if(busy)return;++cameraRun;++receiptRun;stopCamera();photo=null;session=null;if(location.hash)location.hash='';else show('home');}
$('brand').addEventListener('click',home);$('capture-back').addEventListener('click',home);$('receipt-back').addEventListener('click',home);
function route(){const hash=location.hash;if(hash.startsWith('#/v/'))viewReceipt(hash.slice(4));else{++cameraRun;++receiptRun;stopCamera();show('home');}}
window.addEventListener('hashchange',route);window.addEventListener('pagehide',()=>{++cameraRun;stopCamera();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream){++cameraRun;stopCamera();$('camera-status').textContent='다른 화면으로 이동해 카메라를 껐습니다.';$('retry-camera').hidden=false;}});route();
