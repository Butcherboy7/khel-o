import {spawn} from 'node:child_process';
import fs from 'node:fs';
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9333','--disable-gpu','--user-data-dir='+process.env.TEMP+'/capprof','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,3000));
const tabs=await (await fetch('http://127.0.0.1:9333/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0;const pend={};
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend[m.id])pend[m.id](m.result)};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:430,height:760,deviceScaleFactor:2,mobile:true});
async function shot(url,name,js){
  await send('Page.navigate',{url});await sleep(6000);
  if(js){await send('Runtime.evaluate',{expression:js});await sleep(1500);}
  const r=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(name,Buffer.from(r.data,'base64'));
}
const hide="document.querySelectorAll('button').forEach(b=>{if(/accept|got it|ok|agree/i.test(b.textContent)&&b.closest('[class*=ookie],[role=dialog],div'))try{b.click()}catch(e){}});0";
await shot('https://khel-o.online/?internal=1','m_home.png',hide);
await shot('https://khel-o.online/browse?internal=1','m_browse.png',hide);
await send('Page.navigate',{url:'https://khel-o.online/?internal=1'});await sleep(6000);
await send('Runtime.evaluate',{expression:hide});
const r=await send('Runtime.evaluate',{expression:"const a=[...document.querySelectorAll('a')].find(a=>/\/cafe\//.test(a.href));a?a.href:''",returnByValue:true});
console.log('cafe link',r.result.value);
if(r.result.value) await shot(r.result.value,'m_cafe.png',hide);
chrome.kill();process.exit(0);
