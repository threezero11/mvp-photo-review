const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function camera(){
 let now=0,sequence=0,captures=0,stops=0;const intervals=new Map(),elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,disabled:false,value:id==='capture-timer'?'3':'',textContent:'',style:{},videoWidth:640,videoHeight:480,addEventListener(type,fn){this[type]=fn;},setAttribute(){},focus(){}});return elements.get(id);};
 const document={hidden:false,getElementById:element,addEventListener(){},createElement(type){assert.equal(type,'canvas');return{getContext(){return{drawImage(){captures++;},translate(){},scale(){}};},toBlob(done){done(new Blob(['synthetic test only'],{type:'image/jpeg'}));}};}};
 const context=vm.createContext({document,window:{addEventListener(){}},navigator:{},authClient:{ready:{then(){}},user:null},URL:{createObjectURL(){return'blob:test';},revokeObjectURL(){}},Blob,performance:{now:()=>now},setInterval(fn){const id=++sequence;intervals.set(id,fn);return id;},clearInterval(id){intervals.delete(id);},Date,console});
 vm.runInContext(fs.readFileSync('camera.js','utf8')+`\nstream={getTracks:()=>[{stop(){testStop();}}]};session={id:'test'};photo=null;`,context);
 context.testStop=()=>{stops++;};
 return {element,document,click:id=>element(id).click(),advance(ms){now+=ms;for(const fn of [...intervals.values()])fn();},stop(){vm.runInContext('stopCamera()',context);},get captures(){return captures;},get stops(){return stops;},get pending(){return intervals.size;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('3-second timer waits, then captures exactly once',async()=>{const app=camera();app.click('shutter');assert.equal(app.element('capture-countdown').textContent,'3');app.advance(2000);assert.equal(app.captures,0);assert.equal(app.element('capture-countdown').textContent,'1');app.advance(1000);await settle();assert.equal(app.captures,1);assert.equal(app.pending,0);assert.equal(app.element('shot').hidden,false);app.advance(10000);assert.equal(app.captures,1);});
test('10-second countdown can be cancelled and restarted',async()=>{const app=camera();app.element('capture-timer').value='10';app.click('shutter');app.advance(5000);assert.equal(app.captures,0);app.click('cancel-timer');assert.equal(app.pending,0);assert.equal(app.element('shutter').disabled,false);app.advance(10000);assert.equal(app.captures,0);app.click('shutter');app.advance(10000);await settle();assert.equal(app.captures,1);});
test('leaving the camera or hiding the page prevents delayed capture',()=>{for(const hide of [false,true]){const app=camera();app.click('shutter');if(hide)app.document.hidden=true;else app.stop();app.advance(15000);assert.equal(app.captures,0);assert.equal(app.pending,0);assert.equal(app.element('capture-countdown').hidden,true);}});
test('timer off captures immediately',async()=>{const app=camera();app.element('capture-timer').value='0';app.click('shutter');await settle();assert.equal(app.captures,1);assert.equal(app.pending,0);});
