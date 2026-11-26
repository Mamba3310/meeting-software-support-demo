'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const temp=path.join(__dirname,'data','resend-check.json');
const sent=[];
const resendMock=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{sent.push(JSON.parse(body));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:`mock-${sent.length}`}));});});
const listen=(server,port)=>new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
const close=server=>new Promise(resolve=>server.close(resolve));
async function call(port,path,options={}){const response=await fetch(`http://127.0.0.1:${port}${path}`,options);return{status:response.status,data:await response.json()};}
(async()=>{
  await listen(resendMock,8772);
  const env={...process.env,NODE_ENV:'test',PORT:'8771',SUPPORT_ADMIN_KEY:'resend-test-key',DATA_FILE:temp,RESEND_API_KEY:'test-key',RESEND_API_URL:'http://127.0.0.1:8772/emails',EMAIL_FROM:'Northstar Support <support@example.test>',EMAIL_BRAND:'Northstar Support',ALLOWED_ORIGINS:'http://127.0.0.1:8771,https://example.test'};
  const app=spawn(process.execPath,['server.js'],{cwd:__dirname,env,stdio:'ignore'});
  try{
    let health;
    for(let attempt=0;attempt<50;attempt++){try{health=await call(8771,'/api/health');if(health.status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
    assert.equal(health.status,200);
    const body={emails:['one@example.test','two@example.test'],subject:'<Welcome>',message:'Hello <visitor>\nYour session awaits.',publicBaseUrl:'https://example.test/support/',apiBaseUrl:'https://api.example.test'};
    const created=await call(8771,'/api/links',{method:'POST',headers:{'content-type':'application/json','x-admin-key':'resend-test-key'},body:JSON.stringify(body)});
    assert.equal(created.status,201);assert.equal(created.data.links.length,2);assert.ok(created.data.links.every(link=>link.emailSent));
    assert.equal(sent.length,2);assert.ok(sent.every(mail=>mail.from===env.EMAIL_FROM));
    const visitorLinks=sent.map(mail=>mail.html.match(/href="(https:\/\/example\.test\/support\/\?visitor=[^"]+)/)?.[1]);
    assert.ok(visitorLinks[0]&&visitorLinks[1]&&visitorLinks[0]!==visitorLinks[1]);
    assert.ok(sent.every(mail=>mail.html.includes('&lt;Welcome&gt;')&&mail.html.includes('&lt;visitor&gt;')&&mail.html.includes('Hello &lt;visitor&gt;<br>Your session awaits.')));
    assert.ok(sent.every(mail=>mail.text.includes('https://example.test/support/?visitor=')));
    const badOrigin=await call(8771,'/api/links',{method:'POST',headers:{'content-type':'application/json','x-admin-key':'resend-test-key'},body:JSON.stringify({...body,publicBaseUrl:'https://attacker.invalid/'})});
    assert.equal(badOrigin.status,400);
    const missingConfig=await call(8771,'/api/links',{method:'POST',headers:{'content-type':'application/json','x-admin-key':'resend-test-key'},body:JSON.stringify({...body,sendEmail:false})});
    assert.equal(missingConfig.status,201);assert.ok(missingConfig.data.links.every(link=>link.emailSent===false));
    console.log('PASS mocked Resend branded sends to bulk recipients');
    console.log('PASS unique links, HTML escaping, and text alternatives');
    console.log('PASS allowlisted public URL and unsent-link behavior');
  }finally{app.kill();await close(resendMock);try{fs.unlinkSync(temp)}catch{}try{fs.rmdirSync(path.dirname(temp))}catch{}}
})().catch(error=>{console.error(error);process.exitCode=1;});
