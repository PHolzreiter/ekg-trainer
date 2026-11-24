/* EKG-Trainer – Steuerpult des Hosts */
(function(){'use strict';
const {generateECG,LEADS,CASES}=LeitWerkECG,C=EKGCommon,$=id=>document.getElementById(id);
const ids=Object.keys(CASES);
const st={case:'normal',variant:'',seed:1042,clean:false,showValues:true,view:'paper',lead:'II',gain:1,filter:'mon'};
let ecg=null,liveG=null,liveKey='',sentKey=null,revealed=false,explain=false,heart=null,peers=[];
const nets=[];const bc=('BroadcastChannel' in window)?new BroadcastChannel('ekg-trainer'):null;
const paper=new EKGView.EcgPaper($('paper'),{onInk:inkChanged,onView:viewChanged,empty:''});
const monitor=new EKGView.EcgMonitor($('mon'));
/* Auswahl */
const sel=$('caseSel'),vsel=$('varSel');const groups={};ids.forEach(id=>(groups[CASES[id].group]=groups[CASES[id].group]||[]).push(id));
for(const g in groups){const og=document.createElement('optgroup');og.label=g;for(const id of groups[g]){const o=new Option(CASES[id].name,id);og.appendChild(o);}sel.appendChild(og);}
for(const id of ['leadSel','xLead'])LEADS.forEach(L=>$(id).appendChild(new Option(L,L,false,L==='II')));
function fillVar(){vsel.innerHTML='';const v=CASES[st.case].variants;vsel.disabled=!v;vsel.appendChild(new Option(v?'Variante: zufällig':'Keine Varianten',''));if(v)for(const k in v)vsel.appendChild(new Option(v[k],k));st.variant='';}
const key=()=>JSON.stringify([st.case,st.variant,st.seed,st.clean,st.showValues,st.view,st.lead,st.filter]);
function spec(){return Object.assign({},st,{variant:ecg.meta.variant||''});}
function gen(){ecg=generateECG(st.case,st.seed,{variant:st.variant||undefined,clean:st.clean,vector:true});
  paper.setRecord(C.makeRecord(ecg,st));if(st.view==='live')ensureLive();renderSol();pill();if(explain&&heart){heart.setECG(ecg);}
  if(revealed&&sentKey!==key()){/* neue Vorschau: Auflösung gilt nur für das Gesendete */}}
function ensureLive(){const k=JSON.stringify([st.case,st.variant,st.seed,st.clean]);if(liveKey!==k){liveG=generateECG(st.case,st.seed,{variant:ecg.meta.variant||undefined,clean:st.clean,dur:64});liveKey=k;}
  monitor.gain=st.gain;monitor.setData(C.liveLoop(liveG,st.lead,st.filter));monitor.setInfo(`x${String(st.gain).replace('.',',')} · Monitorfilter 0,5–40 Hz`);}
function pill(){const p=$('pill'),live=sentKey===key();p.textContent=sentKey==null?'Vorschau – noch nichts gesendet':live?'Gesendet – alle sehen dieses EKG':'Vorschau – Gruppe sieht noch das vorige EKG';p.className='pill '+(live?'live':'prev');}
function renderSol(){const m=ecg.meta;let h=`<p style="margin:0 0 6px"><b>${m.caseName}</b>${m.variantName?' – '+m.variantName:''}</p><p style="margin:0 0 6px">${m.teach.join('<br>')}</p><p class="muted" style="margin:0 0 4px">Gerätebefund: ${m.device.join(' · ')}</p>`;
  if(m.st){const cell=L=>{const v=m.st[L];return `<td class="${v>=1?'pos':v<=-.5?'neg':''}">${v>0?'+':''}${v.toFixed(1)}</td>`;};
    h+=`<div class="muted">ST bei J+60 ms (mm):</div><table><tr>${LEADS.slice(0,6).map(L=>`<th>${L}</th>`).join('')}</tr><tr>${LEADS.slice(0,6).map(cell).join('')}</tr><tr>${LEADS.slice(6).map(L=>`<th>${L}</th>`).join('')}</tr><tr>${LEADS.slice(6).map(cell).join('')}</tr></table>`;}
  h+=`<p class="muted" style="margin:6px 0 0">Seed ${m.seed}${m.lagetyp?' · '+m.lagetyp+' ('+m.axQRS+'°)':''}</p>`;$('sol').innerHTML=h;}
function revealMsg(){const m=ecg.meta;return revealed?{title:m.caseName+(m.variantName?' – '+m.variantName:''),device:m.device,teach:m.teach.map(t=>t.replace(/<[^>]+>/g,''))}:null;}
/* Verteilen */
function toAll(o){for(const n of nets)n.send(o);}
function toBeamer(o){if(bc)bc.postMessage(o);}
function send(){sentKey=key();revealed=false;$('btnReveal').classList.remove('on');paper.clearInk();paper.setReveal(null);
  const rec=C.makeRecord(ecg,st);const msg={t:'ecg',k:'ecg',view:st.view,rec:C.pack(rec),live:null,gain:st.gain};
  if(st.view==='live'){ensureLive();msg.live=C.packLive(monitor.data);}
  toAll(msg);toAll({t:'reveal',k:'reveal',data:null});toAll({t:'ink',k:'ink',ink:[],cals:[]});
  toBeamer({t:'show',spec:spec()});toBeamer({t:'reveal',data:null});toBeamer({t:'explain',on:explain,lead:$('xLead').value});pill();}
function inkChanged(d){if(sentKey!==key())return;toBeamer({t:'ink',ink:d.ink,cals:d.cals});if($('chkInk').checked)toAll({t:'ink',k:'ink',ink:d.ink,cals:d.cals});}
function viewChanged(v){if($('chkZoom').checked&&sentKey===key())toBeamer({t:'view',v});}
if(bc)bc.onmessage=e=>{if(e.data&&e.data.t==='hello'&&sentKey){const s=JSON.parse(sentKey);toBeamer({t:'show',spec:lastSpec});toBeamer({t:'reveal',data:revealMsg()});const d=paper.getInk();toBeamer({t:'ink',ink:d.ink,cals:d.cals});toBeamer({t:'explain',on:explain,lead:$('xLead').value});}};
let lastSpec=null;const _send=send;send=function(){_send();lastSpec=spec();};
/* Bedienung */
sel.onchange=()=>{st.case=sel.value;fillVar();gen();};vsel.onchange=()=>{st.variant=vsel.value;gen();};
$('btnNew').onclick=()=>{st.seed=Math.floor(Math.random()*1e6);gen();};
$('btnRand').onclick=()=>{st.case=ids[Math.floor(Math.random()*ids.length)];sel.value=st.case;fillVar();st.seed=Math.floor(Math.random()*1e6);gen();};
$('chkClean').onchange=e=>{st.clean=e.target.checked;gen();};$('chkVals').onchange=e=>{st.showValues=e.target.checked;gen();};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{st.view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('on',x===b));
  $('paper').classList.toggle('hidden',st.view!=='paper');$('mon').classList.toggle('hidden',st.view!=='live');$('liveRow').classList.toggle('hidden',st.view!=='live');if(st.view==='live'){setExplain(false);ensureLive();}pill();});
$('leadSel').onchange=e=>{st.lead=e.target.value;ensureLive();pill();};$('gainSel').onchange=e=>{st.gain=+e.target.value;monitor.gain=st.gain;monitor.setInfo(`x${String(st.gain).replace('.',',')} · Monitorfilter 0,5–40 Hz`);toBeamer({t:'gain',gain:st.gain});};
$('btnBeep').onclick=e=>{monitor.beepOn=!monitor.beepOn;e.target.textContent=monitor.beepOn?'Ton an':'Ton aus';if(monitor.beepOn)monitor.beep();};
$('btnSend').onclick=()=>send();
$('btnReveal').onclick=()=>{if(sentKey!==key()){send();}revealed=!revealed;$('btnReveal').classList.toggle('on',revealed);const r=revealMsg();paper.setReveal(r?[r.title].concat(r.device):null);toAll({t:'reveal',k:'reveal',data:r});toBeamer({t:'reveal',data:r});};
$('chkInk').onchange=e=>{const d=e.target.checked?paper.getInk():{ink:[],cals:[]};toAll({t:'ink',k:'ink',ink:d.ink,cals:d.cals});};
/* Erregungsleitung */
let xt=0,xPlay=true,xLast=null;
function setExplain(on){explain=on;$('explain').classList.toggle('hidden',!on);$('btnExplain').classList.toggle('on',on);
  if(on){if(st.view!=='paper')document.querySelector('[data-view=paper]').click();if(!heart)heart=new Heart3D($('h3d'));heart.setLead($('xLead').value);heart.setECG(ecg);}else paper.setCursor(null);
  toBeamer({t:'explain',on,lead:$('xLead').value});}
$('btnExplain').onclick=()=>setExplain(!explain);
$('xPlay').onclick=e=>{xPlay=!xPlay;e.target.textContent=xPlay?'Pause':'Weiter';};
const jump=dir=>{const q=ecg.qrs.map(x=>x.t-.3).filter(t=>t>0);let t;if(dir>0)t=q.find(x=>x>xt+.05);else t=q.filter(x=>x<xt-.35).pop();xt=t==null?(dir>0?0:Math.max(0,q[q.length-1]||0)):t;};
$('xPrev').onclick=()=>jump(-1);$('xNext').onclick=()=>jump(1);
$('xLead').onchange=e=>{if(heart)heart.setLead(e.target.value);toBeamer({t:'explain',on:explain,lead:e.target.value});};
const xopt=()=>{const o={vector:$('xVec').checked,axis:$('xAxis').checked};if(heart)heart.setOptions(o);toBeamer({t:'xopt',o});};$('xVec').onchange=xopt;$('xAxis').onchange=xopt;
function tick(ts){requestAnimationFrame(tick);if(!explain||!heart||!ecg){xLast=null;return;}if(xLast==null)xLast=ts;const dt=Math.min(.1,(ts-xLast)/1000);xLast=ts;
  if(xPlay){xt+=dt*+$('xSpeed').value;if(xt>=9.98)xt=0;}heart.setTime(xt);paper.setCursor(xt);if(sentKey===key())toBeamer({t:'time',x:xt});}
requestAnimationFrame(tick);
/* Präsentationsansicht und Beamer-Fenster */
const present=on=>{document.body.classList.toggle('present',on);};
$('btnPresent').onclick=()=>present(true);$('btnUnpresent').onclick=()=>present(false);
document.addEventListener('keydown',e=>{if(/SELECT|INPUT/.test(e.target.tagName))return;if(e.key==='h'||e.key==='H')present(!document.body.classList.contains('present'));else if(e.key==='Escape')present(false);});
$('btnBeamer').onclick=()=>{let w=null;try{w=window.open('beamer.html','ekg-beamer','popup,width=1280,height=800');}catch(e){}if(!w){present(true);}};
/* Sitzung */
let info=null,online=null;
function showJoin(url,code,hint){$('qr').innerHTML=url?C.qrSvg(url,260):'';$('joinUrl').textContent=url?url.replace(/^https?:\/\//,''):'';$('joinCode').textContent=code||'';$('joinHint').textContent=hint||'';}
function renderPeers(){const n=peers.length;$('peerCount').textContent=nets.length?`${n} Teilnehmer`:'';$('peerCount2').textContent=`(${n})`;const box=$('peers');box.innerHTML='';
  for(const p of peers){const s=document.createElement('span');s.className='peer';s.textContent=p.name||'Gast';const b=document.createElement('button');b.textContent='×';b.title='Entfernen';b.onclick=()=>toAll({t:'kick',id:p.id});s.appendChild(b);box.appendChild(s);}}
function addNet(url){const n=new C.Net(url);n.peers=[];n.on('peers',m=>{n.peers=m.list;peers=[].concat(...nets.map(x=>x.peers||[]));renderPeers();});nets.push(n);
  n.on('status',s=>{if(s==='verbunden'&&lastSpec){/* gespeicherter Stand liegt am Server */}});return n;}
function openJoin(){$('joinDlg').classList.remove('hidden');
  if(info){const pick=u=>showJoin(u,info.room,'Alle Geräte müssen im selben Netz sein. Geht es nicht: Hotspot am Host-Laptop oder Online-Raum nutzen.');pick(info.urls[0]||'');
    const row=$('ipRow');row.innerHTML='';if(info.urls.length>1){row.appendChild(document.createTextNode('Netzwerk: '));const s=document.createElement('select');s.style.width='auto';info.urls.forEach(u=>s.appendChild(new Option(u,u)));s.onchange=()=>pick(s.value);row.appendChild(s);}}
  else if(!online)showJoin('','','Der Host-Modus im WLAN braucht das EKG-Trainer-Programm auf diesem Computer. In dieser Webansicht funktionieren Auswahl, Bühne, Zeichnen, Messen und Erregungsleitung.');}
$('btnJoin').onclick=openJoin;$('joinClose').onclick=()=>$('joinDlg').classList.add('hidden');
const RELAY_STD='https://ekg-trainer.leitwerk.workers.dev';$('relayUrl').value=RELAY_STD;
try{$('relayUrl').value=localStorage.getItem('ekg.relay')||RELAY_STD;}catch(e){}
$('btnOnline').onclick=()=>{let u=$('relayUrl').value.trim().replace(/\/+$/,'');if(!/^https?:\/\//.test(u)){$('onlineState').textContent='Bitte die Adresse des Online-Dienstes eintragen (https://…).';return;}try{localStorage.setItem('ekg.relay',u);}catch(e){}
  if(online){online.net.close();nets.splice(nets.indexOf(online.net),1);}
  const abc='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',rnd=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>abc[b%abc.length]).join('');const room=rnd(5),k=rnd(20);
  const net=addNet(u.replace(/^http/,'ws')+`/ws?room=${room}&role=host&key=${k}`);online={net,room,url:u+'/?r='+room};
  net.on('status',s=>{$('onlineState').textContent=s==='verbunden'?`Online-Raum ${room} ist offen.`:s==='abgelehnt'?'Der Dienst hat die Verbindung abgelehnt.':'Verbindung zum Online-Dienst: '+s;if(s==='verbunden'){showJoin(online.url,room,'Online-Raum: funktioniert über das Internet.');if(lastSpec)resend();}});};
function resend(){if(!lastSpec)return;const keep=Object.assign({},st);/* erneut senden, was zuletzt gesendet wurde */const d=paper.getInk();_send();lastSpec=spec();paper.ink=d.ink;paper.cals=d.cals;paper.draw();inkChanged(d);}
fetch('api/info').then(r=>r.ok?r.json():null).then(j=>{if(!j||!j.room)return;info=j;$('btnQuit').style.display='';$('btnQuit').onclick=()=>{if(!confirm('EKG-Trainer beenden? Alle Teilnehmer werden getrennt.'))return;fetch('api/quit?key='+j.key,{method:'POST'}).finally(()=>{document.body.innerHTML='<div style="padding:40px;font:18px system-ui">EKG-Trainer wurde beendet. Dieses Fenster kann geschlossen werden.</div>';});};const proto=location.protocol==='https:'?'wss':'ws';addNet(`${proto}://${location.host}/ws?room=${j.room}&role=host&key=${j.key}`);renderPeers();}).catch(()=>{});
sel.value=st.case;fillVar();gen();
window.__host={seek:t=>{xt=t;},st,gen,send,paper,monitor,get ecg(){return ecg;},get heart(){return heart;},setExplain,nets};
})();
