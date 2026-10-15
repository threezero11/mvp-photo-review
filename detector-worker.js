'use strict';
importScripts('/assets/ort/ort.wasm.min.js');
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = '/assets/ort/';
const MODEL_URL='/assets/model/frontier-202608-d75791ba.onnx';
const MODEL_HASH='d75791ba2fa59146025d342cfaafa9ddeab24af117642a94f752ee4c1619375d';
let sessionPromise=null, queue=Promise.resolve();
async function session(id){
 if(!sessionPromise)sessionPromise=(async()=>{
  let cache=null, response=null;
  try{cache=await caches.open('barocheck-model-v1');response=await cache.match(MODEL_URL);}catch{}
  if(!response){
   postMessage({id,type:'progress',text:'판별 모델을 내려받고 있습니다. 처음에는 약 44MB를 다운로드합니다.'});
   response=await fetch(MODEL_URL);if(!response.ok)throw new Error('모델 다운로드 실패');
  }
  const buffer=await response.clone().arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==MODEL_HASH){if(cache)await cache.delete(MODEL_URL);throw new Error('모델 파일 검증 실패');}
  if(cache)try{await cache.put(MODEL_URL,response);}catch{}
  postMessage({id,type:'progress',text:'판별 모델을 준비하고 있습니다.'});
  return ort.InferenceSession.create(buffer,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
 })().catch(e=>{sessionPromise=null;throw e;});
 return sessionPromise;
}
onmessage=event=>{
 const {id,pixels}=event.data;
 queue=queue.catch(()=>{}).then(async()=>{
  try{
   const model=await session(id);
   postMessage({id,type:'progress',text:'사진의 픽셀을 AI 판별 모델로 분석하고 있습니다.'});
   const tensor=new ort.Tensor('float32',new Float32Array(pixels),[1,3,384,384]);
   const output=await model.run({[model.inputNames[0]]:tensor});
   const values=output[model.outputNames[0]].data;
   if(values.length!==1||!Number.isFinite(Number(values[0])))throw new Error('잘못된 모델 출력');
   const logit=Number(values[0]);
   const score=1/(1+Math.exp(-(logit-0.7403357915937764)));
   postMessage({id,type:'result',score,logit});
   tensor.dispose();Object.values(output).forEach(x=>x.dispose());
  }catch(e){postMessage({id,type:'error',text:'AI 분석을 완료하지 못했습니다. 다시 시도해 주세요.',detail:String(e.message||e)});}
 });
};
