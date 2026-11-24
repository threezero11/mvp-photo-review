// Uses only the synthetic B-account fixture; never reads or changes the user's photographs.
import fs from 'node:fs';import assert from 'node:assert/strict';
const fixture=JSON.parse(fs.readFileSync('tmp/camera-tests/auth-ui-fixture.json','utf8'));
const config=JSON.parse(fs.readFileSync('auth-config.js','utf8').replace('window.CAPTURE_AUTH=','').replace(/;\s*$/,''));
const api=config.url+'/functions/v1/capture-vault',photo=fixture.b1;
const login=await fetch(config.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email:fixture.b.email,password:fixture.b.password})});assert.equal(login.status,200);const access=(await login.json()).access_token;
async function call(action,{owner=false,method='GET',token=photo.viewToken}={}){return fetch(api+'?action='+action,{method,headers:{'x-view-token':token,...(owner?{Authorization:'Bearer '+access}:{})}});}
const before=await(await call('view',{owner:true})).json();assert.equal(before.id,photo.id);const count=before.viewCount;
const own=await call('visit',{owner:true,method:'POST'});assert.equal(own.status,200);assert.deepEqual(await own.json(),{viewCount:count,counted:false});
await call('image',{owner:true});const again=await(await call('view',{owner:true})).json();assert.equal(again.viewCount,count);console.log('PASS: owner visit, metadata and image retrieval do not increase views');
const results=await Promise.all(Array.from({length:5},()=>call('visit',{method:'POST'})));for(const r of results)assert.equal(r.status,200);const values=await Promise.all(results.map(r=>r.json()));assert.equal(new Set(values.map(r=>r.viewCount)).size,5);const after=await(await call('view',{owner:true})).json();assert.equal(after.viewCount,count+5);assert.equal(after.sha256,before.sha256);console.log('PASS: concurrent guest openings increase atomically; original hash unchanged');
const bad=await call('visit',{method:'POST',token:'a'.repeat(43)});assert.equal(bad.status,404);const direct=await fetch(config.url+'/rest/v1/rpc/record_capture_visit',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({p_view_hash:'not-a-real-token-hash'})});assert.ok([401,403,404].includes(direct.status));console.log('PASS: invalid link rejected; browser cannot invoke counter RPC directly');
