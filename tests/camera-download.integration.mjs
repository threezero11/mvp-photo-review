// Run after the account integration fixture has been generated. Credentials remain in ignored tmp/ only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from '../supabase/functions/capture-vault/protocol.mjs';
const config=JSON.parse(fs.readFileSync('auth-config.js','utf8').replace('window.CAPTURE_AUTH=','').replace(/;\s*$/,''));
const fixture=JSON.parse(fs.readFileSync('tmp/camera-tests/auth-ui-fixture.json','utf8'));
const api=config.url+'/functions/v1/capture-vault';
async function login(user){const response=await fetch(config.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:user.password})});assert.equal(response.status,200,'synthetic account login');return(await response.json()).access_token;}
async function download(access,id=fixture.a1.id){return fetch(api+'?action=download',{headers:{Origin:'https://mvp-photo-review.vercel.app','x-record-id':id,...(access?{Authorization:'Bearer '+access}:{})}});}
const a=await login(fixture.a),b=await login(fixture.b);
const owned=await download(a);assert.equal(owned.status,200);assert.equal(owned.headers.get('content-type'),'image/jpeg');assert.match(owned.headers.get('content-disposition'),/^attachment; filename="SourceKeep_[\w-]+\.jpg"$/);assert.equal(owned.headers.get('cache-control'),'no-store');assert.equal(await hash(await owned.arrayBuffer()),fixture.a1.record.sha256);
console.log('PASS: owner downloads exact original bytes with attachment/no-store headers');
assert.equal((await download(null)).status,401);assert.equal((await download(b)).status,404);assert.equal((await download(a,crypto.randomUUID())).status,404);assert.equal((await download(a,'../invalid')).status,404);
const tokenOnly=await fetch(api+'?action=download',{headers:{'x-record-id':fixture.a1.id,'x-view-token':fixture.a1.viewToken}});assert.equal(tokenOnly.status,401);
console.log('PASS: anonymous, link-only, other-owner and unknown-record download requests denied');
