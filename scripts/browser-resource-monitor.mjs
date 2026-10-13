// Observe HTTP errors as well as transport/JS errors. Expected probes are exact,
// one-use registrations, made immediately before the intentional request.
export function monitorBrowser(page,result){
 result.httpErrors??=[];
 const expected=[],responses=[],resourceMessages=[];
 page.on('pageerror',error=>result.runtimeErrors.push(error.message));
 page.on('response',response=>{
  const entry={url:response.url(),method:response.request().method(),status:response.status()};
  if(entry.status<400)return;
  responses.push(entry);
  const index=expected.findIndex(probe=>probe.url===entry.url&&probe.method===entry.method&&probe.status===entry.status);
  if(index>=0)expected.splice(index,1);else result.httpErrors.push(entry);
 });
 page.on('console',message=>{
  if(message.type()!=='error')return;
  const text=message.text(),status=text.match(/^Failed to load resource: the server responded with a status of (\d{3})\b/);
  if(status)resourceMessages.push({url:message.location().url,status:Number(status[1]),text});
  else result.consoleErrors.push(text);
 });
 page.on('requestfailed',request=>{
  const error=request.failure()?.errorText;
  if(!error?.includes('ERR_ABORTED'))result.failedRequests.push({url:request.url(),error});
 });
 return {
  expectHttpError(probe){expected.push({...probe});},
  finish(){
   // Standard resource console messages duplicate response events. Suppress only
   // matched duplicates; an unobserved response remains a console failure.
   for(const message of resourceMessages.splice(0)){
    const index=responses.findIndex(response=>response.url===message.url&&response.status===message.status);
    if(index>=0)responses.splice(index,1);else result.consoleErrors.push(message.text+' '+message.url);
   }
   for(const probe of expected.splice(0))result.consoleErrors.push('Expected HTTP probe was not observed: '+probe.method+' '+probe.url+' '+probe.status);
  }
 };
}
