/* EKG-Trainer / LeitWerk – synthetischer 12-Kanal-EKG-Generator (Engine 2.0)
 * Ableitungen über die Dower-Matrix; unauffällige Grundform aus der Normalbibliothek (ekg-lib.js, PTB-XL+).
 * generateECG(caseId, seed, {dur}) -> {fs, dur, leads{I..V6: Float32Array mV}, qrs[{t,kind}], meta}
 * Gleicher Seed => gleicher Patient. Die ersten Sekunden sind unabhängig von dur identisch
 * (Papier-EKG 10 s und Live-Monitor 60 s zeigen denselben Patienten).
 * Koordinaten: x = links, y = kaudal, z = anterior. Frontalwinkel wie EKG-Achse (I = 0°, aVF = +90°).
 */
(function (root) {
'use strict';
const LEADS = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const nrm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return mul(a,1/l);};
const rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function rotF(v,d){const c=Math.cos(rad(d)),s=Math.sin(rad(d));return [v[0]*c-v[1]*s,v[0]*s+v[1]*c,v[2]];}
function rotH(v,d){const c=Math.cos(rad(d)),s=Math.sin(rad(d));return [v[0]*c-v[2]*s,v[1],v[0]*s+v[2]*c];}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function rng(seed){const R=mulberry32(seed>>>0);const U=(a,b)=>a+(b-a)*R();
  const G=()=>{let u=0;while(u===0)u=R();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*R());};
  return {R,U,G,chance:p=>R()<p,pick:a=>a[Math.floor(R()*a.length)]};}
function lagetyp(ax){if(ax<-30)return 'Überdrehter Linkstyp';if(ax<30)return 'Linkstyp';if(ax<60)return 'Indifferenztyp';
  if(ax<=90)return 'Steiltyp';if(ax<=120)return 'Rechtstyp';return 'Überdrehter Rechtstyp';}

const VENT_ORIGINS=[[0.55,0.8,-0.6],[-0.45,-0.5,0.75],[0.2,0.9,0.5],[0.7,-0.6,-0.3],[0.1,0.3,-0.95],[-0.6,0.6,0.5]];
/* Dower-Matrix (Dipol -> Ableitungen), umgerechnet auf z = anterior */
const DW={I:[.632,-.235,-.060],II:[.234,1.066,.131],V1:[-.513,.157,.917],V2:[.044,.164,1.387],V3:[.883,.098,1.278],V4:[1.214,.127,.600],V5:[1.124,.127,.085],V6:[.834,.076,-.227]};
let LIB=null;
if(typeof module!=='undefined'&&module.exports){try{LIB=require('./ekg-lib.js');}catch(e){LIB=null;}}else LIB=root.LeitWerkECGLib||null;
const DEFAULT_PAT={pr:.155,d:.09,p:[[.035,.016,.03,.06,.03,.03,.03,.03,.03,.03],[.07,.017,.04,.05,-.03,0,.02,.03,.03,.03]],q:[[.014,.006,-.1,.055,.19],[.032,.009,.17,.5,.4],[.045,.009,.6,.25,-.2],[.055,.009,.5,.2,-.2],[.072,.008,-.16,-.25,-.27]],t:[.2,.17,.15]};
const DWK=['I','II','V1','V2','V3','V4','V5','V6'];
/* Pseudoinverse der Dower-Matrix (8 Ableitungen -> Dipol), für die Vektoranzeige der P-Welle */
const PINV=(()=>{const A=DWK.map(k=>DW[k]);const N=[[0,0,0],[0,0,0],[0,0,0]];for(const r of A)for(let i=0;i<3;i++)for(let j=0;j<3;j++)N[i][j]+=r[i]*r[j];
  const [a,b,c]=N[0],[d,e,f]=N[1],[g,h,k]=N[2];const det=a*(e*k-f*h)-b*(d*k-f*g)+c*(d*h-e*g);
  const inv=[[(e*k-f*h)/det,(c*h-b*k)/det,(b*f-c*e)/det],[(f*g-d*k)/det,(a*k-c*g)/det,(c*d-a*f)/det],[(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det]];
  return [0,1,2].map(i=>A.map(r=>inv[i][0]*r[0]+inv[i][1]*r[1]+inv[i][2]*r[2]));})();
const frontAxis=v=>{const I=dot(DW.I,v),II=dot(DW.II,v);return deg(Math.atan2((II-I/2)/.866,I));};

/* ======================= Hilfen für Befunde ======================= */
const STAGE={hyper:'Hyperakut (sehr früh)',akut:'Akut',fort:'Fortgeschritten (Q-Zacken, beginnende T-Negativierung)',alt:'Abgelaufen / subakut (Tage)'};
function applyQ(M,q,f){if(!q)return;if(q.scale){M.qScale=M.qScale||[1,1,1,1];q.scale.forEach((x,i)=>M.qScale[i]*=Math.pow(x,f));}(q.add||[]).forEach(a=>M.qAdd.push({...a,a:a.a*f}));}
function stemi(c,inj,stage,q){const{U,M}=c;
  if(stage==='hyper'){M.st.push({a:U(.03,.08),v:inj});M.tExtra.push({a:U(.32,.5),v:inj,sym:true,sF:1.25});}
  else if(stage==='fort'){M.st.push({a:U(.14,.26),v:inj});applyQ(M,q,1);M.tExtra.push({a:U(.12,.2),v:mul(inj,-1),dt:.07,sym:true,sF:.8});}
  else if(stage==='alt'){M.st.push({a:U(.02,.06),v:inj});applyQ(M,q,1.25);M.tExtra.push({a:U(.28,.45),v:mul(inj,-1),sym:true});M.tAmp*=.6;}
  else{M.st.push({a:U(.2,.38),v:inj});M.tExtra.push({a:U(.1,.25),v:inj});if(c.chance(.35))applyQ(M,q,.5);}
  M.stAuto=true;
  c.verdict=stage==='alt'?'Abnormales EKG – Infarkt, Alter unbestimmt':stage==='hyper'?'Abnormales EKG – Ischämie möglich':'*** AKUTER INFARKT ***';}
function stageTeach(stage){return {hyper:'Hyperakute Phase: breitbasige, hohe T-Wellen, ST-Hebung noch gering – leicht zu übersehen, Verlaufs-EKG nach 10–15 min!',
  akut:'Akute Phase: ST-Hebung mit Übergang in die T-Welle, Spiegelbilder.',fort:'Fortgeschritten (Stunden): Q-Zacken/R-Verlust, ST-Hebung rückläufig, terminal negative T-Wellen.',
  alt:'Abgelaufen/subakut (Tage): pathologische Q-Zacken, kaum noch ST-Hebung, tief negative T-Wellen. Ohne Klinik/Vor-EKG nicht sicher zu datieren.'}[stage];}
const Q_VW={scale:[.2,.5,1,1],add:[{t:.02,s:.008,a:.2,v:[.1,0,-1]}]}, Q_INF={scale:[1,.55,1,1],add:[{t:.018,s:.007,a:.26,v:[0,-1,0]}]}, Q_LAT={add:[{t:.016,s:.007,a:.24,v:[-1,.1,0]}]};

/* ======================= BEFUNDE ======================= */
const CASES = {
/* ---------- nicht akut ---------- */
normal:{g:'Nicht akut',n:'Unauffällig',v:{alltag:'Alltag (mit Nebenbefunden möglich)',sauber:'Sauber abgeleitet',schlecht:'Schlecht abgeleitet (Artefakte)'},setup(c,v){const{U,chance,P,M,f,noise}=c;
  P.age=Math.round(U(19,84));P.hr=U(50,90);
  if(v!=='sauber'){
    if(P.age>55&&chance(.22)){P.rotFr=U(-80,-68);f.lahb=1;c.dev.push('V. a. linksanterioren Hemiblock');}
    if(chance(.12)){M.PR=U(.21,.25);f.av1=1;c.dev.push('AV-Block I°');}
    if(chance(.13)){M.rsr=true;f.irsb=1;c.dev.push('Inkompletter Rechtsschenkelblock');}
    if(chance(.4)){M.pvc={first:U(1.5,7.5),gap:[5,16]};f.ves=1;c.dev.push('Ventrikuläre Extrasystole(n)');}
    if(P.age>60&&chance(.3)){M.tAmp*=.45;f.flat=1;c.dev.push('Unspezifische T-Abflachung');}}
  M.st.push({a:U(0,.07)*(P.sex==='m'&&P.age<45?1.6:1),v:nrm([.1,.15,1])});
  if(v==='sauber'){noise.wander=U(.005,.03);noise.tremor=U(.002,.006);noise.bad=-1;noise.mains=0;}
  if(v==='schlecht'){noise.wander=U(.12,.25);noise.tremor=U(.03,.06);noise.bad=Math.floor(U(0,9));noise.mains=U(.01,.025);f.art=1;c.dev.push('Artefakte – Ableitungsqualität eingeschränkt');}
  c.verdict=Object.keys(f).filter(k=>k!=='art').length?'Grenzwertiges EKG':'Normales EKG';
  c.teach.push('<b>Kein akuter Befund.</b>'+([f.av1&&'AV-Block I°',f.ves&&'einzelne VES',f.lahb&&'LAHB',f.irsb&&'inkompletter RSB',f.flat&&'flache T-Wellen'].filter(Boolean).length?' Nebenbefunde: '+[f.av1&&'AV-Block I°',f.ves&&'einzelne VES',f.lahb&&'LAHB',f.irsb&&'inkompletter RSB',f.flat&&'flache T-Wellen'].filter(Boolean).join(', ')+'.':''),
    v==='schlecht'?'Muskelzittern, Grundlinienschwankung und Netzbrumm – Patient zudecken, ruhig lagern, Elektroden neu kleben, Kabel nicht über das Gerät führen.':'Leichte J-Punkt-Anhebung in V2/V3 ist physiologisch.');}},
sportler:{g:'Nicht akut',n:'Sportler-EKG',setup(c){const{U,chance,P,M}=c;
  P.sex=chance(.8)?'m':'w';P.age=Math.round(U(17,34));P.hr=U(38,54);P.ampS=U(1.3,1.65);M.resp=U(.08,.15);
  if(chance(.3)){M.PR=U(.21,.26);c.dev.push('AV-Block I°');}
  M.st.push({a:U(.07,.14),v:nrm([.45,.35,.8])});M.jWave={a:U(.04,.1),v:nrm([.6,.5,.5])};M.tAmp*=1.35;
  c.dev.push('Hohe QRS-Amplituden (Sokolow-Lyon positiv)','Frühe Repolarisation');c.verdict='Grenzwertiges EKG';
  c.teach.push('<b>Sportlerherz</b>: Sinusbradykardie, ausgeprägte Sinusarrhythmie, hohe Amplituden, Frührepolarisation, ggf. AV-Block I°. Für sich allein physiologisch.');}},
fruehrepol:{g:'Nicht akut',n:'Frührepolarisation (harmlos)',setup(c){const{U,P,M}=c;
  P.sex='m';P.age=Math.round(U(18,40));P.hr=U(52,76);
  M.st.push({a:U(.1,.19),v:nrm([.5,.35,.75]),w:.013});M.jWave={a:U(.06,.14),v:nrm([.6,.5,.55])};M.tAmp*=1.4;
  c.dev.push('ST-Hebung anterolateral – Frührepolarisation?');c.verdict='Grenzwertiges EKG';
  c.teach.push('<b>Benigne Frührepolarisation</b>: konkave ST-Hebung mit J-Punkt-Kerbe V2–V5, große T-Wellen, keine Spiegelbilder.','Abgrenzung: Perikarditis (PQ-Senkung, diffus) und STEMI (Spiegelbilder, Klinik, Dynamik).');}},
alter_infarkt:{g:'Nicht akut',n:'Alter Infarkt (Narbe)',v:{vw:'Vorderwand',hw:'Hinterwand (inferior)'},setup(c,v){const{U,chance,P,M}=c;
  P.age=Math.round(U(58,88));P.hr=U(58,88);
  if(v==='vw'){M.qScale=[.05,.25,1,1];M.qAdd.push({t:.02,s:.009,a:.32,v:[.15,0,-1]});M.tExtra.push({a:U(.08,.16),v:nrm([0,.1,-1])});
    if(chance(.35)){M.st.push({a:U(.05,.09),v:nrm([.2,0,1])});c.f.aneu=1;}c.dev.push('Q-Zacken V1–V3','Anteriorer Infarkt, alt');}
  else{M.qScale=[1,.3,.9,1];M.qAdd.push({t:.02,s:.009,a:U(.4,.55),v:[0,-1,0]});M.tExtra.push({a:U(.08,.16),v:nrm([0,1,0]).map(x=>-x)});c.dev.push('Q-Zacken II, III, aVF','Inferiorer Infarkt, alt');}
  c.verdict='Abnormales EKG';
  c.teach.push(v==='vw'?'<b>Alter Vorderwandinfarkt</b>: QS-Komplexe V1–V3, fehlende R-Progression, flache/negative T anterior.':'<b>Alter Hinterwandinfarkt</b>: breite, tiefe Q-Zacken in III und aVF (oft auch II), flache/negative T inferior.',
    c.f.aneu?'Persistierende leichte ST-Hebung: an Aneurysma denken – Vergleich mit Vor-EKG entscheidend.':'Ohne Vor-EKG nicht sicher von einem frischen Infarkt abgrenzbar – Klinik!');}},
elektroden:{g:'Nicht akut',n:'Elektroden vertauscht',v:{ra_la:'Arme vertauscht (RA ↔ LA)',la_ll:'Linker Arm ↔ linkes Bein'},setup(c,v){const{U,P,M}=c;
  P.age=Math.round(U(20,85));P.hr=U(58,92);M.swap=v;
  c.dev.push(v==='ra_la'?'Negative P-Welle und negativer QRS in I – Elektrodenvertauschung?':'Ungewöhnliche P-Achse – Elektrodenlage prüfen');c.verdict='Abnormales EKG';
  c.teach.push(v==='ra_la'?'<b>Armelektroden vertauscht</b>: I komplett negativ (P, QRS, T), aVR positiv, II und III sowie aVR und aVL getauscht – Brustwandableitungen normal. Keine Dextrokardie (R-Progression normal)!':'<b>LA/LL vertauscht</b>: I und II getauscht, III invertiert, aVL ↔ aVF. Sehr unauffällig – P in I größer als in II ist ein Hinweis.',
    'Vor jeder Interpretation: Elektrodenlage prüfen. Kann Lagetypwechsel oder „Infarkt“ vortäuschen.');}},
schrittmacher:{g:'Nicht akut',n:'Schrittmacher',v:{vvi:'VVI (Kammer)',ddd:'DDD (Vorhof + Kammer)',aai:'AAI (Vorhof)',loc:'Fehlfunktion: Loss of Capture',us:'Fehlfunktion: Undersensing'},setup(c,v){const{U,chance,P,M,pick}=c;
  P.age=Math.round(U(70,92));const rate=pick([60,60,70]);
  if(v==='vvi'){if(chance(.5)){M.rh={type:'paced',mode:'VVI',rate,under:'af'};M.fAmp=U(.015,.045);M.fFreq=U(5,7);}else{M.rh={type:'paced',mode:'VVI',rate,under:'sinus'};P.hr=U(68,92);}
    c.dev.push('Ventrikulärer Schrittmacherrhythmus');}
  else if(v==='ddd'){M.rh={type:'paced',mode:'DDD',rate,av:U(.15,.19)};c.dev.push('AV-sequenzieller Schrittmacherrhythmus');}
  else if(v==='aai'){M.rh={type:'paced',mode:'AAI',rate};M.PR=U(.18,.24);c.dev.push('Vorhof-Schrittmacherrhythmus');}
  else if(v==='loc'){M.rh={type:'paced',mode:'LOC',rate,cap:U(.4,.65)};c.dev.push('Schrittmacher-Spikes ohne Kammerantwort');}
  else{M.rh={type:'paced',mode:'US',rate};P.hr=U(66,86);c.dev.push('Schrittmacher-Spikes unabhängig vom Eigenrhythmus');}
  c.verdict=v==='loc'||v==='us'?'*** SCHRITTMACHER-FEHLFUNKTION? ***':'Abnormales EKG';
  c.teach.push({vvi:`<b>VVI-Schrittmacher</b> ${rate}/min: Spike vor jedem breiten Kammerkomplex, LSB-artig mit überdrehtem Linkstyp (RV-Apex).`,
    ddd:'<b>DDD-Schrittmacher</b>: Vorhofspike → P-Welle → nach AV-Intervall Kammerspike → breiter QRS.',
    aai:'<b>AAI-Schrittmacher</b>: Vorhofspike vor jeder P-Welle, danach normale (schmale) Überleitung.',
    loc:'<b>Loss of Capture (Exit-Block)</b>: Spikes kommen regelmäßig, aber nicht jeder wird von einem QRS-Komplex beantwortet → Pausen, Bradykardie. Ursachen: Sondendislokation, Reizschwelle, Hyperkaliämie, Batterie.',
    us:'<b>Undersensing</b>: Schrittmacher erkennt den Eigenrhythmus nicht und stimuliert starr – Spikes fallen auch in den Eigenrhythmus/die T-Welle (R-auf-T-Gefahr).'}[v],
    'Erregungsrückbildung nach Kammerstimulation ist sekundär verändert – STEMI-Diagnose nur eingeschränkt möglich.','Magnet: schaltet auf starre Stimulation (Herzschrittmacher) bzw. deaktiviert Schockabgabe (ICD).');}},
/* ---------- Leitung ---------- */
lsb:{g:'Erregungsleitung',n:'Linksschenkelblock',v:{plain:'LSB (bekannt, keine Ischämie)',sg_lat:'LSB + Infarkt lateral (konkordante ST-Hebung)',sg_inf:'LSB + Infarkt inferior (konkordante ST-Hebung)',sg_v13:'LSB + Infarkt posterior (konkordante ST-Senkung V1–V3)',smith:'LSB + Vorderwandinfarkt (exzessiv diskordante ST-Hebung)'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(55,88));P.hr=U(60,95);M.morph='lbbb';M.PR=U(.15,.2);M.sgCheck=true;
  const iv={sg_lat:[.85,-.35,.1],sg_inf:[-.1,1,-.1],sg_v13:[0,.1,-1],smith:[.15,-.05,1]}[v];
  if(iv){M.lbbbIsch={a:v==='smith'?U(.34,.46):U(.3,.42),v:nrm(iv)};M.sgWant={sg_lat:'c1',sg_inf:'c1',sg_v13:'c2',smith:'smith'}[v];}
  c.dev.push('Linksschenkelblock');c.verdict='Abnormales EKG';
  c.teach.push('<b>Kompletter LSB</b>: QRS ≥ 120 ms, breites gekerbtes R in I/aVL/V5/V6, tiefes S in V1, diskordante ST-T (ST-Hebung V1–V3 ist hier normal).',
    {plain:'Keine Ischämiezeichen: alle ST-Veränderungen sind diskordant und proportional (Smith-Quotient < 0,25). Neuer LSB + Brustschmerz trotzdem ernst nehmen.',
     sg_lat:'Lateraler Infarkt: ST-Hebung in Ableitungen mit positivem QRS (I, aVL, V5, V6) – das ist beim LSB nie normal.',
     sg_inf:'Inferiorer Infarkt: ST-Hebung in Ableitungen mit positivem QRS (II, aVF) – konkordant.',
     sg_v13:'Posteriorer Infarkt: ST-Senkung in V1–V3, wo der QRS negativ ist – konkordant.',
     smith:'Vorderwandinfarkt: ST-Hebung V1–V3 ist zwar diskordant, aber unverhältnismäßig groß (ST/S ≥ 0,25 = Smith-modifizierte Sgarbossa-Kriterien).'}[v]);}},
rsb:{g:'Erregungsleitung',n:'Rechtsschenkelblock',v:{rsb:'RSB',bifasz:'Bifaszikulär (RSB + LAHB)',trifasz:'RSB + LAHB + AV-Block I°'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(40,88));P.hr=U(58,95);M.morph='rbbb';
  if(v!=='rsb'){P.rotFr=U(-82,-70);}if(v==='trifasz')M.PR=U(.22,.28);
  c.dev.push('Rechtsschenkelblock');if(v!=='rsb')c.dev.push('Linksanteriorer Hemiblock');if(v==='trifasz')c.dev.push('AV-Block I°');c.verdict='Abnormales EKG';
  c.teach.push('<b>Kompletter RSB</b>: QRS ≥ 120 ms, rSR′ („M“) in V1/V2, breites S in I und V6, sekundäre T-Negativierung V1–V3.',
    v!=='rsb'?'Zusätzlich überdrehter Linkstyp (LAHB) → bifaszikulärer Block'+(v==='trifasz'?' mit AV-Block I° („trifaszikulär“) – Synkopenrisiko durch AV-Block III°.':'.'):'');}},
wpw:{g:'Erregungsleitung',n:'WPW / Präexzitation',v:{muster:'WPW-Muster im Sinusrhythmus',fbi:'Vorhofflimmern bei WPW (FBI-Tachykardie)',avrt:'Orthodrome AVRT (schmal)'},setup(c,v){const{U,P,M,pick}=c;P.age=Math.round(U(14,50));
  const dv=nrm(pick([[-.2,.5,.8],[.6,.6,.3],[.3,-.4,.8]]));
  if(v==='muster'){P.hr=U(60,95);M.delta={a:U(.4,.6),v:dv};M.PR=U(.115,.135);c.dev.push('Kurze PQ-Zeit mit Delta-Welle – V. a. Präexzitation (WPW)');c.verdict='Abnormales EKG';}
  else if(v==='fbi'){M.rh={type:'af',irr:.32,minRR:.24};P.hr=U(180,250);M.delta={a:U(.9,1.3),v:dv};M.qWide=1.15;M.fAmp=U(.02,.05);M.fFreq=U(5,7);c.dev.push('Unregelmäßige Breitkomplextachykardie – V. a. präexzitiertes Vorhofflimmern');c.verdict='*** BREITKOMPLEXTACHYKARDIE ***';}
  else{M.rh={type:'svt'};P.hr=U(170,230);M.retroP='late';c.dev.push('Schmalkomplextachykardie, regelmäßig, retrograde P-Wellen');c.verdict='Abnormales EKG';}
  c.teach.push({muster:'<b>WPW-Muster</b>: PQ < 120 ms, Delta-Welle, QRS verbreitert, sekundäre ST-T-Veränderungen.',
    fbi:'<b>FBI-Tachykardie</b> (fast, broad, irregular): Vorhofflimmern über die akzessorische Bahn, QRS breit und wechselnd breit, Frequenz bis > 250/min – Gefahr von Kammerflimmern.',
    avrt:'<b>Orthodrome AVRT</b>: regelmäßige Schmalkomplextachykardie, retrograde P-Wellen sichtbar in der ST-Strecke (RP > 70 ms) – Unterschied zur AVNRT.'}[v],
    v==='fbi'?'KEINE AV-Knoten-Blocker (Adenosin, Betablocker, Ca-Antagonisten, Amiodaron) – elektrische Kardioversion.':'Gefahr: Vorhofflimmern über die Bahn → keine AV-Knoten-Blocker bei präexzitiertem VHF.');}},
extrasystolen:{g:'Erregungsleitung',n:'Ventrikuläre Extrasystolen',v:{bigem:'Bigeminus',trigem:'Trigeminus',couplet:'Couplets',multi:'Multifokale VES',ront:'R-auf-T-VES'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(45,88));P.hr=U(62,92);
  if(v==='bigem')M.pvc={every:2};else if(v==='trigem')M.pvc={every:3};else if(v==='couplet')M.pvc={first:U(1.2,3),gap:[2.5,5],couplet:true};
  else if(v==='multi')M.pvc={first:U(1,2.5),gap:[1.5,3.5],multi:true};else{M.pvc={first:U(1.5,3),gap:[3,6],early:true};M.QTc=U(.44,.48);}
  c.dev.push({bigem:'Ventrikulärer Bigeminus',trigem:'Ventrikulärer Trigeminus',couplet:'Ventrikuläre Couplets',multi:'Multifokale ventrikuläre Extrasystolen',ront:'Ventrikuläre Extrasystolen mit R-auf-T-Phänomen'}[v]);c.verdict='Abnormales EKG';
  c.teach.push({bigem:'<b>Bigeminus</b>: auf jeden Normalschlag folgt eine VES mit kompensatorischer Pause. Pulsdefizit – Pulsoxymeter zählt oft nur die Hälfte.',
    trigem:'<b>Trigeminus</b>: zwei Normalschläge, dann eine VES.',couplet:'<b>Couplets</b>: zwei VES direkt hintereinander (höhergradig, Vorstufe von Salven/VT).',
    multi:'<b>Multifokale VES</b>: unterschiedliche Morphologien = verschiedene Ursprungsorte, höheres Risiko (Ischämie, Elektrolyte).',
    ront:'<b>R-auf-T</b>: sehr früh einfallende VES im absteigenden T – kann Kammerflimmern/Torsade auslösen.'}[v]);}},
/* ---------- bradykard ---------- */
sinusknoten:{g:'Bradykarde Rhythmen',n:'SA-Block / Sinusarrest',v:{sab:'SA-Block II° (Pause = 2 × PP)',arrest:'Sinusarrest mit Ersatzschlag',brady:'Ausgeprägte Sinusbradykardie'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(50,90));
  if(v==='sab'){P.hr=U(62,84);M.pDrop={type:'sab',p:U(.15,.25),first:U(1.5,4)};c.dev.push('Pausen ohne P-Welle (doppelte PP-Länge) – SA-Block II°');}
  else if(v==='arrest'){P.hr=U(58,80);M.pDrop={type:'arrest',first:U(2.5,4.5),len:[2.2,3.8],gap:[9,16]};c.dev.push('Sinusarrest mit junktionalem Ersatzschlag');}
  else{P.hr=U(30,40);M.resp=U(.03,.08);}
  c.verdict='Abnormales EKG';
  c.teach.push({sab:'<b>SA-Block II° (Typ Mobitz)</b>: plötzlich fehlt eine P-Welle samt QRS, die Pause ist genau doppelt so lang wie ein PP-Intervall.',
    arrest:'<b>Sinusarrest</b>: Sinusknoten setzt aus, Pause ist kein Vielfaches des PP-Intervalls, Ende durch Ersatzschlag (schmal, ohne P) oder Wiederaufnahme. Sick-Sinus-Syndrom.',
    brady:'<b>Ausgeprägte Sinusbradykardie</b> < 40/min: Medikamente (Betablocker, Digitalis), Hypothyreose, Hypothermie, erhöhter Hirndruck, Inferiorinfarkt.'}[v]);}},
junktional:{g:'Bradykarde Rhythmen',n:'Junktionaler Rhythmus',v:{ersatz:'Junktionaler Ersatzrhythmus',retro:'Mit retrograden P-Wellen',akz:'Akzelerierter junktionaler Rhythmus'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(40,90));
  M.rh={type:'junct',hr:v==='akz'?U(72,110):U(40,58)};if(v==='retro')M.retroP='late';
  c.dev.push(v==='akz'?'Akzelerierter junktionaler Rhythmus':'Junktionaler Ersatzrhythmus');c.verdict='Abnormales EKG';
  c.teach.push('<b>Junktionaler Rhythmus</b>: schmale QRS-Komplexe, regelmäßig, keine P-Wellen davor'+(v==='retro'?' – retrograde (negative) P-Wellen in II/III/aVF nach dem QRS.':'.'),
    v==='akz'?'Akzeleriert (60–110/min): Digitalis-Intoxikation, Myokarditis, nach Herz-OP, Reperfusion.':'Ersatzrhythmus 40–60/min bei Ausfall des Sinusknotens.');}},
wenckebach:{g:'Bradykarde Rhythmen',n:'AV-Block II° Wenckebach',v:{r3:'3:2',r4:'4:3',r5:'5:4'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(40,88));P.hr=U(65,95);const r=+v.slice(1);M.rh={type:'sinus',av:'wenck',ratio:r};M.PR=U(.16,.2);M.pAmp=U(1.3,1.7);
  c.dev.push(`AV-Block II° Typ Wenckebach (${r}:${r-1})`);c.verdict='Abnormales EKG';
  c.teach.push('<b>Mobitz I / Wenckebach</b>: PQ wird von Schlag zu Schlag länger, bis eine P-Welle nicht übergeleitet wird; danach wieder kurzes PQ. Meist AV-Knoten, oft harmlos (Vagotonie, Inferiorinfarkt, Medikamente).');}},
mobitz:{g:'Bradykarde Rhythmen',n:'AV-Block II° Mobitz / höhergradig',v:{m21:'2:1, schmaler QRS',m21b:'2:1 mit Schenkelblock',m32:'Mobitz II 3:2',m31:'Höhergradig 3:1'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(55,90));P.hr=U(70,100);
  const r={m21:2,m21b:2,m32:3,m31:3}[v];M.rh={type:'sinus',av:v==='m31'?'high':'mobitz',ratio:r};M.PR=U(.15,.2);M.pAmp=U(1.3,1.7);
  if(v==='m21b'||v==='m32'&&c.chance(.6)){M.morph='rbbb';c.f.rsb=1;}
  c.dev.push({m21:'AV-Block II° mit 2:1-Überleitung',m21b:'AV-Block II° mit 2:1-Überleitung',m32:'AV-Block II° Typ Mobitz (3:2)',m31:'Höhergradiger AV-Block (3:1)'}[v]);if(c.f.rsb)c.dev.push('Rechtsschenkelblock');c.verdict='*** HÖHERGRADIGER AV-BLOCK ***';
  c.teach.push(v==='m31'?'<b>Höhergradiger AV-Block</b>: mehrere P-Wellen hintereinander werden nicht übergeleitet (3:1) – hohes Risiko für AV-Block III°.':'<b>Mobitz II</b>: konstantes PQ, plötzlich nicht übergeleitete P-Welle. Infranodal, Gefahr des Übergangs in AV-Block III° → Pacing-Bereitschaft.',
    v.startsWith('m21')?'Bei 2:1 ist Typ I/II formal nicht unterscheidbar; breiter QRS spricht für infranodal.':'');}},
av3:{g:'Bradykarde Rhythmen',n:'AV-Block III°',v:{junk:'Junktionaler (schmaler) Ersatzrhythmus',vent:'Ventrikulärer (breiter) Ersatzrhythmus',vhf:'Bei Vorhofflimmern (regelmäßige Kammer)'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(55,92));P.hr=U(70,100);
  const junk=v!=='vent';M.pAmp=U(1.3,1.7);M.rh={type:'av3',esc:junk?U(38,54):U(24,40),escKind:junk?'normal':'esc',under:v==='vhf'?'af':'sinus'};if(v==='vhf'){M.fAmp=U(.03,.08);M.fFreq=U(5,7);}
  c.dev.push(v==='vhf'?'Vorhofflimmern mit regelmäßiger, langsamer Kammeraktion – V. a. AV-Block III°':'AV-Block III° mit '+(junk?'junktionalem (schmalem)':'ventrikulärem (breitem)')+' Ersatzrhythmus');c.verdict='*** HÖHERGRADIGER AV-BLOCK ***';
  c.teach.push(v==='vhf'?'<b>AV-Block III° bei Vorhofflimmern</b>: VHF mit plötzlich regelmäßiger, langsamer Kammerfrequenz = kompletter Block mit Ersatzrhythmus (oft Digitalis).':'<b>Totaler AV-Block</b>: P-Wellen und QRS laufen völlig unabhängig, Vorhoffrequenz > Kammerfrequenz.',
    junk?'Schmaler Ersatzrhythmus (junktional, ~40–55/min) – meist stabiler.':'Breiter ventrikulärer Ersatzrhythmus (~25–40/min) – instabil, Pacing!');}},
/* ---------- tachykard ---------- */
sinustachy:{g:'Tachykarde Rhythmen',n:'Sinustachykardie',setup(c){const{U,P,M,noise}=c;P.age=Math.round(U(18,85));P.hr=U(105,145);M.resp=U(.005,.02);noise.tremor=U(.01,.035);
  c.verdict='Grenzwertiges EKG';c.teach.push('<b>Sinustachykardie</b>: jedem QRS geht eine normale P-Welle voraus, Frequenz meist < 150/min.','Ist ein Symptom – Ursache suchen: Schmerz, Angst, Fieber, Volumenmangel, Blutung, Sepsis, LE, Hypoxie.');}},
vhf:{g:'Tachykarde Rhythmen',n:'Vorhofflimmern',v:{normo:'Normofrequent',tachy:'Tachykard',tachyst:'Tachykard mit ST-Senkung',brady:'Bradykard',lsb:'Tachykard mit Linksschenkelblock'},setup(c,v){const{U,P,M,noise}=c;P.age=Math.round(U(55,92));M.rh={type:'af'};M.fAmp=U(.02,.09);M.fFreq=U(5,7.5);
  P.hr={normo:U(62,98),tachy:U(115,160),tachyst:U(125,165),brady:U(36,52),lsb:U(120,160)}[v];
  if(v==='tachyst'){M.st.push({a:U(.15,.24),v:nrm([-.6,-.55,-.3])});M.tAmp*=.75;M.stAuto=true;}
  if(v==='lsb'){M.morph='lbbb';c.dev.push('Linksschenkelblock');}
  if(v!=='normo'&&v!=='brady')noise.tremor=U(.008,.035);c.verdict=v==='lsb'?'*** BREITKOMPLEXTACHYKARDIE ***':'Abnormales EKG';
  c.teach.push({normo:'<b>Vorhofflimmern, normofrequent</b>: absolute Arrhythmie, keine P-Wellen, Flimmerwellen v. a. V1.',
    tachy:'<b>Tachyarrhythmia absoluta</b>: unregelmäßige RR-Abstände, keine P-Wellen.',tachyst:'<b>Tachyarrhythmia absoluta mit ST-Senkung</b>: diffuse ST-Senkung mit Hebung in aVR, frequenzbedingt möglich – nach Frequenzkontrolle neu beurteilen.',
    brady:'<b>Bradyarrhythmia absoluta</b>: VHF mit langsamer Überleitung – Medikamente (Betablocker, Digitalis), Sinusknotenerkrankung.',
    lsb:'<b>VHF mit Schenkelblock</b>: unregelmäßige Breitkomplextachykardie – Differenzialdiagnose präexzitiertes VHF (WPW) und VT. Unregelmäßigkeit + gleichbleibende LSB-Morphologie spricht für VHF + Block.'}[v]);}},
flattern:{g:'Tachykarde Rhythmen',n:'Vorhofflattern',v:{c2:'2:1-Überleitung',c4:'4:1-Überleitung',var:'Variable Überleitung'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(50,90));const cond=v==='var'?'var':+v.slice(1);
  M.rh={type:'flutter',aRate:U(260,320),cond};M.flAmp=U(.15,.28);
  c.dev.push(cond==='var'?'Vorhofflattern mit variabler Überleitung':`Vorhofflattern mit ${cond}:1-Überleitung`);c.verdict='Abnormales EKG';
  c.teach.push('<b>Vorhofflattern</b>: Sägezahnmuster ~300/min, negativ in II/III/aVF, positiv in V1.','Regelmäßige Schmalkomplextachykardie um 150/min → immer an Flattern 2:1 denken (jede 2. Flatterwelle im QRS/T versteckt).');}},
svt:{g:'Tachykarde Rhythmen',n:'SVT (AVNRT)',v:{typ:'Typische AVNRT',std:'Mit frequenzbedingter ST-Senkung'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(16,65));P.hr=U(160,220);M.rh={type:'svt'};M.retroP=true;
  if(v==='std'){M.st.push({a:U(.16,.24),v:nrm([-.6,-.5,-.35])});M.stAuto=true;}
  c.dev.push('Schmalkomplextachykardie, regelmäßig – V. a. AV-Knoten-Reentry');c.verdict='Abnormales EKG';
  c.teach.push('<b>AVNRT</b>: regelmäßige Schmalkomplextachykardie 160–220/min, keine sichtbaren P-Wellen (Pseudo-r′ in V1, Pseudo-S in II/III/aVF).','Vagusmanöver (modifiziertes Valsalva), Adenosin.',v==='std'?'Frequenzbedingte ST-Senkungen sind häufig und kein Infarktbeweis.':'');}},
vt:{g:'Tachykarde Rhythmen',n:'Ventrikuläre Tachykardie',v:{mono:'Monomorph',dissoc:'Mit sichtbarer AV-Dissoziation',langsam:'Langsame VT (120–145/min)',rvot:'RVOT-VT (LSB-Morphologie, inferiore Achse)',fasz:'Faszikuläre VT (RSB + überdrehter Linkstyp)'},setup(c,v){const{U,chance,P,M,pick}=c;P.age=Math.round(U(45,88));P.hr=U(75,100);
  M.rh={type:'vt',hr:v==='langsam'?U(120,145):U(150,215),dissoc:v==='dissoc'||(v==='mono'&&chance(.3))};
  M.vtV=nrm(v==='rvot'?[.15,.9,-.55]:v==='fasz'?[.25,-.8,.55]:pick(VENT_ORIGINS));if(v==='fasz'){M.ventW=.78;P.age=Math.round(U(15,40));}if(v==='rvot')P.age=Math.round(U(20,50));
  c.dev.push('Breitkomplextachykardie – V. a. ventrikuläre Tachykardie');c.verdict='*** VENTRIKULÄRE TACHYKARDIE ***';
  c.teach.push({mono:'<b>Monomorphe VT</b>: regelmäßige Breitkomplextachykardie (QRS > 120 ms), bizarre Morphologie.',dissoc:'<b>VT mit AV-Dissoziation</b>: P-Wellen laufen unabhängig durch die Breitkomplexe – beweisend für VT.',
    langsam:'<b>Langsame VT</b> (z. B. unter Antiarrhythmika): trotz niedriger Frequenz breite, regelmäßige Komplexe ohne P-Bezug.',rvot:'<b>RVOT-VT</b>: LSB-artig (V1 negativ), steile inferiore Achse – oft idiopathisch bei Herzgesunden, gutartiger.',
    fasz:'<b>Faszikuläre VT</b> (Belhassen): relativ schmal (120–140 ms), RSB-Bild + überdrehter Linkstyp, junge Patienten – spricht auf Verapamil an, wird oft als SVT verkannt.'}[v],
    M.rh.dissoc&&v==='mono'?'Einzelne P-Wellen laufen unabhängig durch – AV-Dissoziation.':'','Breitkomplextachykardie im Zweifel immer als VT behandeln. Puls prüfen!');}},
tdp:{g:'Tachykarde Rhythmen',n:'Torsade de pointes',v:{salven:'Selbstlimitierende Salven',anhaltend:'Anhaltend'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(30,85));P.sex='w';P.hr=U(46,62);M.QTc=U(.56,.64);M.tS1F=1.25;
  M.tdp=v==='anhaltend'?{first:U(1.2,2),gap:[3,5],len:[25,40]}:{first:U(2.2,3.5),gap:[10,18],len:[3,6]};
  c.dev.push('Polymorphe ventrikuläre Tachykardie (Torsade de pointes)','QT-Verlängerung');c.verdict='*** VENTRIKULÄRE TACHYKARDIE ***';
  c.teach.push('<b>Torsade de pointes</b>: polymorphe VT, die sich um die Grundlinie „dreht“, ausgelöst durch R-auf-T bei langem QT.','Magnesium; Ursachen: Medikamente, Hypokaliämie/-magnesiämie, Bradykardie. Kann in Kammerflimmern übergehen.');}},
/* ---------- Reanimation ---------- */
vf:{g:'Reanimation',n:'Kammerflimmern',v:{grob:'Grobes Kammerflimmern',fein:'Feines Kammerflimmern'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(40,88));M.rh={type:'vf'};M.vfAmp=v==='grob'?U(.3,.55):U(.07,.16);
  c.dev.push('Kammerflimmern');c.verdict='*** KAMMERFLIMMERN ***';
  c.teach.push(`<b>Kammerflimmern (${v})</b>: chaotische Aktivität ohne erkennbare QRS-Komplexe.`,'Defibrillierbar. Feines VF nicht mit Asystolie verwechseln (Verstärkung erhöhen, 2 Ableitungen).');}},
asystolie:{g:'Reanimation',n:'Asystolie / agonal',v:{asys:'Asystolie',pwell:'P-Wellen-Asystolie',agonal:'Agonaler Rhythmus'},setup(c,v){const{U,P,M,noise}=c;P.age=Math.round(U(45,92));noise.wander=U(.02,.07);
  if(v==='agonal'){M.rh={type:'agonal',hr:U(8,22)};M.escV=nrm(c.pick(VENT_ORIGINS));M.ventW=1.5;}else M.rh={type:'asys',p:v==='pwell'};P.hr=U(30,55);
  c.dev.push({asys:'Asystolie',pwell:'P-Wellen ohne Kammeraktion (P-Wellen-Asystolie)',agonal:'Sehr langsamer, breiter Kammerersatzrhythmus'}[v]);c.verdict=v==='agonal'?'*** EXTREME BRADYKARDIE ***':'*** ASYSTOLIE ***';
  c.teach.push({asys:'<b>Asystolie</b>: keine elektrische Aktivität. Elektroden, Kabel und Verstärkung prüfen.',pwell:'<b>P-Wellen-Asystolie</b>: Vorhofaktion, aber keine Kammererregung – evtl. auf Pacing ansprechend.',
    agonal:'<b>Agonaler Rhythmus</b>: sehr breite, bizarre Kammerkomplexe < 20/min, meist pulslos (PEA) – terminal.'}[v],'Nicht defibrillierbar.');}},
/* ---------- Ischämie ---------- */
stemi_vw:{g:'Ischämie / Infarkt',n:'STEMI Vorderwand',v:{prox:'Proximale LAD – akut',mid:'Mittlere LAD – akut',wrap:'Wraparound-LAD (anterior + inferior)',hyper:STAGE.hyper,fort:STAGE.fort,alt:STAGE.alt},setup(c,v){const{U,chance,P,M}=c;P.age=Math.round(U(40,86));P.hr=U(68,112);
  const prox=v==='prox'||(v!=='mid'&&v!=='wrap'&&chance(.55));
  const inj=v==='wrap'?nrm([U(.15,.3),U(.4,.6),.85]):prox?nrm([U(.25,.4),U(-.5,-.3),.85]):nrm([U(.2,.35),U(.05,.2),.95]);
  const stage=['hyper','fort','alt'].includes(v)?v:'akut';stemi(c,inj,stage,Q_VW);
  c.teach.push(`<b>Vorderwand-Infarkt (${v==='wrap'?'Wraparound-LAD':prox?'proximale LAD':'mittlere LAD'})</b>: ST-Hebung V1–V4${v==='wrap'?' und zusätzlich II/III/aVF (LAD umgreift die Herzspitze)':prox?', zusätzlich I und aVL, Spiegelbild in II/III/aVF':''}.`,stageTeach(stage),'Gefahr: Kammerflimmern, kardiogener Schock.');}},
stemi_inf:{g:'Ischämie / Infarkt',n:'STEMI Hinterwand (inferior)',v:{rca:'RCA – akut',rcx:'RCX – akut',rv:'RCA mit RV-Beteiligung',post:'Inferoposterior',av3:'Mit AV-Block III°',hyper:STAGE.hyper,fort:STAGE.fort,alt:STAGE.alt},setup(c,v){const{U,chance,P,M}=c;P.age=Math.round(U(42,86));P.hr=U(46,74);P.rotFr=U(-20,25);
  const rcx=v==='rcx'||(['hyper','fort','alt'].includes(v)&&chance(.3));
  const inj=v==='rv'?nrm([U(-.55,-.4),.85,U(.2,.35)]):v==='post'?nrm([U(-.2,.1),.8,U(-.75,-.55)]):rcx?nrm([U(.25,.5),1,U(-.7,-.35)]):nrm([U(-.38,-.15),1,U(-.45,-.05)]);
  const stage=['hyper','fort','alt'].includes(v)?v:'akut';stemi(c,inj,stage,Q_INF);
  if(v==='av3'){M.rh={type:'av3',esc:U(36,48),escKind:'normal',under:'sinus'};P.hr=U(70,95);c.dev.push('AV-Block III° mit junktionalem Ersatzrhythmus');}
  else if(stage!=='alt'&&chance(.25)){M.PR=U(.21,.27);c.dev.push('AV-Block I°');}
  if(chance(.2)&&v!=='av3')M.pvc={first:U(2,7),gap:[6,18]};
  c.noise.wander=U(.04,.16);c.noise.tremor=U(.006,.03);
  c.teach.push(`<b>Inferiorer Infarkt</b> (${v==='rv'?'RCA proximal mit RV-Beteiligung: ST-Hebung III > II plus ST-Hebung in V1':v==='post'?'inferoposterior: zusätzlich ST-Senkung V1–V3 = Hinterwand (V7–V9)':rcx?'RCX: II ≥ III, eher Hebung V5/V6, ST-Senkung V1–V3':'RCA: III > II, ST-Senkung in I und aVL'}).`,stageTeach(stage),
    v==='rv'?'RV-Infarkt: V4R ableiten; vorlastabhängig – kein Nitro, Volumen.':v==='av3'?'AV-Blockierungen bei Hinterwandinfarkt meist nodal (schmaler Ersatzrhythmus), oft reversibel.':'Bradykardie und AV-Blockierungen häufig.');}},
stemi_lat:{g:'Ischämie / Infarkt',n:'STEMI Lateralwand',v:{akut:'Lateral – akut',hoch:'Hoch-lateral (I, aVL)',hyper:STAGE.hyper,alt:STAGE.alt},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(42,86));P.hr=U(62,105);
  const inj=v==='hoch'?nrm([U(.25,.4),U(-1,-.9),U(-.2,0)]):nrm([U(.75,.9),U(-.55,-.35),U(-.25,0)]);
  const stage=['hyper','alt'].includes(v)?v:'akut';stemi(c,inj,stage,Q_LAT);
  c.teach.push(v==='hoch'?'<b>Hoch-lateraler STEMI</b> (Diagonalast/RCX): ST-Hebung nur in I und aVL, deutliches Spiegelbild in III/aVF.':'<b>Lateraler Infarkt</b> (RCX oder Diagonalast): ST-Hebung I, aVL, V5, V6 mit Spiegelbild in III/aVF.',
    stageTeach(stage),'Laterale Hebungen sind oft klein (1 mm) – das Spiegelbild in III ist häufig auffälliger als die Hebung selbst.');}},
stemi_post:{g:'Ischämie / Infarkt',n:'Posteriorer Infarkt',setup(c){const{U,P,M}=c;P.age=Math.round(U(42,86));P.hr=U(62,100);
  M.st.push({a:U(.18,.3),v:nrm([.1,.15,-1])});M.qAdd.push({t:.042,s:.013,a:U(.6,.85),v:[0,0,1]});M.tExtra.push({a:U(.15,.25),v:[0,0,1]});
  M.stAuto=true;c.verdict='Abnormales EKG – Ischämie möglich';
  c.teach.push('<b>Isolierter posteriorer Infarkt</b> (STEMI-Äquivalent!): horizontale ST-Senkung V1–V3, hohe R-Zacken V2 (R/S > 1), aufrechte T-Wellen.','Beweis: ST-Hebung in V7–V9. Wird von Geräten oft nur als „Ischämie“ erkannt.');}},
hauptstamm:{g:'Ischämie / Infarkt',n:'ST-Hebung aVR / Hauptstamm',setup(c){const{U,P,M}=c;P.age=Math.round(U(48,88));P.hr=U(95,128);
  M.st.push({a:U(.2,.32),v:nrm([-.6,-.55,-.3])});M.tAmp*=.7;M.stAuto=true;c.verdict='Abnormales EKG – Ischämie, Hauptstamm möglich';
  c.teach.push('<b>Diffuse ST-Senkung ≥ 6 Ableitungen + ST-Hebung aVR (≥ V1)</b>: Hauptstamm- oder Mehrgefäßischämie, schwere subendokardiale Ischämie.','Hohe Letalität – Katheterzentrum, Schockgefahr.');}},
nste:{g:'Ischämie / Infarkt',n:'NSTE-ACS',v:{lat:'ST-Senkung lateral',diffus:'Diffuse ST-Senkung',tneg:'Nur T-Negativierung'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(48,88));P.hr=U(72,110);
  if(v==='lat')M.st.push({a:U(.08,.17),v:nrm([-.75,-.25,-.35])});else if(v==='diffus')M.st.push({a:U(.1,.18),v:nrm([-.6,-.45,-.45])});
  if(v==='tneg')M.tExtra.push({a:U(.3,.45),v:nrm([-.8,-.25,-.3]),sym:true});else if(c.chance(.5))M.tExtra.push({a:U(.08,.15),v:nrm([-.8,-.2,-.2])});
  M.stAuto=v!=='tneg';if(v==='tneg')c.dev.push('T-Negativierung lateral');c.verdict='Abnormales EKG – Ischämie möglich';
  c.teach.push({lat:'<b>Horizontale/deszendierende ST-Senkung lateral</b> (I, aVL, V4–V6): subendokardiale Ischämie, NSTE-ACS möglich.',diffus:'<b>Diffuse ST-Senkung</b>: ausgedehnte subendokardiale Ischämie.',tneg:'<b>Symmetrische T-Negativierung lateral</b>: Ischämiezeichen ohne ST-Senkung.'}[v],'ST-Senkung lokalisiert die Ischämie nicht. Troponin, Verlaufs-EKG.');}},
wellens:{g:'Ischämie / Infarkt',n:'Wellens-Syndrom',v:{B:'Typ B (tief negative T)',A:'Typ A (biphasische T)'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(42,82));P.hr=U(58,88);
  if(v==='A')M.tExtra.push({a:U(.12,.2),v:nrm([.1,.1,1]),dt:-.06,sym:true},{a:U(.3,.45),v:nrm([.1,.1,-1]),dt:.05,sym:true});
  else M.tExtra.push({a:U(.45,.7),v:nrm([.05,.15,-1]),sym:true});
  M.st.push({a:U(0,.04),v:[0,0,1]});c.dev.push(v==='A'?'Biphasische T-Wellen V2/V3':'T-Negativierung V2–V4');c.verdict='Abnormales EKG – Ischämie möglich';
  c.teach.push(`<b>Wellens-Syndrom Typ ${v}</b>: ${v==='A'?'biphasische T-Wellen (erst positiv, dann negativ) V2/V3':'tiefe, symmetrische T-Negativierung V2–V4'}, erhaltene R-Progression, keine/minimale ST-Hebung.`,'Hinweis auf kritische proximale LAD-Stenose, Patient oft schmerzfrei – hohes Infarktrisiko.');}},
dewinter:{g:'Ischämie / Infarkt',n:'De-Winter-Muster',setup(c){const{U,P,M}=c;P.age=Math.round(U(40,80));P.sex='m';P.hr=U(70,105);
  M.stDip={a:U(.22,.32),v:nrm([-.4,-.2,-.85])};M.tExtra.push({a:U(.45,.7),v:nrm([.2,.2,1]),sym:true,sF:.75});
  M.stAuto=true;c.verdict='Abnormales EKG – Ischämie möglich';
  c.teach.push('<b>De-Winter-Muster</b> (STEMI-Äquivalent, proximale LAD): aszendierende ST-Senkung am J-Punkt V1–V6 mit hohen, spitzen T-Wellen, oft leichte ST-Hebung aVR.','Kein klassischer STEMI – wird leicht übersehen.');}},
aivr:{g:'Ischämie / Infarkt',n:'AIVR (Reperfusion)',setup(c){const{U,P,M}=c;P.age=Math.round(U(45,85));P.hr=U(55,72);M.rh={type:'vt',hr:U(62,100),dissoc:true};M.vtV=nrm(c.pick(VENT_ORIGINS));
  c.dev.push('Akzelerierter idioventrikulärer Rhythmus');c.verdict='Abnormales EKG';
  c.teach.push('<b>AIVR</b>: regelmäßige breite Kammerkomplexe 50–110/min, P-Wellen dissoziiert – typisch kurz nach Reperfusion (Lyse/PCI).','Meist hämodynamisch stabil und selbstlimitierend – nicht wie eine VT behandeln.');}},
/* ---------- Sonstige ---------- */
hyperk:{g:'Elektrolyte & Sonstiges',n:'Hyperkaliämie',v:{leicht:'Leicht (nur spitze T)',maessig:'Mäßig',schwer:'Schwer',sinus:'Sinuswellenmuster (prä-Arrest)'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(45,90));
  M.tAmp=U(.65,1.0);M.tS1F=.55;M.tS2F=.85;M.tVec=[.55,.45,.7];M.QTc=U(.37,.41);
  if(v==='leicht'){P.hr=U(62,88);M.tAmp=U(.55,.8);}
  else if(v==='maessig'){P.hr=U(55,80);M.qWide=U(1.08,1.22);M.pAmp*=.55;M.PR=U(.19,.23);}
  else if(v==='schwer'){P.hr=U(40,58);M.qWide=U(1.5,1.85);M.pAmp=U(0,.2);M.PR=U(.23,.28);}
  else{M.rh={type:'junct',hr:U(28,42)};M.morph='sine';M.QTc=.3;}
  c.dev.push(v==='sinus'?'Extrem breite QRS-Komplexe, sinusartig':'Hohe spitze T-Wellen',...(v==='maessig'?['QRS-Verbreiterung, flache P-Wellen']:v==='schwer'?['Deutliche QRS-Verbreiterung, fehlende P-Wellen']:[]));c.verdict=v==='sinus'?'*** HYPERKALIÄMIE? PRÄ-ARREST ***':'Abnormales EKG – Hyperkaliämie?';
  c.teach.push({leicht:'<b>Hyperkaliämie leicht</b>: hohe, schmalbasige „zeltförmige“ T-Wellen.',maessig:'<b>Hyperkaliämie mäßig</b>: zusätzlich PQ-Verlängerung, flache P-Wellen, beginnende QRS-Verbreiterung.',
    schwer:'<b>Hyperkaliämie schwer</b>: P-Wellen fehlen, QRS deutlich verbreitert, Bradykardie.',sinus:'<b>Sinuswellenmuster</b>: QRS und T verschmelzen zu einer Sinuswelle – unmittelbar vor Kammerflimmern/Asystolie. Calcium sofort!'}[v],'Dialysepatient, Niereninsuffizienz, ACE-Hemmer/Spironolacton, Rhabdomyolyse.');}},
hypok:{g:'Elektrolyte & Sonstiges',n:'Hypokaliämie',v:{leicht:'Leicht',schwer:'Schwer (U > T, VES)'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(25,85));P.hr=U(65,100);
  if(v==='schwer'){M.tAmp*=.15;M.u=U(.28,.4);M.st.push({a:U(.07,.12),v:nrm([-.6,-.5,-.4])});M.pvc={first:U(1.5,4),gap:[2.5,6]};}
  else{M.tAmp*=.4;M.u=U(.14,.2);M.st.push({a:U(.03,.06),v:nrm([-.6,-.5,-.4])});}
  c.dev.push('Flache T-Wellen, prominente U-Wellen','ST-Senkung');c.verdict='Abnormales EKG';
  c.teach.push('<b>Hypokaliämie</b>: flache T-Wellen, prominente U-Wellen (v. a. V2–V3), ST-Senkung, scheinbar verlängerte QT (eigentlich QU).',v==='schwer'?'Schwer: U-Welle größer als T, VES – Gefahr von Torsade/VF.':'','Erbrechen/Durchfall, Diuretika, Alkohol.');}},
perikarditis:{g:'Elektrolyte & Sonstiges',n:'Perikarditis',v:{s1:'Stadium 1 (ST-Hebung, PQ-Senkung)',s3:'Stadium 3 (T-Negativierung)'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(18,55));P.hr=U(88,118);
  if(v==='s1'){M.st.push({a:U(.15,.26),v:nrm([.55,.65,.45]),w:.016});M.prDep=U(.05,.09);M.stAuto=true;c.verdict='Abnormales EKG – Perikarditis/Infarkt möglich';}
  else{M.tExtra.push({a:U(.3,.45),v:nrm([-.55,-.65,-.45]),sym:true});P.hr=U(70,100);c.dev.push('Diffuse T-Negativierung');c.verdict='Abnormales EKG';}
  c.teach.push(v==='s1'?'<b>Akute Perikarditis (Stadium 1)</b>: diffuse konkave ST-Hebung (I, II, aVF, V2–V6), PQ-Senkung, PQ-Hebung + ST-Senkung in aVR, keine Spiegelbilder.':'<b>Perikarditis Stadium 3</b> (nach 1–3 Wochen): ST normalisiert, diffuse T-Negativierung.',
    'Oft junge Patienten nach Infekt, atemabhängiger Schmerz, Besserung im Sitzen.');}},
tamponade:{g:'Elektrolyte & Sonstiges',n:'Perikarderguss / Tamponade',v:{alt:'Mit elektrischem Alternans',nv:'Nur Niedervoltage'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(35,85));P.hr=U(108,135);P.ampS=U(.4,.55);M.tAmp*=.6;M.alternans=v==='alt'?U(.3,.4):0;M.resp=U(.01,.03);c.noise.tremor=U(.003,.012);
  c.dev.push('Niedervoltage');if(v==='alt')c.dev.push('Elektrischer Alternans');c.verdict='Abnormales EKG';
  c.teach.push('<b>Großer Perikarderguss / Tamponade</b>: Sinustachykardie, Niedervoltage'+(v==='alt'?', elektrischer Alternans (QRS-Amplitude wechselt von Schlag zu Schlag – „schwingendes Herz“)':'')+'.','Beck-Trias: Hypotonie, gestaute Halsvenen, leise Herztöne.');}},
le:{g:'Elektrolyte & Sonstiges',n:'Lungenembolie',v:{tachy:'Nur Sinustachykardie',rv:'Rechtsherzbelastung (SIQIIITIII)',massiv:'Massiv (RSB, Rechtstyp)'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(25,85));P.hr=v==='massiv'?U(118,140):U(102,128);
  if(v!=='tachy'){P.rotFr=v==='massiv'?U(60,80):U(35,60);M.qAdd.push({t:.08,s:.012,a:.35,v:[-.8,-.1,.4]},{t:.015,s:.007,a:.16,v:[.5,-.86,0]});M.tExtra.push({a:v==='massiv'?U(.28,.4):U(.18,.3),v:nrm([.4,-.6,-.8])});c.dev.push('SI/QIII-Typ','T-Negativierung III, V1–V3');}
  if(v==='massiv'){M.morph='rbbb';c.dev.push('Rechtsschenkelblock');}
  c.verdict=v==='tachy'?'Grenzwertiges EKG':'Abnormales EKG';
  c.teach.push({tachy:'<b>Lungenembolie mit unauffälligem EKG</b>: häufigstes Zeichen ist nur die Sinustachykardie – ein normales EKG schließt eine LE nicht aus!',
    rv:'<b>Rechtsherzbelastung</b>: Sinustachykardie, S<sub>I</sub>Q<sub>III</sub>T<sub>III</sub>, T-Negativierung V1–V3, Rechtsdrehung.',massiv:'<b>Massive LE</b>: neuer RSB, Rechtstyp, S<sub>I</sub>Q<sub>III</sub>T<sub>III</sub>, T-Negativierung V1–V4 – Schockgefahr.'}[v]);}},
longqt:{g:'Elektrolyte & Sonstiges',n:'Long-QT',v:{med:'Medikamentös',lqt2:'Angeboren (gekerbte T)',brady:'Mit Bradykardie'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(16,80));P.hr=v==='brady'?U(40,50):U(55,75);M.QTc=U(.51,.6);M.tS1F=1.3;
  if(v==='lqt2'){M.tExtra.push({a:U(.1,.16),v:[.6,.5,.5],dt:.09});P.age=Math.round(U(14,40));}
  c.dev.push('QT-Verlängerung');c.verdict='Abnormales EKG';
  c.teach.push('<b>Verlängerte QT-Zeit</b> (QTc > 470 ms ♂ / > 480 ms ♀, kritisch > 500 ms).',{med:'Medikamente: Antiarrhythmika, Antipsychotika, Antidepressiva, Makrolide, Methadon, Ondansetron …',lqt2:'Angeborenes LQTS (Typ 2): gekerbte/doppelgipfelige T-Wellen, Trigger: Schreck, Wecker, Lärm.',brady:'Bradykardie verlängert das QT zusätzlich – hohes Torsade-Risiko.'}[v],'Risiko für Torsade de pointes.');}},
brugada:{g:'Elektrolyte & Sonstiges',n:'Brugada-Muster',v:{t1:'Typ 1 (coved)',t2:'Typ 2 (saddleback)'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(18,55));P.sex='m';P.hr=U(55,85);
  if(v==='t1'){M.st.push({a:U(.32,.44),v:nrm([-.72,-.15,.68]),w:.006,early:true});M.qAdd.push({t:.085,s:.012,a:.25,v:nrm([-.5,0,.85])});M.tExtra.push({a:U(.2,.32),v:nrm([.45,0,-.88])});}
  else{M.qAdd.push({t:.088,s:.012,a:.3,v:nrm([-.6,0,.8])});M.st.push({a:U(.1,.16),v:nrm([-.6,-.1,.8]),w:.01});M.tExtra.push({a:U(.08,.14),v:nrm([-.4,0,.9])});}
  c.dev.push(v==='t1'?'ST-Hebung V1/V2 mit RSB-artiger Morphologie – V. a. Brugada-Muster':'Sattelförmige ST-Hebung V2');c.verdict='Abnormales EKG';
  c.teach.push(v==='t1'?'<b>Brugada Typ 1</b>: schulterförmige („coved“) ST-Hebung ≥ 2 mm in V1/V2, übergehend in negative T-Welle – diagnostisch.':'<b>Brugada Typ 2</b>: sattelförmige ST-Hebung V2 mit positivem T – nur verdächtig, Provokationstest nötig.',
    'Synkope, nächtliche Agonie, Fieber als Trigger, plötzlicher Herztod → Abklärung, ggf. ICD.');}},
lvh:{g:'Elektrolyte & Sonstiges',n:'LV-Hypertrophie',v:{strain:'Mit Strain-Muster',ohne:'Nur Spannungskriterien'},setup(c,v){const{U,P,M}=c;P.age=Math.round(U(55,90));P.hr=U(60,90);M.qScale=[1,1.15,1.65,1.2];M.D=U(.098,.112);
  if(v==='strain'){M.st.push({a:U(.06,.1),v:nrm([-.85,-.35,.3])});M.tExtra.push({a:U(.3,.45),v:nrm([-.85,-.35,.25])});}
  c.dev.push(v==='strain'?'Linksventrikuläre Hypertrophie mit Erregungsrückbildungsstörung':'Hohe QRS-Amplituden – V. a. linksventrikuläre Hypertrophie');c.verdict='Abnormales EKG';
  c.teach.push('<b>LV-Hypertrophie</b>: Sokolow-Lyon (S V1 + R V5/V6) ≥ 3,5 mV'+(v==='strain'?', Strain-Muster: deszendierende ST-Senkung mit asymmetrisch negativem T in I, aVL, V5, V6.':'.'),'Hypertonie, Aortenstenose. Kann Ischämie vortäuschen/maskieren.');}},
hypothermie:{g:'Elektrolyte & Sonstiges',n:'Hypothermie',v:{leicht:'Leicht (32–35 °C)',maessig:'Mäßig (28–32 °C)',schwer:'Schwer (< 28 °C)'},setup(c,v){const{U,P,M,noise}=c;P.age=Math.round(U(30,90));
  if(v==='leicht'){P.hr=U(60,95);M.jWave={a:U(.08,.15),v:nrm([.55,.6,.45]),osborn:true};noise.shiver=U(.06,.12);M.QTc=U(.45,.5);}
  else if(v==='maessig'){P.hr=U(34,50);M.QTc=U(.48,.56);M.PR=U(.21,.27);M.D=U(.1,.12);M.jWave={a:U(.45,.7),v:nrm([.55,.6,.45]),osborn:true};if(c.chance(.5))noise.shiver=U(.03,.06);}
  else{M.rh={type:'af'};M.fAmp=U(.01,.03);M.fFreq=U(4,5.5);P.hr=U(24,38);M.QTc=U(.52,.6);M.D=U(.12,.14);M.jWave={a:U(.6,.9),v:nrm([.55,.6,.45]),osborn:true};noise.tremor=U(.002,.006);}
  c.dev.push(...(v==='leicht'?['Artefakte (Muskelzittern)']:[]),'J-Wellen (Osborn)','QT-Verlängerung');c.verdict='Abnormales EKG';
  c.teach.push({leicht:'<b>Leichte Hypothermie</b>: Kältezittern-Artefakte, oft Tachykardie, kleine J-Wellen.',maessig:'<b>Mäßige Hypothermie</b>: Bradykardie, deutliche Osborn-Wellen, PQ/QRS/QT verlängert.',
    schwer:'<b>Schwere Hypothermie</b>: langsames Vorhofflimmern, große Osborn-Wellen, breiter QRS, kein Zittern mehr – hohe Flimmerbereitschaft, schonende Rettung.'}[v]);}},
digitalis:{g:'Elektrolyte & Sonstiges',n:'Digitalis',v:{effekt:'Digitalis-Effekt',intox:'Digitalis-Intoxikation'},setup(c,v){const{U,chance,P,M}=c;P.age=Math.round(U(65,92));
  M.QTc=U(.34,.37);M.tAmp*=.45;M.sag={a:U(.1,.18),v:nrm([-.8,-.45,-.2])};
  if(v==='effekt'){if(chance(.55)){M.rh={type:'af'};M.fAmp=U(.015,.04);M.fFreq=U(5,7);P.hr=U(55,80);}else P.hr=U(55,75);c.dev.push('Muldenförmige ST-Senkung – Digitalis-Effekt?');}
  else{P.hr=U(58,80);M.rh={type:'sinus',av:'wenck',ratio:c.pick([3,4])};M.PR=U(.2,.26);M.pvc={every:2};c.dev.push('AV-Block II° Typ Wenckebach','Ventrikulärer Bigeminus','Muldenförmige ST-Senkung');}
  c.verdict='Abnormales EKG';
  c.teach.push(v==='effekt'?'<b>Digitalis-Effekt</b>: muldenförmige („Salvador-Dalí-Schnurrbart“) ST-Senkung, flache T, kurze QT. Effekt ≠ Intoxikation.':'<b>Digitalis-Intoxikation</b>: AV-Blockierung + ventrikuläre Extrasystolie (Bigeminus) – klassisch auch atriale Tachykardie mit Block, bidirektionale VT.',
    'Klinik: Übelkeit, Gelb-Grün-Sehen, Verwirrtheit; Hypokaliämie verstärkt die Toxizität.');}},
};

/* ======================= GENERATOR ======================= */
function generateECG(caseId, seed, opt){
  opt=opt||{};const C=CASES[caseId];if(!C)throw new Error('Unbekannter Befund: '+caseId);
  const fs=500, dur=opt.dur||10, N=Math.round(dur*fs);
  const r=rng(seed), sub=salt=>rng((Math.imul(seed,7919)+salt*104729)>>>0), rb=sub(13);
  const {U,chance}=r;
  /* Patient aus der Normalbibliothek + leichte Variation */
  const LIBN=LIB?(Array.isArray(LIB)?LIB:LIB.normal):null, LIBW=(LIB&&!Array.isArray(LIB))?LIB:{};
  const pr_=sub(91), lib=(LIBN&&LIBN.length)?LIBN:[DEFAULT_PAT], pat0=lib[Math.floor(pr_.R()*lib.length)];
  const jf=pr_.U(-7,7),jh=pr_.U(-7,7),ja=pr_.U(.9,1.1), jit=v=>mul(rotH(rotF(v,jf),jh),ja);
  const pat={pr:pat0.pr,d:pat0.d,
    p:pat0.p.map(c=>{const k=pr_.U(.85,1.15);return {t:c[0],s:c[1],l:c.slice(2).map(x=>x*k)};}),
    q:pat0.q.map(c=>({t:c[0]+pr_.G()*.0008,s:c[1]*pr_.U(.94,1.06),v:mul(jit([c[2],c[3],c[4]]),1+pr_.G()*.05)})),
    t:jit(pat0.t)};
  const patAxis=frontAxis(pat.q.reduce((a,c)=>add(a,mul(c.v,c.s)),[0,0,0]));
  const tMag=Math.hypot(pat.t[0],pat.t[1],pat.t[2])||.3;
  const P={sex:chance(.55)?'m':'w',age:50,hr:U(60,95),rotFr:null,rotHo:0,ampS:1};
  const M={morph:'normal',PR:clamp(pat.pr+pr_.G()*.006,.12,.2),D:null,QTc:U(.39,.445),tAmp:tMag,tVec:mul(pat.t,1/tMag),tS1F:1,tS2F:1,
    pAmp:1,st:[],tExtra:[],qAdd:[],qScale:null,rsr:false,u:0,jWave:null,delta:null,retroP:false,prDep:0,alternans:0,
    qWide:1,stDip:null,sag:null,swap:null,sgCheck:false,ventW:1,pDrop:null,lbbbIsch:null,resp:U(.02,.07),rh:{type:'sinus'},pvc:null,tdp:null,stAuto:false,
    pvcV:nrm(r.pick(VENT_ORIGINS)),vtV:null,escV:nrm(r.pick(VENT_ORIGINS)),fAmp:0,fFreq:6,flAmp:.2,vfAmp:.4};
  const noise={wander:U(.02,.12),tremor:U(.004,.025),bad:chance(.4)?Math.floor(U(0,9)):-1,mains:chance(.15)?U(.004,.012):0,shiver:0};
  const c={...r,P,M,noise,f:{},dev:[],teach:[],verdict:''};
  const vkeys=C.v?Object.keys(C.v):[];let vk=vkeys.length?r.pick(vkeys):null;if(opt.variant&&vkeys.includes(opt.variant))vk=opt.variant;
  C.setup(c,vk);
  if(!M.vtV)M.vtV=nrm(r.pick(VENT_ORIGINS));
  if(opt.clean){noise.wander=0;noise.tremor=0;noise.bad=-1;noise.mains=0;noise.shiver=0;}
  /* rotFr (Vorgabe des Befunds) ist relativ zu einer Grundachse von +36°; ohne Vorgabe behält der Patient seine eigene Achse */
  const rotN=P.rotFr==null?0:(36+P.rotFr-patAxis), rotFr=P.rotFr==null?r.U(-30,35):P.rotFr, rotHo=P.rotHo, ampS=P.ampS;
  const pDir=nrm([.5,.8,.1]);

  /* ---- Brustwand: Dower-Matrix mit kleiner Streuung der Elektrodenlage ---- */
  const gv=[0,1,2,3,4,5].map(()=>U(.93,1.07));
  const pre=gv.map((g,j)=>mul(DW['V'+(j+1)],g));

  const project=v=>{let I=dot(DW.I,v),II=dot(DW.II,v);if(M.swap==='ra_la'){const III=II-I;I=-I;II=III;}else if(M.swap==='la_ll'){const t=I;I=II;II=t;}
    const o={I,II,III:II-I,aVR:-(I+II)/2,aVL:I-II/2,aVF:II-I/2};for(let j=0;j<6;j++)o['V'+(j+1)]=dot(pre[j],v);return o;};

  /* ---- Morphologien ---- */
  const morphs={};
  function rotAll(comps,k){return comps.map(c=>({...c,a:c.a*ampS,v:rotH(rotF(c.v,rotFr*k),rotHo*k)}));}
  function buildMorph(kind){
    let comps,D,tVec,tAmp,s1F=M.tS1F,s2F=M.tS2F,st=M.st,tExtra=M.tExtra,u=M.u,extra=[],tg=null,tgPk=0,qtEnd=0;
    if((kind==='lbbb'||kind==='rbbb')&&LIBW[kind]&&LIBW[kind].length){
      /* Schenkelblock-Form aus echten Medianschlägen (PTB-XL+) */
      const axOf=w=>frontAxis(w.q.reduce((a,c)=>(kind==='rbbb'&&c[0]>.075)?a:add(a,mul(c.slice(2),c[1])),[0,0,0]));
      let w0=null,ax0=0;for(let k=0;k<12;k++){const wr=sub((kind==='lbbb'?92:93)+(M.libPick||0)*7+k*13);w0=LIBW[kind][Math.floor(wr.R()*LIBW[kind].length)];ax0=axOf(w0);if(kind==='lbbb'||(ax0>-25&&ax0<95))break;}
      const rot=(kind==='rbbb'&&P.rotFr!=null)?(36+P.rotFr-ax0):0;
      const J=v=>mul(rotF(rotH(rotF(v,jf),jh),rot),ja*ampS);
      comps=w0.q.map(c=>({t:c[0],s:c[1],a:1,v:J(c.slice(2))}));D=w0.d;
      tg=w0.tg.map(c=>({t:c[0],s:c[1],v:J(c.slice(2))}));
      {let best=0;for(let tt=D;tt<D+.5;tt+=.004){let v=[0,0,0];for(const c of tg){const d=tt-c.t;v=add(v,mul(c.v,Math.exp(-d*d/(2*c.s*c.s))));}const m=Math.hypot(v[0],v[1],v[2]);if(m>best){best=m;tgPk=tt;}}}
      qtEnd=Math.max(...tg.map(c=>c.t+1.45*c.s));
      tVec=[0,0,1];tAmp=0;u=0;
      if(kind==='lbbb'){st=[];tExtra=[];if(M.lbbbIsch){st=[{a:M.lbbbIsch.a,v:M.lbbbIsch.v}];tExtra=[{a:M.lbbbIsch.a*.55,v:M.lbbbIsch.v}];}}
      else for(const a of M.qAdd)comps.push({...a,a:a.a*ampS*.6});
    }else if(kind==='normal'||kind==='rbbb'){
      const w=M.qWide, f=(M.D?M.D/pat.d:1)*w, qmap=[0,1,2,2,3];
      let q=pat.q.map((c,i)=>({t:c.t*f,s:c.s*f,a:M.qScale?M.qScale[qmap[i]]:1,v:c.v}));
      D=(M.D||pat.d)*w;
      if(M.rsr){q.push({t:D+.004,s:.009,a:.26,v:rotF([-.55,-.1,.8],-rotN)});D+=.014;}
      if(kind==='rbbb'){q[4].a*=.5;q.push({t:.112,s:.021,a:.85,v:rotF([-.8,.05,.6],-rotN)});D=.135;tExtra=[...tExtra,{a:.16,v:nrm([.5,0,-.75])}];}
      comps=q.map(c=>({...c,a:c.a*ampS,v:rotH(rotF(c.v,rotN),rotHo)}));
      if(M.delta){const dd=.035;comps.forEach(c=>c.t+=dd);comps.push({t:.03,s1:.028,s2:.012,a:M.delta.a*ampS,v:M.delta.v});D+=dd;tExtra=[...tExtra,{a:.12,v:mul(M.delta.v,-1)}];}
      for(const a of M.qAdd)comps.push({...a,a:a.a*ampS*(kind==='rbbb'?.6:1)});
      if(M.jWave)comps.push(M.jWave.osborn?{t:D+.008,s1:.012,s2:.026,a:M.jWave.a,v:rotF(M.jWave.v,rotFr*.5)}:{t:D-.004,s1:.008,s2:.014,a:M.jWave.a,v:rotF(M.jWave.v,rotFr*.5)});
      if(M.retroP)extra.push(M.retroP==='late'?{k:'g',t:D+.075,s1:.018,s2:.018,a:.13,v:[-.15,-.9,.35]}:{k:'g',t:D+.016,s1:.01,s2:.01,a:.09,v:[-.1,-.9,.4]});
      tVec=rotH(rotF(M.tVec,clamp(rotN*.35,-15,20)),rotHo*.5);tAmp=M.tAmp*Math.sqrt(ampS);
    }else if(kind==='lbbb'){
      comps=rotAll([{t:.03,s:.02,a:.9,v:[.5,.3,-.6]},{t:.08,s:.026,a:1.45,v:[.8,.2,-.6]},{t:.125,s:.018,a:.55,v:[.9,0,-.2]}],.5);D=.15;
      tVec=rotF(nrm([-.7,-.15,.55]),rotFr*.5);tAmp=.32;st=[{a:.13,v:rotF(nrm([-.7,-.2,.6]),rotFr*.5)}];tExtra=[];u=0;
      if(M.lbbbIsch){st.push({a:M.lbbbIsch.a,v:M.lbbbIsch.v});tExtra=[{a:M.lbbbIsch.a*.55,v:M.lbbbIsch.v}];}
    }else if(kind==='paced'){
      comps=[{t:.045,s:.026,a:1.15*ampS,v:[.4,-.8,-.5]},{t:.11,s:.026,a:.7*ampS,v:[.6,-.4,-.6]}];D=.16;
      tVec=nrm([-.5,.8,.5]);tAmp=.32;st=[{a:.1,v:nrm([-.45,.75,.5])}];tExtra=[];u=0;
    }else if(kind==='sine'){ // Sinuswellenmuster: QRS und T verschmelzen
      comps=[{t:.1,s:.06,a:.95*ampS,v:rotF(nrm([.75,.5,-.25]),rotFr*.5)},{t:.3,s:.075,a:.75*ampS,v:rotF(nrm([-.65,-.35,.55]),rotFr*.5)}];D=.42;
      tVec=[0,0,1];tAmp=0;st=[];tExtra=[];u=0;
    }else{ // 'pvc','vt','esc'
      const v=kind==='vt'?M.vtV:kind==='esc'?M.escV:(kind.length>3?nrm(VENT_ORIGINS[+kind.slice(3)]):M.pvcV);const w=M.ventW;
      comps=[{t:.045*w,s:.026*w,a:1.3*ampS,v},{t:.11*w,s:.028*w,a:.6*ampS,v:nrm(rotH(rotF(v,50),30))}];D=.17*w;
      tVec=mul(v,-1);tAmp=.4;st=[{a:.11,v:mul(v,-1)}];tExtra=[];u=0;s1F=1.1;s2F=1.1;
    }
    comps=comps.map(c=>({k:'g',t:c.t,s1:c.s1||c.s,s2:c.s2||c.s,a:c.a,v:c.v}));
    return {comps:comps.concat(extra),D,tVec,tAmp,s1F,s2F,st,tExtra,u,tg,tgPk,qtEnd};
  }
  const getM=k=>morphs[k]||(morphs[k]=buildMorph(k));
  const mainKind=M.morph;

  function beatComps(kind,rrPrev,amp,rot){
    const m=getM(kind);const out=[];
    const R=v=>rot?rotF(v,rot):v;
    for(const c of m.comps)out.push({...c,a:c.a*amp,v:R(c.v)});
    const rr=clamp(rrPrev,.3,1.8),QT=M.QTc*Math.sqrt(rr)+Math.max(0,m.D-.1);
    const s2=.034*QT/.4*m.s2F,s1=.062*QT/.4*m.s1F;let tpk=Math.max(QT-2.4*s2,m.D+.11);
    if(m.tg){const k=clamp(Math.sqrt(rr/.8),.72,1.2);tpk=m.D+(m.tgPk-m.D)*k;
      for(const c of m.tg)out.push({k:'g',t:m.D+(c.t-m.D)*k,s1:c.s*k,s2:c.s*k,a:amp,v:R(c.v)});}
    else out.push({k:'g',t:tpk,s1,s2,a:m.tAmp*amp,v:R(m.tVec)});
    for(const e of m.tExtra){const ss=e.sym?(s1+s2)/2*(e.sF||1):null;out.push({k:'g',t:tpk+(e.dt||0),s1:ss||s1,s2:ss||s2,a:e.a,v:e.v});}
    for(const s of m.st)out.push({k:'st',J:m.D,tpk:s.early?m.D+.05:tpk,s2:s.early?.03:s2,w:s.w||.007,a:s.a,v:s.v});
    if(kind===mainKind||kind==='normal'){
      if(M.stDip)out.push({k:'g',t:m.D+.012,s1:.008,s2:.06,a:M.stDip.a,v:M.stDip.v});
      if(M.sag)out.push({k:'g',t:m.D+.075,s1:.05,s2:.05,a:M.sag.a,v:M.sag.v});
    }
    if(m.u)out.push({k:'g',t:tpk+2.4*s2+.07,s1:.045,s2:.045,a:m.u,v:nrm([.5,.45,.75])});
    return out;
  }
  function sgMeasure(kind){ // Sgarbossa- und Smith-Kriterien am störungsfreien Schlag nachmessen
    const m=getM(kind),ref=beatComps(kind,60/P.hr,1,0);
    const vecAt=tt=>{let v=[0,0,0];for(const c of ref)v=add(v,mul(c.v,evalComp(c,tt)));return v;};
    const R={},S={},A={};LEADS.forEach(L=>{R[L]=0;S[L]=0;A[L]=0;});
    for(let tt=0;tt<=m.D;tt+=.001){const o=project(vecAt(tt));for(const L of LEADS){R[L]=Math.max(R[L],o[L]);S[L]=Math.min(S[L],o[L]);A[L]+=o[L];}}
    const j=project(vecAt(m.D+.015)),stJ={};LEADS.forEach(L=>stJ[L]=Math.round(j[L]*100)/10);
    const pos=L=>A[L]>0, sg={c1:[],c2:[],c3:[],smith:[],stJ,ratio:{}};
    for(const L of LEADS){const st=stJ[L];
      if(pos(L)&&st>=1)sg.c1.push(L);
      if(['V1','V2','V3'].includes(L)&&!pos(L)&&st<=-1)sg.c2.push(L);
      if(!pos(L)&&st>=5)sg.c3.push(L);
      if(!pos(L)&&st>=1&&S[L]<=-.5){const r=st/Math.abs(S[L]*10);sg.ratio[L]=Math.round(r*100)/100;if(r>=.25)sg.smith.push(L);}}
    sg.score=(sg.c1.length?5:0)+(sg.c2.length?3:0)+(sg.c3.length?2:0);return sg;}
  /* LSB aus der Bibliothek so wählen, dass die Kriterien zur Variante passen */
  if(mainKind==='lbbb'&&M.sgCheck&&LIBW.lbbb&&LIBW.lbbb.length){const want=M.lbbbIsch?(M.sgWant||'any'):null;
    for(let k=0;k<16;k++){M.libPick=k;delete morphs.lbbb;const g=sgMeasure('lbbb');const any=g.c1.length||g.c2.length||g.smith.length;
      const ok=want===null?!any:want==='any'?any:want==='smith'?g.smith.length>0:g[want].length>0;if(ok)break;if(M.lbbbIsch)M.lbbbIsch.a*=1.05;}}
  function evalComp(c,tt){
    if(c.k==='g'){const d=tt-c.t,s=d<0?c.s1:c.s2;if(d*d>36*s*s)return 0;return c.a*Math.exp(-d*d/(2*s*s));}
    if(tt<c.J-.05)return 0;if(tt<c.tpk)return c.a/(1+Math.exp(-(tt-c.J)/c.w));
    const d=tt-c.tpk;return c.a*Math.exp(-d*d/(2*c.s2*c.s2));
  }

  /* ---- Rhythmus: Vorhof- und Kammerereignisse ---- */
  const {U:BU,G:BG,pick:Bpick}=rb;
  const RR0=60/P.hr, pEv=[], qEv=[]; const T0=-2, T1=dur+1;
  const rh=M.rh;
  let sCount=0;function sinusP(hr,resp){const sr=sub(50+(sCount++));const out=[];const RR=60/hr,Tr=sr.U(3.5,5.5),ph=sr.U(0,6.28);let t=T0+sr.U(0,RR);
    while(t<T1){out.push(t);t+=RR*(1+resp*Math.sin(2*Math.PI*t/Tr+ph))+sr.G()*.006;}return out;}
  const sEv=[];
  if(rh.type==='sinus'||rh.type==='av3'){
    let ps=rh.under==='af'?[]:sinusP(P.hr,M.resp);
    const escapes=[];
    if(M.pDrop){const d=M.pDrop;
      if(d.type==='sab'){let nxt=d.first;ps=ps.filter(t=>{if(t>=nxt&&BU(0,1)<d.p*3){nxt=t+BU(1.5,4);return false;}return true;});}
      else{let at=d.first;const keep=[];const eps=[];while(at<T1){const len=BU(d.len[0],d.len[1]);eps.push([at,at+len]);at+=len+BU(d.gap[0],d.gap[1]);}
        for(const t of ps)if(!eps.some(([a,b])=>t>a&&t<b))keep.push(t);ps=keep;
        for(const [a,b] of eps){const prev=ps.filter(t=>t<=a).pop();if(prev==null)continue;const esc=prev+M.PR+BU(1.7,2.2);const next=ps.find(t=>t>a);
          if(next==null||esc<next+M.PR-.25)escapes.push(esc);}}}
    if(rh.type==='av3'){ps.forEach(t=>pEv.push({t}));
      const RRe=60/rh.esc;let t=T0+BU(0,RRe);while(t<T1){qEv.push({t,kind:rh.escKind==='esc'?'esc':mainKind});t+=RRe*(1+BG()*.01);} }
    else{
      let k=0,nextPvc=M.pvc&&M.pvc.first!=null?M.pvc.first:Infinity,lastNormal=false,lastRR=RR0,normCount=0;
      for(let i=0;i<ps.length;i++){const p=ps[i];const pe={t:p};pEv.push(pe);
        let pr=M.PR,conducted=true;
        if(rh.av==='wenck'){const pos=k%rh.ratio;if(pos===rh.ratio-1)conducted=false;else{pr=M.PR;for(let j=0;j<pos;j++)pr+=.12/Math.pow(1.9,j);}k++;}
        else if(rh.av==='mobitz'){const pos=k%rh.ratio;if(pos===rh.ratio-1)conducted=false;k++;}
        else if(rh.av==='high'){const pos=k%rh.ratio;if(pos!==0)conducted=false;k++;}
        if(!conducted){pe.blk='av';lastNormal=false;continue;}
        const qt=p+pr;
        const pv=M.pvc;
        if(pv&&lastNormal&&i>0&&(pv.every?normCount>=pv.every-1:qt>=nextPvc)){
          const prevQ=qEv[qEv.length-1].t;const kind=()=>pv.multi?'pvc'+Math.floor(BU(0,VENT_ORIGINS.length)):'pvc';
          const t1=prevQ+(pv.early?BU(.34,.4):BU(.5,.66))*lastRR;qEv.push({t:t1,kind:kind()});
          if(pv.couplet)qEv.push({t:t1+BU(.36,.46),kind:pv.multi?kind():'pvc'});
          lastNormal=false;normCount=0;
          if(!pv.every)nextPvc=qt+BU(pv.gap[0],pv.gap[1]);pe.blk='refr';continue;}
        if(qEv.length)lastRR=qt-qEv[qEv.length-1].t;
        qEv.push({t:qt,kind:mainKind});pe.q=qt;lastNormal=true;normCount++;
      }
      for(const e of escapes)qEv.push({t:e,kind:mainKind});
      qEv.sort((a,b)=>a.t-b.t);
      if(M.tdp){ // Torsade-Episoden ersetzen die Sinusschläge
        let e=M.tdp.first;const eps=[];while(e<T1){const len=BU(M.tdp.len[0],M.tdp.len[1]);eps.push([e,e+len]);e+=len+BU(M.tdp.gap[0],M.tdp.gap[1]);}
        for(const [a,b] of eps){
          for(let i=qEv.length-1;i>=0;i--)if(qEv[i].t>a-.25&&qEv[i].t<b+.9)qEv.splice(i,1);
          const prev=qEv.filter(q=>q.t<=a-.25).pop();const start=prev?prev.t+BU(.42,.5):a;
          const tw=BU(1.4,2.2),ph=BU(0,360);let t=start;
          while(t<b){const x=(t-start)/tw;qEv.push({t,kind:'vt',rot:ph+360*x,amp:.45+.75*Math.abs(Math.sin(Math.PI*x)),tdp:true});t+=60/BU(210,260);}
        }
        qEv.sort((a,b)=>a.t-b.t);
      }
    }
  }else if(rh.type==='af'){const irr=rh.irr||.2,minRR=rh.minRR||.3;let t=T0+BU(0,RR0);while(t<T1){qEv.push({t,kind:mainKind});t+=Math.max(minRR,RR0*Math.exp(irr*BG()));}}
  else if(rh.type==='flutter'){
    const Tf=60/rh.aRate;M.flPh=BU(0,1);let n=0;
    while(true){const step=rh.cond==='var'?Bpick([2,2,3,4,4]):rh.cond;n+=step;const t=T0+n*Tf+.21;if(t>T1)break;qEv.push({t,kind:mainKind});}
    P.hr=rh.aRate/(rh.cond==='var'?3:rh.cond);
  }else if(rh.type==='svt'){const RR=60/P.hr;let t=T0;while(t<T1){qEv.push({t,kind:mainKind});t+=RR*(1+BG()*.004);}}
  else if(rh.type==='junct'){const RR=60/rh.hr;let t=T0+BU(0,RR);while(t<T1){qEv.push({t,kind:mainKind});t+=RR*(1+BG()*.008);}}
  else if(rh.type==='agonal'){let t=T0+BU(0,1);while(t<T1){qEv.push({t,kind:'esc',amp:BU(.55,1.05)});t+=60/rh.hr*BU(.75,1.3);}}
  else if(rh.type==='vt'){const RR=60/rh.hr;let t=T0;while(t<T1){qEv.push({t,kind:'vt'});t+=RR*(1+BG()*.006);}
    if(rh.dissoc)sinusP(P.hr,.02).forEach(t=>pEv.push({t}));}
  else if(rh.type==='paced'){const RR=60/rh.rate;let t=T0+BU(0,RR);const mode=rh.mode||'VVI';
    if(mode==='VVI'){while(t<T1){sEv.push(t-.004);qEv.push({t,kind:'paced'});t+=RR;}if(rh.under==='sinus')sinusP(P.hr,.03).forEach(t=>pEv.push({t}));}
    else if(mode==='DDD'){while(t<T1){sEv.push(t);pEv.push({t:t+.01});sEv.push(t+rh.av-.004);qEv.push({t:t+rh.av,kind:'paced'});t+=RR;}}
    else if(mode==='AAI'){while(t<T1){sEv.push(t);pEv.push({t:t+.01,q:t+M.PR});qEv.push({t:t+M.PR,kind:mainKind});t+=RR;}}
    else if(mode==='LOC'){M.fAmp=M.fAmp||.03;rh.under='af';while(t<T1){sEv.push(t-.004);if(BU(0,1)<rh.cap)qEv.push({t,kind:'paced'});t+=RR;}}
    else if(mode==='US'){const ps=sinusP(P.hr,.03);const nat=ps.map(p=>p+M.PR);ps.forEach(p=>pEv.push({t:p}));const paced=[];
      while(t<T1){sEv.push(t-.004);if(!nat.some(n=>t-n>-.06&&t-n<.36))paced.push(t);t+=RR;}
      for(const n of nat)if(!paced.some(pt=>n-pt>-.06&&n-pt<.4))qEv.push({t:n,kind:mainKind});paced.forEach(pt=>qEv.push({t:pt,kind:'paced'}));qEv.sort((a,b)=>a.t-b.t);}}
  else if(rh.type==='asys'){if(rh.p)sinusP(P.hr,.02).forEach(t=>pEv.push({t}));}
  // P-Zeiten: bei Überleitung P = QRS - PR (pEv enthält P-Beginn)
  let lastQ=null;const ra=sub(77);
  for(let i=0;i<qEv.length;i++){const q=qEv[i];q.rrPrev=lastQ===null?RR0:q.t-lastQ;lastQ=q.t;
    q.amp=(q.amp||1)*(1+ra.G()*.02)*(M.alternans?(i%2?1-M.alternans:1+M.alternans*.6):1);if(M.alternans)q.rot=(i%2?-9:6);}

  /* ---- Synthese des Herzvektors ---- */
  const X=new Float32Array(N),Y=new Float32Array(N),Z=new Float32Array(N);
  const respA=U(.03,.08),respT=U(3.5,5.5),respP=U(0,6.28);
  const sh=(i0,i1,comps,t0)=>{for(let i=Math.max(0,i0);i<=Math.min(N-1,i1);i++){const tt=i/fs-t0;let x=0,y=0,z=0;
    for(const c of comps){const g=evalComp(c,tt);if(g!==0){x+=g*c.v[0];y+=g*c.v[1];z+=g*c.v[2];}}X[i]+=x;Y[i]+=y;Z[i]+=z;}};
  /* P-Welle je Ableitung (I, II, V1..V6) aus der Bibliothek; Vorhöfe folgen dem Kammer-Dipolmodell schlecht */
  const PA=DWK.map(()=>new Float32Array(N));
  const pComps=M.prDep?[{k:'g',t:M.PR-.045,s1:.035,s2:.012,a:M.prDep,v:mul(pDir,-1)}]:[];
  for(const p of pEv){const i0=Math.max(0,Math.floor((p.t-.03)*fs)),i1=Math.min(N-1,Math.ceil((p.t+.2)*fs));
    for(const c of pat.p)for(let i=i0;i<=i1;i++){const d=i/fs-p.t-c.t;const g=M.pAmp*Math.exp(-d*d/(2*c.s*c.s));if(g>1e-5)for(let j=0;j<8;j++)PA[j][i]+=g*c.l[j];}
    if(pComps.length)sh(Math.floor((p.t-.02)*fs),Math.ceil((p.t+.3)*fs),pComps,p.t);}
  for(const q of qEv){const amp=q.amp*(1+respA*Math.sin(2*Math.PI*q.t/respT+respP));
    sh(Math.floor((q.t-.1)*fs),Math.ceil((q.t+.95)*fs),beatComps(q.kind,q.rrPrev,amp,q.rot||0),q.t);}
  // Pseudo-P bei Sinus-QRS: P vor QRS (Sinus) – Zuordnung erfolgte über p+PR, pEv bereits synthetisiert.
  if(rh.type==='af'||rh.under==='af'){const f1=M.fFreq,f2=f1*1.37,f3=f1*.83,p1=U(0,6.28),p2=U(0,6.28),p3=U(0,6.28),pm=U(0,6.28);const va=[.15,.55,.8],vb=[.6,.2,-.3];
    for(let i=0;i<N;i++){const t=i/fs;const env=.6+.4*Math.sin(2*Math.PI*.27*t+pm);
      const a=M.fAmp*env*(Math.sin(2*Math.PI*f1*t+p1+.8*Math.sin(2*Math.PI*.5*t))+.4*Math.sin(2*Math.PI*f3*t+p3));
      const b=M.fAmp*.6*Math.sin(2*Math.PI*f2*t+p2+.6*Math.sin(2*Math.PI*.4*t));
      X[i]+=a*va[0]+b*vb[0];Y[i]+=a*va[1]+b*vb[1];Z[i]+=a*va[2]+b*vb[2];}}
  {const sv=nrm([-.3,.75,.6]);for(const st of sEv){const i=Math.round(st*fs);if(i>=0&&i<N){X[i]+=1.3*sv[0];Y[i]+=1.3*sv[1];Z[i]+=1.3*sv[2];if(i+1<N){X[i+1]-=.25*sv[0];Y[i+1]-=.25*sv[1];Z[i+1]-=.25*sv[2];}}}}
  if(rh.type==='flutter'){const Tf=60/rh.aRate,v=nrm([.1,1,-.45]);let lp=0;const al=.5;
    for(let i=0;i<N;i++){const t=i/fs;let ph=((t-T0)/Tf+M.flPh)%1;const w=ph<.68?.5-ph/.68:-.5+(ph-.68)/.32;lp+=al*(w-lp);
      const a=-M.flAmp*lp*2;X[i]+=a*v[0];Y[i]+=a*v[1];Z[i]+=a*v[2];}}
  if(rh.type==='vf'){const comps=[];for(let ax=0;ax<3;ax++)for(let k=0;k<4;k++)comps.push({ax,f:U(3.2,6.8),ph:U(0,6.28),a:U(.4,1),fm:U(.2,.5),fp:U(0,6.28)});
    const ep=U(0,6.28),phs=comps.map(c=>c.ph);
    for(let i=0;i<N;i++){const t=i/fs;const env=M.vfAmp*(.55+.45*Math.sin(2*Math.PI*.17*t+ep))*.5;const o=[0,0,0];
      comps.forEach((c,j)=>{phs[j]+=2*Math.PI*(c.f+.8*Math.sin(2*Math.PI*c.fm*t+c.fp))/fs;o[c.ax]+=c.a*Math.sin(phs[j]);});
      X[i]+=env*o[0]*1.5;Y[i]+=env*o[1]*1.4;Z[i]+=env*o[2]*.75;}}

  /* ---- Störungen je Elektrode (eigene Zufallsquelle je Elektrode) ---- */
  const lpA=fc=>{const dt=1/fs,rc=1/(2*Math.PI*fc);return dt/(rc+dt);};
  const E=[];
  for(let k=0;k<9;k++){const er=rng((seed^Math.imul(0x9E3779B1,k+1))>>>0);const out=new Float32Array(N);
    const bad=k===noise.bad,limb=k<3;const wA=noise.wander*(bad?3:1)*er.U(.5,1.2);
    const fa=er.U(.12,.35),fb=er.U(.3,.6),pa=er.U(0,6.28),pb=er.U(0,6.28),pe=er.U(0,6.28),fe=er.U(.15,.4);
    const tA=noise.tremor*(limb?1:.45)*(bad?2:1)*er.U(.6,1.3)*2.6, sA=noise.shiver*(limb?1:.5)*er.U(.6,1.2)*3.2;
    let l1=0,l2=0,s1=0,s2=0;const a1=lpA(70),a2=lpA(18),b1=lpA(12),b2=lpA(4);
    for(let i=0;i<N;i++){const t=i/fs;const w=er.G();l1+=a1*(w-l1);l2+=a2*(w-l2);
      let v=wA*(Math.sin(2*Math.PI*fa*t+pa)+.5*Math.sin(2*Math.PI*fb*t+pb))+tA*(l1-l2)*(.45+.55*Math.abs(Math.sin(2*Math.PI*fe*t+pe)));
      if(sA){const w2=er.G();s1+=b1*(w2-s1);s2+=b2*(w2-s2);v+=sA*(s1-s2);}
      if(noise.mains)v+=noise.mains*(limb?1:.5)*Math.sin(2*Math.PI*50*t);out[i]=v;}
    E.push(out);}

  const leads={};for(const L of LEADS)leads[L]=new Float32Array(N);
  for(let i=0;i<N;i++){const x=X[i],y=Y[i],z=Z[i];let ra=E[0][i],la=E[1][i]+PA[0][i]+DW.I[0]*x+DW.I[1]*y+DW.I[2]*z,ll=E[2][i]+PA[1][i]+DW.II[0]*x+DW.II[1]*y+DW.II[2]*z;
    if(M.swap==='ra_la'){const t=ra;ra=la;la=t;}else if(M.swap==='la_ll'){const t=la;la=ll;ll=t;}
    const I=la-ra,II=ll-ra;
    leads.I[i]=I;leads.II[i]=II;leads.III[i]=II-I;leads.aVR[i]=-(I+II)/2;leads.aVL[i]=I-II/2;leads.aVF[i]=II-I/2;
    const wct=(E[0][i]+E[1][i]+E[2][i])/3;for(let j=0;j<6;j++)leads['V'+(j+1)][i]=pre[j][0]*x+pre[j][1]*y+pre[j][2]*z+gv[j]*PA[2+j][i]+E[3+j][i]-wct;}

  /* ---- Vermessung ---- */
  const hasQRS=qEv.length>0&&rh.type!=='vf'&&rh.type!=='agonal';
  const refKind=rh.type==='vt'?'vt':(rh.type==='paced'&&!['AAI','US'].includes(rh.mode))?'paced':(rh.type==='av3'&&rh.escKind==='esc')?'esc':mainKind;
  const kindIsNarrow=k=>k==='normal'||k==='rbbb';
  let stmm=null,axQRS=null,axT=null,mD=null;
  if(hasQRS){const m=getM(refKind);mD=m.D;const ref=beatComps(refKind,RR0,1,0);
    const vecAt=tt=>{let v=[0,0,0];for(const c of ref)v=add(v,mul(c.v,evalComp(c,tt)));return v;};
    const sv=project(vecAt(m.D+.06));stmm={};for(const L of LEADS)stmm[L]=Math.round(sv[L]*100)/10;
    const net=m.comps.reduce((s,c)=>(c.s1<.002||(c.t>(refKind==='rbbb'?.075:.1)&&kindIsNarrow(refKind)))?s:add(s,mul(c.v,c.a*(c.s1+c.s2)/2)),[0,0,0]);{const o=project(net);axQRS=Math.round(deg(Math.atan2(o.aVF/.866,o.I)));}
    {const o=project(m.tg?vecAt(m.D+(m.tgPk-m.D)*clamp(Math.sqrt(RR0/.8),.72,1.2)):m.tVec);axT=Math.round(deg(Math.atan2(o.aVF/.866,o.I)));}
    if(M.sgCheck)M.sgRes=sgMeasure(refKind);}
  const visQ=qEv.filter(q=>q.t>=0&&q.t<Math.min(dur,10));
  let hr=null;if(visQ.length>1)hr=Math.round(60*(visQ.length-1)/(visQ[visQ.length-1].t-visQ[0].t));
  const oneToOne=rh.type==='sinus'&&!rh.av;
  const rrM=hr?60/hr:RR0;let qt=null,qtc=null;
  if(hasQRS&&!['vt','af','flutter'].includes(rh.type)&&!M.tdp){qt=Math.round(M.QTc*Math.sqrt(clamp(rrM,.3,1.8))*1000);qtc=Math.round(qt/Math.sqrt(rrM));}
  else if(M.tdp){qt=Math.round(M.QTc*Math.sqrt(RR0)*1000);qtc=Math.round(M.QTc*1000);}
  else if(hasQRS&&(rh.type==='af'||rh.type==='flutter')){qt=Math.round(M.QTc*Math.sqrt(clamp(rrM,.3,1.8))*1000);qtc=Math.round(qt/Math.sqrt(rrM));}
  if(qt!=null&&mD){const mm=getM(refKind);
    if(mm.tg){const k=clamp(Math.sqrt(rrM/.8),.72,1.2);qt=Math.round((mm.D+(mm.qtEnd-mm.D)*k)*1000);}else qt+=Math.round(Math.max(0,mD-.1)*1000);
    qtc=M.tdp?qtc:Math.round(qt/Math.sqrt(clamp(rrM,.3,1.8)));}
  if(mainKind==='sine'){qt=null;qtc=null;}
  const pnp=(()=>{let I=0,II=0;for(const c of pat.p){I+=c.l[0]*c.s;II+=c.l[1]*c.s;}if(M.swap==='ra_la'){const III=II-I;I=-I;II=III;}else if(M.swap==='la_ll'){const t=I;I=II;II=t;}return {I,aVF:II-I/2};})();
  const meta={caseId,caseName:C.n,group:C.g,variant:vk,variantName:vk?C.v[vk]:null,seed,sex:P.sex==='m'?'männlich':'weiblich',age:P.age,hr,
    pr:oneToOne?Math.round((M.delta?M.PR:M.PR)*1000):null,qrs:mD?Math.round(mD*1000):null,qt,qtc,
    axP:(oneToOne||rh.av)?Math.round(deg(Math.atan2(pnp.aVF/.866,pnp.I))):null,axQRS,axT,lagetyp:axQRS!=null?lagetyp(axQRS):null,st:stmm};

  /* ---- Gerätebefund ---- */
  const dev=[];const H=hr||0;
  const rtxt={sinus:()=>rh.av?'Sinusrhythmus':H<60?'Sinusbradykardie':H>100?'Sinustachykardie':'Sinusrhythmus',
    af:()=>'Vorhofflimmern'+(H>100?' mit schneller Kammerüberleitung':H<60?' mit langsamer Kammerüberleitung':''),
    flutter:()=>'',svt:()=>'',vt:()=>'',vf:()=>'',asys:()=>'',av3:()=>'',junct:()=>'',agonal:()=>'',
    paced:()=>rh.under==='af'&&rh.mode==='VVI'?'Vorhofflimmern':rh.mode==='US'?'Sinusrhythmus':''};
  const rt=rtxt[rh.type]();if(rt)dev.push(rt);
  if(M.tdp)dev[0]='Sinusbradykardie';
  dev.push(...c.dev);
  if(axQRS!=null&&!['vt','paced','vf','asys','agonal'].includes(rh.type)&&!M.tdp&&!(rh.type==='av3'&&rh.escKind==='esc'))dev.push(meta.lagetyp);
  if(M.sgRes){const g=M.sgRes;
    if(g.c1.length)dev.push('Konkordante ST-Hebung '+g.c1.join(', '));
    if(g.c2.length)dev.push('Konkordante ST-Senkung '+g.c2.join(', '));
    if(g.smith.length)dev.push('Exzessiv diskordante ST-Hebung '+g.smith.join(', '));
    if(g.c1.length||g.c2.length||g.smith.length)c.verdict='*** AKUTER INFARKT BEI LSB MÖGLICH ***';
    meta.sgarbossa=g;
    c.teach.push(`<b>Messung (J-Punkt):</b> Sgarbossa-Score ${g.score} (≥ 3 = positiv)`+(g.c1.length?` · konkordante Hebung: ${g.c1.map(L=>L+' '+g.stJ[L].toFixed(1)+' mm').join(', ')}`:'')+(g.c2.length?` · konkordante Senkung: ${g.c2.map(L=>L+' '+g.stJ[L].toFixed(1)+' mm').join(', ')}`:'')+
      (Object.keys(g.ratio).length?` · Smith ST/S: ${Object.entries(g.ratio).map(([L,r])=>L+' '+r.toFixed(2)).join(', ')}`:'')+(g.smith.length?' → Smith positiv':''));}
  if(M.stAuto&&stmm){const up=LEADS.filter(L=>stmm[L]>=(L[0]==='V'?1.5:1)),dn=LEADS.filter(L=>stmm[L]<=-.5);
    if(up.length)dev.push('ST-Hebung '+up.join(', '));if(dn.length)dev.push('ST-Senkung '+dn.join(', '));}
  if(meta.qrs&&meta.qrs>=120&&!['vt','paced','lbbb','rbbb'].includes(rh.type)&&mainKind==='normal'&&!M.delta&&!dev.some(d=>/QRS|Schenkel|Kammer/.test(d))&&!(rh.type==='av3'))dev.push('Verbreiterter QRS-Komplex');
  dev.push(c.verdict);
  meta.device=dev;meta.teach=c.teach.filter(Boolean);
  meta.noise={wander:+noise.wander.toFixed(3),tremor:+noise.tremor.toFixed(3),badElectrode:noise.bad>=0?['RA','LA','LL','V1','V2','V3','V4','V5','V6'][noise.bad]:null,mains:noise.mains>0,shiver:noise.shiver>0};
  meta.rhythm=rh.type;
  meta.model={rhythm:rh.type,av:rh.av||null,ratio:rh.ratio||null,mode:rh.mode||null,under:rh.under||null,morph:mainKind,delta:M.delta?M.delta.v:null,pr:M.PR,d:mD,
    aRate:rh.aRate||null,pvcV:M.pvcV,vtV:M.vtV,escV:M.escV,escKind:rh.escKind||null,tdp:!!M.tdp,retroP:!!M.retroP};
  const inW=e=>e.t>=-.4&&e.t<dur;
  const out={fs,dur,leads,qrs:qEv.filter(q=>q.t>=0&&q.t<dur).map(q=>({t:+q.t.toFixed(3),kind:q.kind})),p:pEv.filter(p=>p.t>=0&&p.t<dur).map(p=>+p.t.toFixed(3)),spikes:sEv.filter(t=>t>=0&&t<dur).map(t=>+t.toFixed(3)),
    atria:pEv.filter(inW).map(p=>({t:+p.t.toFixed(3),q:p.q!=null?+p.q.toFixed(3):null,blk:p.blk||null})),meta};
  if(opt.vector){for(let i=0;i<N;i++){let a=0,b=0,c2=0;for(let j=0;j<8;j++){const v=PA[j][i];if(v!==0){a+=PINV[0][j]*v;b+=PINV[1][j]*v;c2+=PINV[2][j]*v;}}X[i]+=a;Y[i]+=b;Z[i]+=c2;}out.vec={x:X,y:Y,z:Z};}
  return out;
}

const api={generateECG,LEADS,DOWER:DW,version:'2.0',CASES:Object.fromEntries(Object.entries(CASES).map(([k,v])=>[k,{name:v.n,group:v.g,variants:v.v||null}]))};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LeitWerkECG=api;
})(typeof self!=='undefined'?self:this);
