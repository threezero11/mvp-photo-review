const fs=require('node:fs');const path=require('node:path');
const {createHash}=require('node:crypto');
const model='assets/model/frontier-202608-d75791ba.onnx';
if(createHash('sha256').update(fs.readFileSync(model)).digest('hex')!=='d75791ba2fa59146025d342cfaafa9ddeab24af117642a94f752ee4c1619375d')throw new Error('Model hash mismatch');
fs.mkdirSync('assets/ort',{recursive:true});
for(const file of ['ort.wasm.min.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])fs.copyFileSync(path.join('node_modules/onnxruntime-web/dist',file),path.join('assets/ort',file));

fs.mkdirSync('dist',{recursive:true});for(const file of ['index.html','detector-worker.js'])fs.copyFileSync(file,'dist/'+file);
fs.cpSync('assets','dist/assets',{recursive:true});
