const fs=require('node:fs');
fs.rmSync('dist',{recursive:true,force:true});
fs.mkdirSync('dist',{recursive:true});
// The camera MVP no longer ships the detector model or its runtime.
for(const file of ['index.html','camera.js','auth.js','auth-config.js'])fs.copyFileSync(file,'dist/'+file);
