(function(){
const C=window.CFG,$=s=>document.querySelector(s),A=$('#app');
const T={easy:{title:'1-тест: Жеңіл тест',qs:window.EASY},hard:{title:'2-тест: Жағдайлық тест',qs:window.HARD}};
const L=['А','Ә','Б'],P='bzhzk/'+C.ROOM+'/';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const st={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
let role,name,uid,client,run=null,view=null,ans=[],results={},pres={},tab='ctl',open={},flt='easy',timer=null,online=false;

function who(){$('#who').innerHTML=name?'<span class="dot '+(online?'on':'')+'"></span>'+esc(name)+' · '+(role==='t'?'Тренер':'Қызметкер'):''}

/* ---------- Кіру ---------- */
function home(){
  role=null;name=null;who();
  A.innerHTML='<div class="center"><h1>Қош келдіңіз!</h1><p class="sub">Зейнетақы активтерін инвестициялық портфельді басқарушыларға (ИПБ) беру бойынша тренинг</p></div>'+
  '<div class="roles"><button class="role" data-r="w">Қызметкер<small>Тестті тапсыру</small></button><button class="role" data-r="t">Тренер<small>Тестілерді басқару және нәтижелер</small></button></div>';
  A.querySelectorAll('.role').forEach(b=>b.onclick=()=>login(b.dataset.r));
}
function login(r){
  const t=r==='t';
  A.innerHTML='<div class="card narrow"><h2>'+(t?'Тренер ретінде кіру':'Қызметкер ретінде кіру')+'</h2>'+
  '<label class="l">Аты-жөніңіз</label><input type="text" id="nm" maxlength="40" autocomplete="off" value="'+esc(st.get('name_'+r)||'')+'">'+
  (t?'<label class="l">Кіру коды</label><input type="password" id="cd" autocomplete="off">':'')+
  '<div class="err" id="er"></div><button class="btn" id="go">Кіру</button> <button class="btn o" id="bk">Артқа</button></div>';
  const go=()=>{
    const n=$('#nm').value.trim().replace(/\s+/g,' ');
    if(n.length<2)return $('#er').textContent='Аты-жөніңізді енгізіңіз.';
    if(t&&$('#cd').value.trim().toUpperCase()!==String(C.CODE).toUpperCase())return $('#er').textContent='Код дұрыс емес.';
    role=r;name=n;st.set('name_'+r,n);
    uid=st.get('uid')||('u'+Math.random().toString(36).slice(2,10)+Date.now().toString(36));st.set('uid',uid);
    who();start();
  };
  $('#go').onclick=go;$('#bk').onclick=home;
  A.querySelectorAll('input').forEach(i=>i.onkeydown=e=>{if(e.key==='Enter')go()});
  $('#nm').focus();
}

/* ---------- Байланыс ---------- */
function start(){
  if(role==='t'){view='t';renderT();}else wait();
  connect(0);
}
function connect(i){
  if(client){try{client.end(true)}catch(e){}}
  const opts={clientId:'bz_'+Math.random().toString(16).slice(2,10),clean:true,keepalive:20,reconnectPeriod:3000,connectTimeout:8000};
  if(role==='w')opts.will={topic:P+'p/'+uid,payload:'',retain:true,qos:0};
  let c,ok=false;
  try{c=mqtt.connect(C.BROKER[i%C.BROKER.length],opts)}catch(e){return setTimeout(()=>connect(i+1),1500)}
  client=c;
  const fb=setTimeout(()=>{if(!ok&&client===c)connect(i+1)},9000);
  c.on('connect',()=>{
    ok=true;clearTimeout(fb);online=true;who();sched();
    c.subscribe(P+'state',{qos:1});
    if(role==='t'){c.subscribe(P+'p/+',{qos:1});c.subscribe(P+'res/+/+',{qos:1});}
    else pubPres();
  });
  c.on('close',()=>{online=false;who();sched()});
  c.on('error',()=>{});
  c.on('message',(t,m)=>{try{onMsg(t,m.toString())}catch(e){console.error(e)}});
}
function pubPres(){if(client&&role==='w')client.publish(P+'p/'+uid,JSON.stringify({name:name,ts:Date.now()}),{retain:true,qos:0})}
function send(t,o){if(!client||!online){alert('Байланыс жоқ. Интернетті тексеріңіз.');return false}client.publish(P+t,o===''?'':JSON.stringify(o),{retain:true,qos:1});return true}
window.addEventListener('pagehide',()=>{if(client&&role==='w'){try{client.publish(P+'p/'+uid,'',{retain:true})}catch(e){}}});

function onMsg(t,v){
  const p=t.slice(P.length).split('/');
  if(p[0]==='state'){run=v?JSON.parse(v):null;role==='t'?sched():onState(run);return}
  if(role!=='t')return;
  if(p[0]==='p'){v?pres[p[1]]=JSON.parse(v):delete pres[p[1]]}
  else if(p[0]==='res'){const k=p[1]+'/'+p[2];v?results[k]=JSON.parse(v):delete results[k]}
  sched();
}

/* ---------- Қызметкер ---------- */
function wait(msg){
  view=null;
  A.innerHTML='<div class="card center narrow"><div class="pulse"></div><h2>Сәлем, '+esc(name)+'!</h2><p class="sub">'+(msg||'Тренер тестті бастағанша күтіңіз. Тест автоматты түрде ашылады.')+'</p></div>';
}
function onState(s){
  if(!s||!s.runId||s.status==='idle'){if(view!=='done')wait();return}
  const d=st.get('done_'+s.runId);
  if(d){if(view!==s.runId+'d')done(JSON.parse(d));return}
  if(s.status==='stopped'){if(view===s.runId)submit(true);else wait('Тест аяқталды. Келесі тестті күтіңіз.');return}
  if(view!==s.runId)test(s);
}
function test(s){
  view=s.runId;const qs=T[s.test].qs;ans=qs.map(()=>-1);
  let h='<h1>'+T[s.test].title+'</h1><p class="sub">Әр сұраққа бір дұрыс жауапты таңдаңыз.</p><div class="prog"><span id="pc">Жауап берілді: 0 / '+qs.length+'</span><div class="track"><i id="pb" style="width:0"></i></div></div>';
  qs.forEach((q,i)=>{h+='<div class="q"><p>'+(i+1)+'. '+esc(q.q)+'</p>'+q.o.map((o,j)=>'<label class="opt"><input type="radio" name="q'+i+'" value="'+j+'"><span><b>'+L[j]+')</b> '+esc(o)+'</span></label>').join('')+'</div>'});
  A.innerHTML=h+'<div class="err" id="er"></div><button class="btn y" id="sb">Жауаптарды жіберу</button>';
  window.scrollTo(0,0);
  A.onchange=e=>{
    const m=/^q(\d+)$/.exec(e.target.name||'');if(!m)return;
    ans[+m[1]]=+e.target.value;const n=ans.filter(x=>x>=0).length;
    $('#pc').textContent='Жауап берілді: '+n+' / '+qs.length;$('#pb').style.width=(n/qs.length*100)+'%';
  };
  $('#sb').onclick=()=>submit(false);
}
function submit(auto){
  const s=run,qs=T[s.test].qs;
  if(!auto&&ans.includes(-1)){$('#er').textContent='Барлық сұрақтарға жауап беріңіз.';return}
  if(!auto&&!client)return;
  const score=qs.reduce((n,q,i)=>n+(ans[i]===q.a?1:0),0);
  const r={name:name,uid:uid,test:s.test,runId:s.runId,ans:ans.slice(),score:score,total:qs.length,ts:Date.now()};
  if(!send('res/'+s.runId+'/'+uid,r))return;
  st.set('done_'+s.runId,JSON.stringify(r));done(r);
}
function done(r){
  view=r.runId+'d';A.onchange=null;
  const pc=Math.round(r.score/r.total*100);
  A.innerHTML='<div class="card center narrow"><h2>'+T[r.test].title+'</h2><div class="score">'+r.score+' / '+r.total+'</div><p class="sub">Нәтиже: '+pc+'%</p><h2>Қатысқаныңыз үшін рақмет!</h2><p class="sub">Келесі тестті күтіңіз — ол автоматты түрде ашылады.</p></div>';
  window.scrollTo(0,0);
}

/* ---------- Тренер ---------- */
function sched(){if(role!=='t'||view!=='t')return;clearTimeout(timer);timer=setTimeout(renderT,150)}
const all=()=>Object.values(results);
function renderT(){
  const tabs=[['ctl','Басқару'],['res','Нәтижелер'],['dash','Дашборд']];
  let h='<div class="tabs">'+tabs.map(t=>'<button class="tab '+(tab===t[0]?'on':'')+'" data-t="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>';
  h+=tab==='ctl'?vCtl():tab==='res'?vRes():vDash();
  A.innerHTML=h;
  A.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{tab=b.dataset.t;renderT()});
  A.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>startRun(b.dataset.start));
  A.querySelectorAll('[data-stop]').forEach(b=>b.onclick=stopRun);
  A.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const k=b.dataset.open;open[k]=!open[k];renderT()});
  A.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{flt=b.dataset.f;renderT()});
  const rs=$('#rs');if(rs)rs.onclick=resetAll;const ex=$('#ex');if(ex)ex.onclick=exportCsv;
}
function startRun(t){
  const live=run&&run.status==='running';
  if(live&&!confirm('Қазір тест жүріп жатыр. Оны аяқтап, жаңасын бастау керек пе?'))return;
  send('state',{status:'running',test:t,runId:Date.now().toString(36),ts:Date.now()});
}
function stopRun(){if(run&&confirm('Тестті аяқтау керек пе? Жауап бермегендердің нәтижесі сол қалпында жіберіледі.'))send('state',{status:'stopped',test:run.test,runId:run.runId,ts:Date.now()})}
function resetAll(){
  if(!confirm('Барлық нәтижелерді жою керек пе? Бұл әрекетті қайтару мүмкін емес.'))return;
  Object.keys(results).forEach(k=>send('res/'+k,''));results={};
  send('state',{status:'idle',ts:Date.now()});
}
function vCtl(){
  const live=run&&run.status==='running',n=Object.keys(pres).length;
  const sub=live?all().filter(r=>r.runId===run.runId).length:0;
  let h='<div class="card"><h2>Қазіргі жағдай</h2>';
  h+=live?'<p><span class="tag y">Жүріп жатыр</span> <b>'+T[run.test].title+'</b></p><p>Тестті тапсырғандар: <b>'+sub+'</b> / '+n+'</p><button class="btn r" data-stop="1">Тестті аяқтау</button>':
    '<p><span class="tag">Күтуде</span> Тестті бастау үшін төмендегі батырманы басыңыз.</p>';
  h+='<p class="sub" style="margin:12px 0 0">Желіде қызметкерлер: <b>'+n+'</b></p></div>';
  h+='<div class="grid">'+['easy','hard'].map(k=>'<div class="card"><h2>'+T[k].title+'</h2><p class="sub">'+T[k].qs.length+' сұрақ</p><button class="btn" data-start="'+k+'"'+(!online?' disabled':'')+'>Тестті бастау</button></div>').join('')+'</div>';
  if(Object.keys(pres).length)h+='<div class="card"><h2>Қатысушылар</h2>'+Object.values(pres).map(p=>esc(p.name)).sort().map(x=>'<span class="tag" style="margin:2px">'+x+'</span>').join(' ')+'</div>';
  return h+'<button class="btn o s" id="rs">Барлық нәтижелерді тазалау</button>';
}
const pct=(a,b)=>b?Math.round(a/b*100):0;
function vRes(){
  const rs=all().sort((a,b)=>b.ts-a.ts);
  if(!rs.length)return '<div class="card center"><p class="sub">Нәтижелер әлі жоқ.</p></div>';
  let h='<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="margin:0">Барлық нәтижелер ('+rs.length+')</h2><button class="btn o s" id="ex">CSV жүктеу</button></div><div style="overflow-x:auto"><table><tr><th>Аты-жөні</th><th>Тест</th><th>Балл</th><th>%</th><th>Уақыты</th><th></th></tr>';
  rs.forEach(r=>{
    const k=r.runId+'/'+r.uid;
    h+='<tr><td>'+esc(r.name)+'</td><td>'+(r.test==='easy'?'Жеңіл':'Жағдайлық')+'</td><td><b>'+r.score+'/'+r.total+'</b></td><td>'+pct(r.score,r.total)+'%</td><td>'+new Date(r.ts).toLocaleTimeString('kk-KZ',{hour:'2-digit',minute:'2-digit'})+'</td><td><button class="btn o s" data-open="'+k+'">'+(open[k]?'Жасыру':'Талдау')+'</button></td></tr>';
    if(open[k]){
      const qs=T[r.test].qs;
      h+='<tr><td colspan="6" class="det">'+qs.map((q,i)=>{const a=r.ans[i],okk=a===q.a;
        return '<div><b>'+(i+1)+'.</b> '+esc(q.q)+'<br>'+(okk?'<span class="ok">✓ '+L[a]+') '+esc(q.o[a])+'</span>':'<span class="bad">✗ Таңдалды: '+(a>=0?L[a]+') '+esc(q.o[a]):'жауап жоқ')+'</span><br><span class="ok">Дұрысы: '+L[q.a]+') '+esc(q.o[q.a])+'</span>')+'</div>'}).join('')+'</td></tr>';
    }
  });
  return h+'</table></div></div>';
}
function exportCsv(){
  const q=s=>'"'+String(s).replace(/"/g,'""')+'"';
  const rows=[['Аты-жөні','Тест','Балл','Барлығы','%','Уақыты']].concat(all().sort((a,b)=>a.ts-b.ts).map(r=>[r.name,T[r.test].title,r.score,r.total,pct(r.score,r.total),new Date(r.ts).toLocaleString('kk-KZ')]));
  const b=new Blob(['\ufeff'+rows.map(r=>r.map(q).join(',')).join('\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='natizheler.csv';document.body.appendChild(a);a.click();a.remove();
}
function bar(p,w){return '<div class="tr"><i class="'+(p>=80?'':p>=50?'y':'r')+'" style="width:'+(w===undefined?p:w)+'%"></i></div>'}
function vDash(){
  const rs=all().filter(r=>r.test===flt),qs=T[flt].qs,n=rs.length;
  let h='<div class="tabs">'+['easy','hard'].map(k=>'<button class="tab '+(flt===k?'on':'')+'" data-f="'+k+'">'+T[k].title+'</button>').join('')+'</div>';
  if(!n)return h+'<div class="card center"><p class="sub">Бұл тест бойынша деректер әлі жоқ.</p></div>';
  const tot=qs.length,avg=Math.round(rs.reduce((a,r)=>a+pct(r.score,r.total),0)/n),best=Math.max(...rs.map(r=>r.score)),low=rs.filter(r=>pct(r.score,r.total)<60);
  const qa=qs.map((q,i)=>{const w=[0,0,0,0];let c=0;rs.forEach(r=>{const a=r.ans[i];if(a===q.a)c++;else w[a>=0?a:3]++});return{i:i,c:c,wrong:n-c,w:w}});
  h+='<div class="stats"><div class="stat"><b>'+n+'</b><span>Қатысушылар</span></div><div class="stat"><b>'+avg+'%</b><span>Орташа нәтиже</span></div><div class="stat"><b>'+best+'/'+tot+'</b><span>Ең жоғары балл</span></div><div class="stat"><b>'+low.length+'</b><span>Жұмыс қажет (&lt;60%)</span></div></div>';
  h+='<div class="card"><h2>Сұрақтар бойынша дұрыс жауап үлесі</h2>'+qa.map(x=>{const p=pct(x.c,n);return '<div class="bar"><em>№'+(x.i+1)+'</em>'+bar(p)+'<b>'+p+'%</b></div>'}).join('')+'</div>';
  const top=qa.filter(x=>x.wrong>0).sort((a,b)=>b.wrong-a.wrong).slice(0,5);
  h+='<div class="card"><h2>Жиі қателесетін сұрақтар</h2>'+(top.length?top.map(x=>{const q=qs[x.i];let m=-1,mv=0;x.w.slice(0,3).forEach((v,j)=>{if(v>mv){mv=v;m=j}});
    return '<div class="li"><b>№'+(x.i+1)+'</b> · <span class="bad">'+x.wrong+' қате ('+pct(x.wrong,n)+'%)</span><br>'+esc(q.q.length>140?q.q.slice(0,140)+'…':q.q)+(m>=0?'<br><span class="sub" style="margin:0">Жиі таңдалған қате жауап: '+L[m]+') '+esc(q.o[m])+'</span>':'')+'</div>'}).join(''):'<p class="sub">Қателер жоқ — барлығы дұрыс жауап берді!</p>')+'</div>';
  const sorted=rs.slice().sort((a,b)=>b.score-a.score||a.ts-b.ts);
  h+='<div class="cols"><div class="card"><h2>Үздік нәтижелер</h2>'+sorted.slice(0,5).map((r,i)=>'<div class="li"><b>'+(i+1)+'.</b> '+esc(r.name)+' — <b class="ok">'+r.score+'/'+r.total+'</b></div>').join('')+'</div>'+
  '<div class="card"><h2>Жұмыс қажет</h2>'+(low.length?low.sort((a,b)=>a.score-b.score).map(r=>'<div class="li">'+esc(r.name)+' — <b class="bad">'+r.score+'/'+r.total+'</b></div>').join(''):'<p class="sub">Барлық қатысушы 60%-дан жоғары нәтиже көрсетті.</p>')+'</div></div>';
  const dist=Array(tot+1).fill(0);rs.forEach(r=>dist[r.score]++);const mx=Math.max(...dist);
  h+='<div class="card"><h2>Баллдар бойынша бөлініс</h2>'+dist.map((v,s)=>'<div class="bar"><em>'+s+' балл</em><div class="tr"><i style="width:'+(mx?v/mx*100:0)+'%"></i></div><b>'+v+'</b></div>').join('')+'</div>';
  return h;
}

home();
})();
