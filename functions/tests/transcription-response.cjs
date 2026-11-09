const assert=require('assert/strict');
const axios=require('axios');
const {uploadFile}=require(process.env.ASR_HANDLER || '../lib/index.js');
const boundary='synthetic-test-boundary';
const body=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.wav"\r\nContent-Type: audio/wav\r\n\r\nsynthetic\r\n--${boundary}--\r\n`);
async function responseFor(data){
 axios.post=async()=>({status:200,data});
 return new Promise((resolve,reject)=>{
  const req={method:'POST',headers:{'content-type':'multipart/form-data; boundary='+boundary},rawBody:body};
  const res={statusCode:200,setHeader(){},getHeader(){},status(n){this.statusCode=n;return this;},json(data){resolve({status:this.statusCode,data});return this;}};
  Promise.resolve(uploadFile(req,res)).catch(reject);
 });
}
(async()=>{
 const success=await responseFor({text:'合成測試'});
 const empty=await responseFor({text:''});
 const missing=await responseFor({});
 assert.equal(success.status,200);assert.equal(success.data.transcript,'合成測試');
 assert.equal(empty.status,422);assert.equal(empty.data.code,'NO_SPEECH');
 assert.equal(missing.status,422);assert.equal(missing.data.code,'NO_SPEECH');
 console.log(JSON.stringify({success,empty,missing},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
