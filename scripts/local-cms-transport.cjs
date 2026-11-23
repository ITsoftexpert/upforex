// Test transport only: real HTTP to the isolated supplied backend, never a fake response.
// This script is never imported by browser or production server source.
const assert=require('node:assert/strict');
function localCmsOrigin(value=process.env.I18N_VERIFY_CMS_BASE_URL){
 if(!value)return undefined;
 const url=new URL(value);
 assert(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.port&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash,'Local integration requires an explicit loopback backend origin');
 return url.origin;
}
function installLocalCmsTransport(value){
 const origin=localCmsOrigin(value);if(!origin)return()=>{};
 const native=globalThis.fetch,NativeRequest=globalThis.Request;
 globalThis.fetch=(input,options)=>{
  const request=input instanceof NativeRequest?input:undefined;
  const url=new URL(request?request.url:String(input));
  if(url.origin==='https://api.upforex.com'&&/^\/api\/v1\/blogs\/web(?:\/|$)/.test(url.pathname)){
   assert.equal(options?.method||request?.method||'GET','GET','Integration adapter only permits public reads');
   const target=origin+url.pathname+url.search;
   return native.call(globalThis,request?new NativeRequest(target,request):target,options);
  }
  return native.call(globalThis,input,options);
 };
 return()=>{globalThis.fetch=native};
}
module.exports={localCmsOrigin,installLocalCmsTransport};
