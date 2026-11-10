import {MAX_BYTES,PURPOSES,validToken,validId,hash,jpegDimensions,receipt} from './protocol.mjs';
const base=Deno.env.get('SUPABASE_URL');const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const origins=new Set(['https://mvp-photo-review.vercel.app','http://127.0.0.1:5173','http://localhost:5173']);
const randomToken=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function headers(req){const origin=req.headers.get('Origin');return{'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://mvp-photo-review.vercel.app','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'content-type,x-upload-token,x-record-id,x-view-token,x-owner-token,x-captured-at','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};}
async function db(path,method='GET',data,extra={}){const r=await fetch(base+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...extra},body:data===undefined?undefined:JSON.stringify(data)});if(!r.ok){const failure=await r.json().catch(()=>({}));throw new Error(failure.message||'DATABASE_ERROR');}return r.status===204?[]:r.json();}
async function object(path,method='GET',bytes){return fetch(base+'/storage/v1/object/'+(method==='GET'?'authenticated/':'')+'capture-originals/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,...(bytes?{'Content-Type':'image/jpeg','x-upsert':'false'}:{})},body:bytes});}
Deno.serve(async req=>{
 const cors=headers(req);const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
 const origin=req.headers.get('Origin');if(origin&&!origins.has(origin))return json({error:'허용하지 않은 요청입니다.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const action=new URL(req.url).searchParams.get('action');
 try{
  if(req.method==='GET'&&action==='health')return json({service:'capture-vault',version:1});
  if(req.method==='POST'&&action==='start'){
   if(Number(req.headers.get('content-length'))>1024)return json({error:'요청이 너무 큽니다.'},413);
   const reader=req.body?.getReader();let text='',length=0;if(!reader)return json({error:'촬영 용도를 선택해 주세요.'},400);const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1024){await reader.cancel();return json({error:'요청이 너무 큽니다.'},413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();let data;try{data=JSON.parse(text);}catch{return json({error:'요청 형식이 올바르지 않습니다.'},400);}if(!data||!PURPOSES.has(data.purpose))return json({error:'촬영 용도를 선택해 주세요.'},400);
   const viewToken=randomToken(),uploadToken=randomToken(),ownerToken=randomToken();
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||req.headers.get('cf-connecting-ip')||'unavailable';
   const rows=await db('rpc/reserve_capture','POST',{p_view_hash:await hash(viewToken),p_upload_hash:await hash(uploadToken),p_owner_hash:await hash(ownerToken),p_ip_hash:await hash(key+':'+ip),p_purpose:data.purpose});
   return json({id:rows[0].id,expiresAt:rows[0].expires_at,viewToken,uploadToken,ownerToken},201);
  }
  if(req.method==='POST'&&action==='seal'){
   const id=req.headers.get('x-record-id'),token=req.headers.get('x-upload-token');
   if(!validId(id)||!validToken(token))return json({error:'촬영 세션이 올바르지 않습니다.'},401);
   if(!req.headers.get('content-type')?.startsWith('image/jpeg'))return json({error:'촬영한 JPEG 사진만 저장할 수 있습니다.'},415);
   if(Number(req.headers.get('content-length'))>MAX_BYTES)return json({error:'사진은 5MB 이하여야 합니다.'},413);
   const reader=req.body?.getReader();if(!reader)return json({error:'사진이 없습니다.'},400);
   const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return json({error:'사진은 5MB 이하여야 합니다.'},413);}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   const {width,height}=jpegDimensions(bytes),digest=await hash(bytes),uploadHash=await hash(token);
   const rows=await db('capture_receipts?id=eq.'+id+'&upload_hash=eq.'+uploadHash+'&limit=1');const row=rows[0];
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
  if(req.method==='GET'&&(action==='view'||action==='image')){
   const token=req.headers.get('x-view-token');if(!validToken(token))return json({error:'확인 링크가 올바르지 않습니다.'},404);
   const rows=await db('capture_receipts?view_hash=eq.'+await hash(token)+'&status=eq.ready&revoked_at=is.null&limit=1');if(!rows[0])return json({error:'사진을 찾을 수 없거나 공유가 중단된 링크입니다.'},404);
   const row=rows[0];if(action==='view')return json(receipt(row));
   const photo=await object(row.object_path);if(!photo.ok)return json({error:'보관 원본을 불러오지 못했습니다.'},503);
   return new Response(photo.body,{headers:{...cors,'Content-Type':'image/jpeg','Content-Disposition':'inline; filename="barocheck-original.jpg"'}});
  }
  if(req.method==='POST'&&action==='revoke'){
   const id=req.headers.get('x-record-id'),token=req.headers.get('x-owner-token');if(!validId(id)||!validToken(token))return json({error:'공유 관리 권한이 없습니다.'},401);
   const rows=await db('capture_receipts?id=eq.'+id+'&owner_hash=eq.'+await hash(token)+'&status=eq.ready&revoked_at=is.null','PATCH',{revoked_at:new Date().toISOString()},{Prefer:'return=representation'});if(rows.length!==1)return json({error:'공유가 이미 중단됐거나 관리 권한이 없습니다.'},404);
   return json({revoked:true});
  }
  return json({error:'지원하지 않는 요청입니다.'},404);
 }catch(e){const m=String(e.message);if(/RATE_LIMIT|DAILY_LIMIT|VAULT_CAPACITY/.test(m))return json({error:'체험 저장 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'},429);if(/INVALID_JPEG|INVALID_DIMENSIONS/.test(m))return json({error:'사진 파일을 읽지 못했습니다. 다시 촬영해 주세요.'},400);console.error('capture-vault failure',m.replaceAll(key||'__none__','[redacted]').slice(0,180));return json({error:'서버에서 처리하지 못했습니다. 다시 시도해 주세요.'},503);}
});
