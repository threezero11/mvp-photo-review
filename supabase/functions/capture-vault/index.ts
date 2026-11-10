import {MAX_BYTES,PURPOSES,validToken,validId,hash,jpegDimensions,receipt} from './protocol.mjs';
const base=Deno.env.get('SUPABASE_URL');const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const origins=new Set(['https://mvp-photo-review.vercel.app','http://127.0.0.1:5173','http://localhost:5173']);
const randomToken=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function headers(req){const origin=req.headers.get('Origin');return{'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://mvp-photo-review.vercel.app','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type,x-upload-token,x-record-id,x-view-token,x-owner-token,x-captured-at','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};}
async function db(path,method='GET',data,extra={}){const r=await fetch(base+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...extra},body:data===undefined?undefined:JSON.stringify(data)});if(!r.ok){const failure=await r.json().catch(()=>({}));throw new Error(failure.message||'DATABASE_ERROR');}return r.status===204?[]:r.json();}
async function object(path,method='GET',bytes){return fetch(base+'/storage/v1/object/'+(method==='GET'?'authenticated/':'')+'capture-originals/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,...(bytes?{'Content-Type':'image/jpeg','x-upsert':'false'}:{})},body:bytes});}
async function authenticated(req){const authorization=req.headers.get('authorization');if(!authorization?.startsWith('Bearer '))throw new Error('AUTH_REQUIRED');const response=await fetch(base+'/auth/v1/user',{headers:{apikey:key,Authorization:authorization}});if(!response.ok)throw new Error('AUTH_REQUIRED');const user=await response.json();if(!user.id)throw new Error('AUTH_REQUIRED');return user.id;}
async function tokenCipher(){const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key+':view-link-encryption'));return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);}
async function encryptToken(token){const iv=crypto.getRandomValues(new Uint8Array(12)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await tokenCipher(),new TextEncoder().encode(token)));return btoa(String.fromCharCode(...iv,...data));}
async function decryptToken(value){if(!value)return null;const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await tokenCipher(),bytes.slice(12)));}
async function removeObject(path){const response=await fetch(base+'/storage/v1/object/capture-originals',{method:'DELETE',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})});if(!response.ok&&response.status!==404)throw new Error('DELETE_STORAGE_ERROR');}
async function smallJson(req){const text=await req.text();if(text.length>10000)throw new Error('BAD_REQUEST');try{return JSON.parse(text);}catch{throw new Error('BAD_REQUEST');}}
Deno.serve(async req=>{
 const cors=headers(req);const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
 const origin=req.headers.get('Origin');if(origin&&!origins.has(origin))return json({error:'허용하지 않은 요청입니다.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const action=new URL(req.url).searchParams.get('action');
 try{
  if(req.method==='GET'&&action==='health')return json({service:'capture-vault',version:1});
  if(req.method==='POST'&&action==='start'){
   const userId=await authenticated(req);
   if(Number(req.headers.get('content-length'))>1024)return json({error:'요청이 너무 큽니다.'},413);
   const reader=req.body?.getReader();let text='',length=0;if(!reader)return json({error:'촬영 용도를 선택해 주세요.'},400);const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1024){await reader.cancel();return json({error:'요청이 너무 큽니다.'},413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();let data;try{data=JSON.parse(text);}catch{return json({error:'요청 형식이 올바르지 않습니다.'},400);}if(!data||!PURPOSES.has(data.purpose))return json({error:'촬영 용도를 선택해 주세요.'},400);
   const viewToken=randomToken(),uploadToken=randomToken(),ownerToken=randomToken();
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||req.headers.get('cf-connecting-ip')||'unavailable';
   const rows=await db('rpc/reserve_capture','POST',{p_view_hash:await hash(viewToken),p_upload_hash:await hash(uploadToken),p_owner_hash:await hash(ownerToken),p_ip_hash:await hash(key+':'+ip),p_purpose:data.purpose});
   await db('capture_receipts?id=eq.'+rows[0].id,'PATCH',{owner_user_id:userId,view_token_ciphertext:await encryptToken(viewToken)});
   return json({id:rows[0].id,expiresAt:rows[0].expires_at,viewToken,uploadToken},201);
  }
  if(req.method==='POST'&&action==='seal'){
   const userId=await authenticated(req);
   const id=req.headers.get('x-record-id'),token=req.headers.get('x-upload-token');
   if(!validId(id)||!validToken(token))return json({error:'촬영 세션이 올바르지 않습니다.'},401);
   if(!req.headers.get('content-type')?.startsWith('image/jpeg'))return json({error:'촬영한 JPEG 사진만 저장할 수 있습니다.'},415);
   if(Number(req.headers.get('content-length'))>MAX_BYTES)return json({error:'사진은 5MB 이하여야 합니다.'},413);
   const reader=req.body?.getReader();if(!reader)return json({error:'사진이 없습니다.'},400);
   const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return json({error:'사진은 5MB 이하여야 합니다.'},413);}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   const {width,height}=jpegDimensions(bytes),digest=await hash(bytes),uploadHash=await hash(token);
   const rows=await db('capture_receipts?id=eq.'+id+'&upload_hash=eq.'+uploadHash+'&owner_user_id=eq.'+userId+'&limit=1');const row=rows[0];
   if(!row)return json({error:'촬영 세션을 찾을 수 없습니다.'},404);
   if(row.status==='ready'){if(row.sha256===digest)return json(receipt(row));return json({error:'이미 보관한 사진은 교체할 수 없습니다.'},409);}
   if(row.status!=='pending'||new Date(row.expires_at)<new Date())return json({error:'촬영 세션이 만료됐거나 저장 중입니다. 다시 촬영해 주세요.'},409);
   const claimed=await db('capture_receipts?id=eq.'+id+'&upload_hash=eq.'+uploadHash+'&status=eq.pending','PATCH',{status:'storing'},{Prefer:'return=representation'});if(claimed.length!==1)return json({error:'이미 저장을 처리하고 있습니다.'},409);
   const path=id+'/'+digest+'.jpg';let uploaded=false;
   try{
    const stored=await object(path,'POST',bytes);if(!stored.ok)throw new Error('STORAGE_ERROR');uploaded=true;
    const captured=req.headers.get('x-captured-at');const time=captured&&Number.isFinite(Date.parse(captured))?new Date(captured).toISOString():null;
    const sealed=await db('capture_receipts?id=eq.'+id+'&status=eq.storing','PATCH',{status:'ready',object_path:path,sha256:digest,byte_size:size,width,height,received_at:new Date().toISOString(),client_captured_at:time},{Prefer:'return=representation'});
    if(sealed.length!==1)throw new Error('SEAL_ERROR');return json(receipt(sealed[0]),201);
   }catch(e){if(uploaded)await object(path,'DELETE');await db('capture_receipts?id=eq.'+id+'&status=eq.storing','PATCH',{status:'pending'});throw e;}
  }
  if(req.method==='GET'&&action==='download'){
   const userId=await authenticated(req),id=req.headers.get('x-record-id');if(!validId(id))return json({error:'사진 기록을 찾을 수 없습니다.'},404);
   const rows=await db('capture_receipts?id=eq.'+id+'&owner_user_id=eq.'+userId+'&status=eq.ready&limit=1');if(!rows[0])return json({error:'내 사진이 아니거나 이미 삭제된 기록입니다.'},404);
   const photo=await object(rows[0].object_path);if(!photo.ok)return json({error:'보관 원본을 불러오지 못했습니다.'},503);
   return new Response(photo.body,{headers:{...cors,'Content-Type':'image/jpeg','Content-Disposition':'attachment; filename="SourceKeep_'+id+'.jpg"'}});
  }
  if(req.method==='GET'&&(action==='view'||action==='image')){
   const token=req.headers.get('x-view-token');if(!validToken(token))return json({error:'확인 링크가 올바르지 않습니다.'},404);
   const ownerAccess=req.headers.has('authorization')?'&owner_user_id=eq.'+await authenticated(req):'&revoked_at=is.null';
   const rows=await db('capture_receipts?view_hash=eq.'+await hash(token)+'&status=eq.ready'+ownerAccess+'&limit=1');if(!rows[0])return json({error:'사진을 찾을 수 없거나 공유가 중단된 링크입니다.'},404);
   const row=rows[0];if(action==='view')return json(receipt(row));
   const photo=await object(row.object_path);if(!photo.ok)return json({error:'보관 원본을 불러오지 못했습니다.'},503);
   return new Response(photo.body,{headers:{...cors,'Content-Type':'image/jpeg','Content-Disposition':'inline; filename="barocheck-original.jpg"'}});
  }
  if(req.method==='GET'&&action==='list'){
   const userId=await authenticated(req);const rows=await db('capture_receipts?owner_user_id=eq.'+userId+'&status=eq.ready&order=received_at.desc&limit=200');
   return json({photos:await Promise.all(rows.map(async row=>({...receipt(row),viewToken:await decryptToken(row.view_token_ciphertext)})))});
  }
  if(req.method==='POST'&&['notes','revoke','share','delete'].includes(action)){
   const userId=await authenticated(req),id=req.headers.get('x-record-id');if(!validId(id))return json({error:'사진 기록을 찾을 수 없습니다.'},404);
   const path='capture_receipts?id=eq.'+id+'&owner_user_id=eq.'+userId+'&status=eq.ready';const rows=await db(path+'&limit=1');const row=rows[0];if(!row)return json({error:'내 사진이 아니거나 이미 삭제된 기록입니다.'},404);
   if(action==='delete'){await removeObject(row.object_path);await db(path,'DELETE');return json({deleted:true});}
   if(action==='notes'){const input=await smallJson(req);const title=typeof input.title==='string'?input.title.trim():'';const description=typeof input.description==='string'?input.description.trim():'';if(!title||title.length>100||description.length>2000)return json({error:'제목은 1~100자, 설명은 2,000자 이내로 입력해 주세요.'},400);const updated=await db(path,'PATCH',{title,description,notes_updated_at:new Date().toISOString()},{Prefer:'return=representation'});return json(receipt(updated[0]));}
   await db(path,'PATCH',{revoked_at:action==='revoke'?new Date().toISOString():null});return json({revoked:action==='revoke',viewToken:await decryptToken(row.view_token_ciphertext)});
  }
  return json({error:'지원하지 않는 요청입니다.'},404);
 }catch(e){const m=String(e.message);if(m==='AUTH_REQUIRED')return json({error:'로그인이 필요합니다. 다시 로그인해 주세요.'},401);if(m==='BAD_REQUEST')return json({error:'입력 내용을 확인해 주세요.'},400);if(/RATE_LIMIT|DAILY_LIMIT|VAULT_CAPACITY/.test(m))return json({error:'체험 저장 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'},429);if(/INVALID_JPEG|INVALID_DIMENSIONS/.test(m))return json({error:'사진 파일을 읽지 못했습니다. 다시 촬영해 주세요.'},400);console.error('capture-vault failure',m.replaceAll(key||'__none__','[redacted]').slice(0,180));return json({error:'서버에서 처리하지 못했습니다. 다시 시도해 주세요.'},503);}
});
