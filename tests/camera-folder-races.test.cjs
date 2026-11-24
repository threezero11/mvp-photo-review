const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function camera(){
 const elements=new Map(),requests=[],observers=[],urls=[];
 function target(value={}){
  const listeners=new Map();
  return Object.assign(value,{addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},fire(type){const event={currentTarget:this,preventDefault(){this.defaultPrevented=true;}};return Promise.all((listeners.get(type)||[]).map(fn=>fn(event)));}});
 }
 function connect(node,value){node.isConnected=value;for(const child of node.children)connect(child,value);}
 function node(tag='div'){
  return target({tag,children:[],hidden:true,disabled:false,open:false,value:'',textContent:'',style:{},dataset:{},checked:false,isConnected:false,
   append(...children){for(const child of children){this.children.push(child);connect(child,this.isConnected);}},
   replaceChildren(...children){for(const child of this.children)connect(child,false);this.children=[];this.append(...children);},
   querySelectorAll(selector){const found=[];for(const child of this.children){if(child.tag===selector||(selector==='input:checked'&&child.tag==='input'&&child.checked)||(selector==='[data-folder-views]'&&child.dataset.folderViews))found.push(child);found.push(...child.querySelectorAll(selector));}return found;},
   setAttribute(name,value){this[name]=value;},getAttribute(name){return this[name]??null;},removeAttribute(name){delete this[name];},focus(){document.activeElement=this;},select(){},showModal(){this.open=true;},close(){if(!this.open)return;this.open=false;this.fire('close');}
  });
 }
 const element=id=>{if(!elements.has(id)){const value=node();value.id=id;connect(value,true);elements.set(id,value);}return elements.get(id);};
 const document=target({hidden:false,getElementById:element,createElement:node,querySelectorAll(){return[];}});
 const window=target({scrollTo(){}}),location={origin:'https://sourcekeep.test',pathname:'/',hash:''};
 const authClient={user:{id:'account-a',email:'a@example.test'},ready:{then(){}},async accessToken(){return 'synthetic-'+this.user.id;}};
 class IntersectionObserver{
  constructor(callback,options){this.callback=callback;this.options=options;this.targets=new Set();this.disconnected=false;observers.push(this);}
  observe(value){this.targets.add(value);}unobserve(value){this.targets.delete(value);}disconnect(){this.targets.clear();this.disconnected=true;}
  intersect(values){this.callback(values.map(target=>({target,isIntersecting:true})));}
 }
 const context=vm.createContext({document,window,location,history:{replaceState(){}},navigator:{},authClient,IntersectionObserver,URL:{createObjectURL(){const value='blob:synthetic-'+urls.length;urls.push(value);return value;},revokeObjectURL(){}},AbortController,crypto:webcrypto,Date,Blob,setTimeout(){return 1;},clearTimeout(){},fetch(url,options){return new Promise((resolve,reject)=>requests.push({action:new URL(url).searchParams.get('action'),options,resolve,reject}));}});
 vm.runInContext(fs.readFileSync('camera.js','utf8')+'\nactiveAccountId=authClient.user.id;',context);
 function take(action){const index=requests.findIndex(value=>value.action===action);assert.notEqual(index,-1,'expected '+action+' request');return requests.splice(index,1)[0];}
 return {element,requests,observers,urls,location,click:id=>element(id).fire('click'),submit:()=>element('folder-form').fire('submit'),
  async changeAccount(id){authClient.user={id,email:id+'@example.test'};await window.fire('capture-auth-changed');},
  async route(token){location.hash='#/f/'+token;await window.fire('hashchange');},
  edit(folder){context.folderFixture=folder;vm.runInContext('currentFolder=folderFixture;',context);return element('edit-folder').fire('click');},
  take,respond(request,data){request.resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));}
 };
}
async function readyEditor(app){const opening=app.click('create-folder');await settle();app.respond(app.take('list'),{photos:[{id:'photo-b',title:'새 사진'}]});await opening;app.element('folder-name').value='시험 폴더';app.element('folder-consent').checked=true;}

test('cancel and reopen ignores the previous folder selection response',async()=>{
 const app=camera(),first=app.edit({id:'old-folder',title:'이전 폴더',owned:true,photoIds:['old-photo']});await settle();const old=app.take('list');await app.click('cancel-folder-edit');
 const second=app.click('create-folder');await settle();const latest=app.take('list');app.respond(old,{photos:[{id:'old-photo',title:'이전 사진'}]});await first;
 assert.equal(app.element('folder-photo-picker').children.length,0);assert.equal(app.element('save-folder').disabled,true);
 app.respond(latest,{photos:[{id:'new-photo',title:'새 사진'}]});await second;
 const choices=app.element('folder-photo-picker').querySelectorAll('input');assert.equal(choices.length,1);assert.equal(choices[0].value,'new-photo');assert.equal(choices[0].checked,false);assert.equal(app.element('save-folder').disabled,false);
});

test('a late load failure cannot overwrite a reopened editor',async()=>{
 const app=camera(),first=app.click('create-folder');await settle();const old=app.take('list');await app.click('cancel-folder-edit');await readyEditor(app);
 old.reject(new Error('stale failure'));await first;
 assert.equal(app.element('folder-save-error').hidden,true);assert.equal(app.element('save-folder').disabled,false);assert.equal(app.element('folder-photo-picker').querySelectorAll('input').length,1);
});

for(const editing of [false,true])test('the current editor can still '+(editing?'update':'create')+' a folder',async()=>{
 const app=camera(),token='F'.repeat(43),opening=editing?app.edit({id:'folder-a',title:'수정 전',owned:true,photoIds:['photo-b'],viewToken:token}):app.click('create-folder');
 await settle();app.respond(app.take('list'),{photos:[{id:'photo-b',title:'사진',receivedAt:'2026-11-24T01:02:00.000Z'}]});await opening;await settle();app.element('folder-name').value='저장할 이름';app.element('folder-photo-picker').querySelectorAll('input')[0].checked=true;assert.match(app.element('folder-photo-picker').querySelectorAll('span')[0].textContent,/사진 · .*2026.*11.*24.*10:02.*한국 시간/);
 const saving=app.submit();await settle();const request=app.take(editing?'folder-edit':'folder-create');assert.deepEqual(JSON.parse(request.options.body),{title:'저장할 이름',photoIds:['photo-b']});if(editing)assert.equal(request.options.headers['x-folder-id'],'folder-a');
 app.respond(request,editing?{updated:true}:{viewToken:token});await saving;await settle();assert.equal(app.location.hash,'/f/'+token);assert.equal(app.element('folder-editor').open,false);assert.equal(app.element('folder-name').value,'');
 app.respond(app.take('folders'),{folders:[]});await settle();
});

for(const failure of [false,true])test('account change discards a late folder save '+(failure?'failure':'success'),async()=>{
 const app=camera();await readyEditor(app);const saving=app.submit();await settle();const old=app.take('folder-create');
 await app.changeAccount('account-b');assert.equal(app.element('folder-editor').open,false);assert.equal(app.element('folder-name').value,'');assert.equal(app.element('folder-photo-picker').children.length,0);
 await readyEditor(app);app.element('folder-name').value='B의 폴더';
 if(failure)old.reject(new Error('A의 저장 오류'));else app.respond(old,{viewToken:'A'.repeat(43)});await saving;
 assert.equal(app.location.hash,'');assert.equal(app.element('folder-editor').open,true);assert.equal(app.element('folder-name').value,'B의 폴더');assert.equal(app.element('folder-save-error').hidden,true);assert.equal(app.element('save-folder').disabled,false);assert.equal(app.requests.length,0);
});

test('browser navigation invalidates an in-flight folder save',async()=>{
 const app=camera();await readyEditor(app);const saving=app.submit();await settle();const old=app.take('folder-create'),token='B'.repeat(43);
 await app.route(token);await settle();const current=app.take('folder');app.respond(old,{viewToken:'A'.repeat(43)});await saving;
 assert.equal(app.location.hash,'#/f/'+token);assert.equal(app.element('folder-editor').open,false);assert.equal(app.element('folder-name').value,'');assert.equal(app.requests.length,0);
 app.respond(current,{folder:{title:'다음 폴더',owned:true},photos:[]});await settle();
});

test('late share changes cannot reopen a folder after navigation',async()=>{
 const app=camera();await app.route('F'.repeat(43));await settle();app.respond(app.take('folder'),{folder:{id:'folder-a',title:'A의 폴더',owned:true},photos:[]});await settle();
 const toggling=app.click('toggle-folder-share');await settle();const pending=app.take('folder-revoke');await app.click('bottom-account');app.respond(pending,{revoked:true});await toggling;
 assert.equal(app.element('account').hidden,false);assert.equal(app.element('folder').hidden,true);assert.equal(app.requests.length,0);
});

for(const accountChange of [false,true])test('folder images load near the viewport with four requests and stop on '+(accountChange?'account change':'leaving'),async()=>{
 const app=camera(),token='F'.repeat(43),bytes='synthetic image only',sha256=createHash('sha256').update(bytes).digest('hex');
 await app.route(token);await settle();app.respond(app.take('folder'),{folder:{title:'여러 사진',owned:true},photos:Array.from({length:8},(_,index)=>({id:'photo-'+index,title:'사진 '+index,sha256}))});await settle();
 const observer=app.observers.at(-1),images=app.element('folder-photos').querySelectorAll('img');assert.equal(images.length,8);assert.equal(observer.targets.size,8);assert.equal(observer.options.rootMargin,'240px');assert.equal(app.requests.length,0);
 observer.intersect(images.slice(0,6));await settle();assert.equal(app.requests.length,4);
 app.take('folder-image').resolve(new Response(bytes));await settle();await settle();assert.equal(app.requests.length,4);assert.equal(app.urls.length,1);
 if(accountChange)await app.changeAccount('account-b');else await app.click('bottom-account');assert.equal(observer.disconnected,true);assert.equal(app.element('folder-photos').children.length,0);
 for(const pending of app.requests.splice(0))pending.resolve(new Response(bytes));await settle();await settle();assert.equal(app.requests.length,0);assert.equal(app.urls.length,1);
});
