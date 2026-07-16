import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { browserSessionPersistence, getAuth, sendPasswordResetEmail, setPersistence, signInAnonymously, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, limit, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const TEACHER_EMAIL = "t2bin@uryeo-h.gne.go.kr";
const firebaseApp = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const studentFirebaseApp = initializeApp(window.FIREBASE_CONFIG,"student-client");
const studentAuth = getAuth(studentFirebaseApp);
const studentDb = getFirestore(studentFirebaseApp);
const STUDENT_AUTH_VERSION = "team-session-v2";
const studentAuthPersistenceReady = setPersistence(studentAuth,browserSessionPersistence);
const TEAM_COLORS = ["#d8473c", "#2678ac", "#3d9255", "#db9b2f", "#7956a4", "#db6f9f", "#258c85", "#7d5535"];
const TOKENS = ["🐴","🐯","🐰","🐲","🦊","🐻","🐼","🐵","🦁","🐸","🐧","🦄","🐶","🐱","🐨","🐹","🦋","🐢","🦖","🐝","🦅","🐺","🐳","🦌","🐘"];
const state = { teams: [], current: 0, locked: true, lands: Array(81).fill(null), events: {}, deck: [], quizzes: [], wrongLog: [], asked: 0, correct: 0, activeSetupTeam: 0, lastRoll: 0, timer: null, turnNonce: 1, revision: 0, endsAt: 0, durationMin: 0, steal: null, finished: null, extraTurn: false };
const online = { roomId: null, code: null, isHost: false, hostControl: false, status: null, teamIndex: -1, players: [], unsub: null, playersUnsub: null, playerUnsub: null, applying: false };
const ITEMS = { shield:["방어패","상대의 잡기·땅 뺏기 공격을 한 번 자동으로 막습니다."], retry:["재도전권","오답일 때 한 번 더 답합니다."], hint:["쌍답권","정답을 두 개까지 고를 수 있습니다."], dice:["주사위 조작","굴린 뒤 주사위 하나를 6으로 바꿉니다."], freeze:["멈춰라!","내 차례에 눌러 사용: 다른 팀 한 곳을 한 턴 쉬게 합니다."] };
const EVENT_ICONS = { luck:"🍀", bad:"🌩️", ladder:"🪜", snake:"🐍", forward:"⏩", shuffle:"🌀", booster:"🚀" };

function showScreen(id){ $$(".screen").forEach(x=>x.classList.toggle("active",x.id===id)); }
function escapeText(value){return String(value??"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]))}
function sanitizeHtml(html){ const doc=new DOMParser().parseFromString(String(html||""),"text/html"); const ok=new Set(["DIV","P","SPAN","BR","B","STRONG","EM","U","TABLE","TBODY","TR","TD","TH","UL","OL","LI","IMG"]); [...doc.body.querySelectorAll("*")].forEach(el=>{ if(!ok.has(el.tagName)){el.replaceWith(...el.childNodes);return;} [...el.attributes].forEach(a=>{if(a.name.startsWith("on")||!["class","colspan","rowspan","src","alt"].includes(a.name))el.removeAttribute(a.name);}); if(el.tagName==="IMG"&&!/^data:image\//.test(el.getAttribute("src")||""))el.remove(); }); return doc.body.innerHTML; }

/* ── 사운드 (WebAudio 합성, 외부 파일 없음) ───────────────────────── */
const SND={ctx:null,sfxOn:localStorage.getItem("hx-sfx")!=="off",bgmOn:localStorage.getItem("hx-bgm")==="on",bgmTimer:0,bgmStep:0};
function audioCtx(){if(!SND.ctx)SND.ctx=new (window.AudioContext||window.webkitAudioContext)();if(SND.ctx.state==="suspended")SND.ctx.resume().catch(()=>{});return SND.ctx}
function tone(freq,dur=.15,type="triangle",gain=.12,delay=0){try{const ctx=audioCtx(),o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+dur)}catch{}}
const sfx={
  dice(){if(!SND.sfxOn)return;for(let i=0;i<6;i++)tone(180+Math.random()*260,.05,"square",.05,i*.07)},
  move(){if(!SND.sfxOn)return;tone(520,.05,"sine",.07)},
  correct(){if(!SND.sfxOn)return;[523,659,784,1047].forEach((f,i)=>tone(f,.18,"triangle",.14,i*.09))},
  wrong(){if(!SND.sfxOn)return;tone(196,.3,"sawtooth",.11);tone(147,.35,"sawtooth",.11,.12)},
  item(){if(!SND.sfxOn)return;[880,1175,1568].forEach((f,i)=>tone(f,.12,"sine",.12,i*.06))},
  catch(){if(!SND.sfxOn)return;tone(660,.08,"square",.14);tone(330,.22,"square",.12,.08)},
  buzzer(){if(!SND.sfxOn)return;tone(440,.24,"square",.15);tone(466,.24,"square",.15,.06)},
  win(){if(!SND.sfxOn)return;[523,659,784,1047,784,1047,1319].forEach((f,i)=>tone(f,.24,"triangle",.15,i*.13))},
};
const BGM_NOTES=[392,440,523,392,587,523,440,330];
function bgmLoop(){if(!SND.bgmOn)return;const f=BGM_NOTES[SND.bgmStep++%BGM_NOTES.length];tone(f,.55,"sine",.035);tone(f/2,.85,"sine",.02)}
function setSfx(on){SND.sfxOn=on;localStorage.setItem("hx-sfx",on?"on":"off");if(on)audioCtx();updateSoundButtons()}
function setBgm(on){SND.bgmOn=on;localStorage.setItem("hx-bgm",on?"on":"off");clearInterval(SND.bgmTimer);if(on){audioCtx();SND.bgmTimer=setInterval(bgmLoop,700)}updateSoundButtons()}
function updateSoundButtons(){$$(".snd-sfx").forEach(b=>b.textContent=SND.sfxOn?"🔊":"🔇");$$(".snd-bgm").forEach(b=>b.textContent=SND.bgmOn?"🎵 ON":"🎵 OFF")}
document.addEventListener("click",e=>{const b=e.target.closest(".snd-sfx,.snd-bgm");if(!b)return;if(b.classList.contains("snd-sfx"))setSfx(!SND.sfxOn);else setBgm(!SND.bgmOn)});
function fireConfetti(){if(!window.confetti)return;[0,250,550,900].forEach(ms=>setTimeout(()=>confetti({particleCount:120,spread:75,startVelocity:42,origin:{x:.2+Math.random()*.6,y:.25+Math.random()*.3}}),ms))}

function makeRoomCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("")}
async function ensureStudentAuth(){
  await studentAuthPersistenceReady;
  if(sessionStorage.getItem("student-auth-version")!==STUDENT_AUTH_VERSION){
    if(studentAuth.currentUser)await signOut(studentAuth);
    sessionStorage.setItem("student-auth-version",STUDENT_AUTH_VERSION);
  }
  if(!studentAuth.currentUser)await signInAnonymously(studentAuth);
  return studentAuth.currentUser;
}
function canCurrentStudentAct(){
  if(!online.roomId)return true;
  if(online.status!=="playing")return false;
  if(online.isHost)return !!online.hostControl;
  const team=state.teams[state.current];
  return !!team?.ownerUid&&team.ownerUid===studentAuth.currentUser?.uid&&state.current===online.teamIndex;
}
function jsonClone(v){return v==null?null:JSON.parse(JSON.stringify(v))}
function publicSnapshot(){return{teams:state.teams.map(t=>({...t,items:[...t.items]})),current:state.current,locked:state.locked,lands:[...state.lands],events:jsonClone(state.events)||{},deck:[...state.deck],endsAt:state.endsAt||0,durationMin:state.durationMin||0,steal:jsonClone(state.steal),wrongLog:jsonClone(state.wrongLog)||[],finished:jsonClone(state.finished),asked:state.asked,correct:state.correct,lastRoll:state.lastRoll,turnNonce:state.turnNonce,revision:state.revision}}
function applySnapshot(s,navigate=false){if(!s)return;const hadFinished=!!state.finished;if((s.revision||0)>state.revision){online.applying=true;state.teams=s.teams||[];state.current=s.current||0;state.locked=!!s.locked;state.lands=s.lands||Array(81).fill(null);state.events=s.events||{};state.deck=s.deck||[];state.endsAt=s.endsAt||0;state.durationMin=s.durationMin||0;state.steal=s.steal||null;state.wrongLog=s.wrongLog||[];state.finished=s.finished||null;state.asked=s.asked||0;state.correct=s.correct||0;state.lastRoll=s.lastRoll||0;state.turnNonce=s.turnNonce||1;state.revision=s.revision||0;online.applying=false}if(navigate&&state.teams.length){renderGame();showScreen("game-screen")}if(!hadFinished&&state.finished)showWinner();updateOnlineBadges()}
function updateOnlineBadges(){if($("#room-label"))$("#room-label").textContent=online.code||"게임방 준비 전";if($("#room-access-button"))$("#room-access-button").disabled=!online.code;if($("#room-code-value"))$("#room-code-value").textContent=online.code?`입장 코드 ${online.code}`:"새 게임을 만들면 입장 코드 표시";if($("#active-games"))$("#active-games").textContent=online.roomId?"1":"0";if($("#joined-team-count"))$("#joined-team-count").textContent=state.teams.filter(t=>t.ownerUid).length}
function studentJoinUrl(){const url=new URL(location.href);url.hash="";url.search="";url.searchParams.set("join",online.code);return url.toString()}
function showRoomAccess(){
  if(!online.code){alert("먼저 게임방을 만들어 주세요.");return}
  const url=studentJoinUrl(),qr=$("#room-qr");
  $("#room-code-large").textContent=online.code;
  $("#room-join-url").textContent=url;
  $("#copy-result").textContent="";
  qr.innerHTML="";
  if(window.QRCode)new QRCode(qr,{text:url,width:236,height:236,colorDark:"#172b3d",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});
  else qr.textContent="QR 생성 도구를 불러오지 못했습니다. 화면을 새로고침해 주세요.";
  $("#room-access-dialog").showModal();
}
async function copyJoinLink(){
  const result=$("#copy-result"),url=studentJoinUrl();
  try{await navigator.clipboard.writeText(url);result.textContent="접속 링크를 복사했습니다."}
  catch{result.textContent="복사하지 못했습니다. 위 주소를 직접 복사해 주세요."}
}
function subscribeRoom(){online.unsub?.();if(!online.roomId)return;const roomDb=online.isHost?db:studentDb;online.unsub=onSnapshot(doc(roomDb,"rooms",online.roomId),snap=>{if(!snap.exists())return;const data=snap.data();online.status=data.status;online.code=data.code||online.code;applySnapshot(data.snapshot,data.status==="playing");if(data.status==="lobby"){if(online.isHost){renderTeacherLobby();showScreen("teacher-lobby-screen")}else{renderStudentLobby();showScreen("student-lobby-screen")}}if(data.tv?.nonce&&data.tv.nonce!==gameTvNonce){gameTvNonce=data.tv.nonce;if(data.status==="playing")renderSpectatorEvent(data.tv)}},error=>console.error("Room subscription failed",error))}
/* ── 관전 중계: 다른 팀 퀴즈·주사위·스틸을 모든 게임 화면에 표시 ── */
let gameTvNonce="",gameOverlayTimer=0;
function showGameOverlay(head,body,hideAfter=0){clearTimeout(gameOverlayTimer);const o=$("#game-overlay");if(!o)return;$("#game-overlay-head").innerHTML=head;$("#game-overlay-body").innerHTML=body;o.hidden=false;if(hideAfter)gameOverlayTimer=setTimeout(()=>{o.hidden=true},hideAfter)}
function hideGameOverlay(){clearTimeout(gameOverlayTimer);const o=$("#game-overlay");if(o)o.hidden=true}
function renderSpectatorEvent(event){
  if(location.hash==="#tv")return;
  const p=event?.payload||{};
  if(document.querySelector("dialog[open]"))return; // 내가 직접 진행 중(퀴즈·버저·아이템 창)이면 중계 생략
  if(event.type==="diceRolling"){hideGameOverlay();$("#dice-owner").textContent=`${p.teamName||"상대 팀"} 주사위 굴리는 중…`;$("#dice").classList.add("rolling");sfx.dice();return}
  if(event.type==="diceResult"){$("#dice").classList.remove("rolling");if(p.d1&&p.d2)setDice(p.d1,p.d2);$("#dice-owner").textContent=`${p.teamName||""}: ${p.d1??"?"}+${p.d2??"?"}=${p.value??"?"}${p.double?" ✨더블!":""}`;return}
  if(event.type==="quiz"){const choices=(p.choices||[]).map((c,i)=>`<div class="overlay-choice"><b>${i+1}.</b> ${escapeText(c)}</div>`).join("");showGameOverlay(`📚 ${escapeText(p.teamName||"")} 팀 퀴즈 도전 중`,`<div>${sanitizeHtml(p.html||"")}</div>${choices}`);return}
  if(event.type==="quizResult"){if(p.correct)sfx.correct();else sfx.wrong();showGameOverlay(p.correct?"⭕ 정답!":"❌ 오답!",escapeText(p.message||""),2800);return}
  if(event.type==="steal"){if(p.phase==="rolling")sfx.buzzer();showGameOverlay("⚡ 스틸 찬스!",escapeText(p.message||""),p.phase==="done"?3000:0);return}
  if(event.type==="event"){showGameOverlay(`${p.icon||"✨"} ${escapeText(p.title||"")}`,escapeText(p.message||""),4200);return}
  if(event.type==="notice"){const el=$("#board-toast");if(el){el.textContent=p.message||"";el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1400)}return}
  if(event.type==="winner")hideGameOverlay();
}
function subscribePlayers(){online.playersUnsub?.();if(!online.roomId||!online.isHost)return;online.playersUnsub=onSnapshot(collection(db,"rooms",online.roomId,"players"),snap=>{online.players=snap.docs.map(d=>({uid:d.id,...d.data()}));renderTeacherLobby()},error=>{$("#ready-summary-message").textContent="교사 실시간 연결 권한이 끊겼습니다. 다시 로그인해 주세요.";console.error("Teacher player subscription failed",error)})}
function subscribeOwnPlayer(){online.playerUnsub?.();if(!online.roomId||online.isHost)return;let existed=false;const kicked=()=>{if(!online.roomId)return;online.unsub?.();online.playerUnsub?.();online.roomId=null;online.code=null;alert("교사가 대기실에서 이 팀을 내보냈습니다.");showScreen("home-screen")};online.playerUnsub=onSnapshot(doc(studentDb,"rooms",online.roomId,"players",studentAuth.currentUser.uid),snap=>{if(snap.exists()){existed=true;const player=snap.data();online.teamIndex=player.teamIndex;if(online.status==="lobby")renderStudentLobby(player)}else if(existed&&online.status==="lobby")kicked()},error=>{if(existed&&online.status==="lobby"){console.warn("Player listener closed after removal",error);kicked()}else console.error("Player listener failed",error)})}
function renderStudentLobby(player=null){if(online.teamIndex<0)return;const team=state.teams[online.teamIndex];if(!team)return;$("#student-lobby-code").textContent=online.code;$("#student-lobby-token").textContent=team.token;$("#student-lobby-title").textContent=`${online.teamIndex+1}번 팀 준비`;if(player&&!$("#lobby-team-name").value)$("#lobby-team-name").value=player.teamName||team.name;if(player?.members?.length&&!$("#lobby-member-names").value)$("#lobby-member-names").value=player.members.join("\n");const ready=!!player?.ready;$("#student-ready").disabled=ready;$("#student-ready").textContent=ready?"준비완료됨":"준비완료";$("#student-ready-status").textContent=ready?"준비완료! 선생님이 게임을 시작할 때까지 기다려 주세요.":"팀 정보를 입력하고 준비완료를 눌러주세요.";$("#student-ready-status").classList.toggle("ready",ready)}
function renderTeacherLobby(){if(!online.isHost)return;$("#teacher-lobby-code").textContent=online.code||"------";const players=online.players.filter(p=>p.role==="student"),byTeam=new Map(players.map(p=>[p.teamIndex,p])),ready=players.filter(p=>p.ready).length,total=state.teams.length;$("#ready-summary-count").textContent=`${ready} / ${total}팀`;$("#ready-summary-message").textContent=total&&ready===total?"모든 팀이 준비완료했습니다.":`${players.length}/${total}팀 입장 · ${total-ready}팀 미준비`;$("#teacher-player-list").innerHTML=state.teams.map((team,index)=>{const p=byTeam.get(index);return `<div class="lobby-player"><span class="pawn">${team.token||"🎒"}</span><div><b>${escapeText(p?.teamName||team.name||`${index+1}팀`)}</b><small>${p?.members?.length?escapeText(p.members.join(", ")):p?"팀원명 미입력":"학생 입장 대기"}</small></div><span class="ready-badge ${p?.ready?'done':''}">${p?.ready?'준비완료':p?'준비 중':'미입장'}</span>${p?`<button class="kick-player" data-uid="${escapeText(p.uid)}" type="button">강퇴</button>`:""}</div>`}).join("");updateOnlineBadges()}
async function createOnlineRoom(){online.isHost=true;online.status="lobby";online.players=[];online.roomId=crypto.randomUUID();for(let tries=0;tries<8;tries++){online.code=makeRoomCode();if(!(await getDoc(doc(db,"roomCodes",online.code))).exists())break}state.revision=1;state.locked=true;const snapshot=publicSnapshot();const batch=writeBatch(db);batch.set(doc(db,"rooms",online.roomId),{teacherId:auth.currentUser.uid,code:online.code,status:"lobby",snapshot,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});batch.set(doc(db,"roomCodes",online.code),{roomId:online.roomId,active:true,createdAt:serverTimestamp()});batch.set(doc(db,"rooms",online.roomId,"players",auth.currentUser.uid),{role:"teacher",teamIndex:-1,ready:true,joinedAt:serverTimestamp()});await batch.commit();subscribeRoom();subscribePlayers();updateOnlineBadges();try{await loadQuizBank()}catch(error){console.error("Quiz bank load after room creation failed",error)}}
async function joinOnlineRoom(){
  const errorBox=$("#join-error"),code=$("#join-code").value.trim().toUpperCase();
  if(code.length!==6){errorBox.textContent="6자리 입장 코드를 입력하세요.";return}
  errorBox.textContent="게임방을 확인하는 중입니다…";
  try{
    const studentUser=await ensureStudentAuth(),uid=studentUser.uid,codeSnap=await getDoc(doc(studentDb,"roomCodes",code));
    if(!codeSnap.exists()||!codeSnap.data().active)throw new Error("사용할 수 없는 입장 코드입니다.");
    const roomId=codeSnap.data().roomId,roomRef=doc(studentDb,"rooms",roomId),playerRef=doc(studentDb,"rooms",roomId,"players",uid);
    const roomSnap0=await getDoc(roomRef);
    if(!roomSnap0.exists())throw new Error("게임방을 찾을 수 없습니다.");
    const status0=roomSnap0.data().status;
    if(status0==="lobby"){
      let joinedIndex=-1;
      await runTransaction(studentDb,async tx=>{const roomSnap=await tx.get(roomRef);if(!roomSnap.exists())throw new Error("게임방을 찾을 수 없습니다.");const data=roomSnap.data();if(data.status!=="lobby")throw new Error("게임이 방금 시작됐습니다. 다시 입장을 누르면 복귀할 수 있습니다.");const snapshot=data.snapshot,teams=snapshot.teams.map(t=>({...t}));joinedIndex=teams.findIndex(t=>t.ownerUid===uid);if(joinedIndex<0)joinedIndex=teams.findIndex(t=>!t.ownerUid);if(joinedIndex<0)throw new Error("모든 팀 자리가 찼습니다.");teams[joinedIndex].ownerUid=uid;const next={...snapshot,teams,revision:(snapshot.revision||0)+1};tx.set(playerRef,{role:"student",teamIndex:joinedIndex,teamName:teams[joinedIndex].name,members:[],ready:false,joinedAt:serverTimestamp()},{merge:true});tx.update(roomRef,{snapshot:next,updatedAt:serverTimestamp()})});
      online.roomId=roomId;online.code=code;online.status="lobby";online.teamIndex=joinedIndex;online.isHost=false;state.revision=0;
      subscribeRoom();subscribeOwnPlayer();
      try{await loadQuizBank(studentAuth,studentDb)}catch(error){console.error("Student quiz bank load failed",error)}
      $("#join-dialog").close();renderStudentLobby();showScreen("student-lobby-screen");updateOnlineBadges();
    }else if(status0==="playing"){
      const snapshot=roomSnap0.data().snapshot;
      let idx=(snapshot.teams||[]).findIndex(t=>t.ownerUid===uid);
      if(idx<0){errorBox.textContent="진행 중인 게임입니다. 복귀할 팀을 선택하세요.";idx=await pickRejoinTeam(snapshot.teams||[]);if(idx==null||idx<0)throw new Error("복귀할 팀을 선택하지 않았습니다.")}
      await runTransaction(studentDb,async tx=>{const rs=await tx.get(roomRef);if(!rs.exists())throw new Error("게임방을 찾을 수 없습니다.");const data=rs.data();if(data.status!=="playing")throw new Error("게임 상태가 바뀌었습니다. 다시 시도하세요.");const teams=data.snapshot.teams.map(t=>({...t}));teams[idx]={...teams[idx],ownerUid:uid};tx.set(playerRef,{role:"student",teamIndex:idx,teamName:teams[idx].name,members:[],ready:true,joinedAt:serverTimestamp()},{merge:true});tx.update(roomRef,{snapshot:{...data.snapshot,teams,revision:(data.snapshot.revision||0)+1},updatedAt:serverTimestamp()})});
      online.roomId=roomId;online.code=code;online.status="playing";online.teamIndex=idx;online.isHost=false;state.revision=0;
      subscribeRoom();subscribeOwnPlayer();
      try{await loadQuizBank(studentAuth,studentDb)}catch(error){console.error("Student quiz bank load failed",error)}
      $("#join-dialog").close();updateOnlineBadges();
    }else throw new Error("이미 종료된 게임입니다.");
  }catch(error){console.error("Student join failed",error);errorBox.textContent=error.message}
}
function pickRejoinTeam(teams){return new Promise(resolve=>{const d=$("#rejoin-dialog"),box=$("#rejoin-teams");box.innerHTML=teams.map((t,i)=>`<button type="button" class="rejoin-team" data-idx="${i}"><span>${t.token||"🎒"}</span><b>${escapeText(t.name||`${i+1}팀`)}</b><small>${t.ownerUid?"⚠️ 접속 기록 있음 (기기 교체 시에만)":"빈 자리"}</small></button>`).join("");let settled=false;const done=v=>{if(settled)return;settled=true;box.onclick=null;d.onclose=null;if(d.open)d.close();resolve(v)};box.onclick=e=>{const b=e.target.closest(".rejoin-team");if(b)done(+b.dataset.idx)};d.onclose=()=>done(null);d.showModal()})}
async function markStudentReady(){const teamName=$("#lobby-team-name").value.trim(),members=$("#lobby-member-names").value.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean),status=$("#student-ready-status");if(!teamName){status.textContent="팀명을 입력하세요.";return}if(!members.length){status.textContent="팀원명을 한 명 이상 입력하세요.";return}$("#student-ready").disabled=true;status.textContent="준비 상태를 저장하는 중입니다…";try{const uid=studentAuth.currentUser.uid,roomRef=doc(studentDb,"rooms",online.roomId),playerRef=doc(studentDb,"rooms",online.roomId,"players",uid);await runTransaction(studentDb,async tx=>{const roomSnap=await tx.get(roomRef);if(!roomSnap.exists()||roomSnap.data().status!=="lobby")throw new Error("대기 중인 게임방이 아닙니다.");const snapshot=roomSnap.data().snapshot,teams=snapshot.teams.map(t=>({...t}));teams[online.teamIndex]={...teams[online.teamIndex],name:teamName,ownerUid:uid};tx.update(roomRef,{snapshot:{...snapshot,teams,revision:(snapshot.revision||0)+1},updatedAt:serverTimestamp()});tx.set(playerRef,{role:"student",teamIndex:online.teamIndex,teamName,members,ready:true,readyAt:serverTimestamp()},{merge:true})});status.textContent="준비완료! 선생님이 게임을 시작할 때까지 기다려 주세요.";status.classList.add("ready")}catch(error){console.error("Student ready update failed",error);status.textContent=`준비 상태 저장 실패: ${error.message}`;$("#student-ready").disabled=false}}
async function kickPlayer(uid){if(!online.isHost||!confirm("이 팀을 대기실에서 강퇴할까요?"))return;const roomRef=doc(db,"rooms",online.roomId),playerRef=doc(db,"rooms",online.roomId,"players",uid);await runTransaction(db,async tx=>{const roomSnap=await tx.get(roomRef);if(!roomSnap.exists())return;const snapshot=roomSnap.data().snapshot,teams=snapshot.teams.map((t,i)=>t.ownerUid===uid?{...t,name:`${i+1}팀`,ownerUid:null}:{...t});tx.update(roomRef,{snapshot:{...snapshot,teams,revision:(snapshot.revision||0)+1},updatedAt:serverTimestamp()});tx.delete(playerRef)})}
async function startHostedGame(){if(!online.isHost||!online.roomId)return;if(auth.currentUser?.email?.toLowerCase()!==TEACHER_EMAIL){alert("교사 인증 세션이 만료됐습니다. 다시 로그인한 뒤 게임 시작을 눌러주세요.");teacherLogin();return}const ready=online.players.filter(p=>p.role==="student"&&p.ready).length,notReady=Math.max(0,state.teams.length-ready);if(notReady&&!confirm(`${notReady}팀이 아직 준비완료하지 않았습니다. 그래도 게임을 시작할까요?\n(학생이 접속하지 않은 팀은 자동 제외되며, 팀 카드의 "복귀" 버튼으로 언제든 되살릴 수 있습니다)`))return;const tvWindow=window.open("about:blank","history-tv");try{const roomRef=doc(db,"rooms",online.roomId);let excluded=[];const next=await runTransaction(db,async tx=>{const roomSnap=await tx.get(roomRef);if(!roomSnap.exists())throw new Error("게임방을 찾을 수 없습니다.");const snapshot=roomSnap.data().snapshot,teams=(snapshot.teams||[]).map(t=>({...t}));excluded=[];if(teams.some(t=>t.ownerUid))teams.forEach(t=>{if(!t.ownerUid&&t.active!==false){t.active=false;excluded.push(t.name)}});let current=snapshot.current||0;if(teams[current]?.active===false){const firstActive=teams.findIndex(t=>t.active!==false);if(firstActive>=0)current=firstActive}const started={...snapshot,teams,current,locked:false,endsAt:state.durationMin?Date.now()+state.durationMin*60000:0,revision:(snapshot.revision||0)+1};tx.update(roomRef,{status:"playing",snapshot:started,startedAt:serverTimestamp(),updatedAt:serverTimestamp()});return started});online.status="playing";state.revision=0;applySnapshot(next,true);if(excluded.length){addLog(`미접속 ${excluded.join(", ")} 자동 제외 (복귀 버튼으로 되살리기 가능)`);toast(`미접속 ${excluded.length}팀 자동 제외`)}updateOnlineBadges();openTv(tvWindow,true)}catch(error){tvWindow?.close();console.error("Host game start failed",error);alert(`게임 시작 실패: ${error.message}`)}}

function cat(p0,p1,p2,p3,t){const t2=t*t,t3=t2*t;return [.5*(2*p1[0]+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),.5*(2*p1[1]+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)];}
function boardPositions(){const cp=[[1450,720],[1170,735],[820,735],[460,730],[185,665],[160,500],[330,435],[650,520],[920,550],[1210,500],[1435,430],[1430,245],[1240,170],[980,170],[800,175]],dense=[];for(let i=0;i<cp.length-1;i++)for(let j=0;j<100;j++)dense.push(cat(cp[Math.max(0,i-1)],cp[i],cp[i+1],cp[Math.min(cp.length-1,i+2)],j/100));dense.push(cp.at(-1));const len=[0];for(let i=1;i<dense.length;i++)len.push(len.at(-1)+Math.hypot(dense[i][0]-dense[i-1][0],dense[i][1]-dense[i-1][1]));const out=[];let c=0;for(let i=0;i<80;i++){const target=len.at(-1)*i/79;while(len[c+1]<target)c++;const r=(target-len[c])/(len[c+1]-len[c]),a=dense[c],b=dense[c+1];out.push({x:(a[0]+(b[0]-a[0])*r)/16,y:(a[1]+(b[1]-a[1])*r)/9});}return out;}
const POS=boardPositions();

function setupTeams(count=4){const old=state.teams;state.teams=Array.from({length:count},(_,i)=>old[i]||{id:crypto.randomUUID(),name:`${i+1}팀`,token:TOKENS[i],color:TEAM_COLORS[i],position:1,items:[],skip:0,correct:0,wrong:0,ownerUid:null,active:true,boost:false});state.activeSetupTeam=Math.min(state.activeSetupTeam,count-1);renderSetup();}
function renderSetup(){ $("#team-count").innerHTML=[2,3,4,5,6,7,8].map(n=>`<button class="${state.teams.length===n?'active':''}" data-count="${n}">${n}</button>`).join(""); $("#team-fields").innerHTML=state.teams.map((t,i)=>`<div class="team-field ${i===state.activeSetupTeam?'active':''}" data-team="${i}"><button>${t.token}</button><input value="${escapeText(t.name)}" maxlength="12" aria-label="${i+1}팀 이름"></div>`).join(""); $("#active-team-label").textContent=`${state.teams[state.activeSetupTeam].name}의 말 선택`; $("#token-picker").innerHTML=TOKENS.map(x=>`<button class="token-choice ${state.teams[state.activeSetupTeam].token===x?'selected':''}" data-token="${x}">${x}</button>`).join("");$("#duration-picker").innerHTML=[0,15,20,30,40].map(m=>`<button class="${(state.durationMin||0)===m?'active':''}" data-minutes="${m}">${m?`${m}분`:"없음"}</button>`).join("")}
$("#team-count").onclick=e=>{const n=+e.target.dataset.count;if(n)setupTeams(n)};$("#team-fields").onclick=e=>{const row=e.target.closest(".team-field");if(row){state.activeSetupTeam=+row.dataset.team;renderSetup()}};$("#team-fields").oninput=e=>{const row=e.target.closest(".team-field");if(row&&e.target.tagName==="INPUT"){state.teams[+row.dataset.team].name=e.target.value||`${+row.dataset.team+1}팀`;$("#active-team-label").textContent=`${state.teams[state.activeSetupTeam].name}의 말 선택`}};$("#token-picker").onclick=e=>{if(e.target.dataset.token){state.teams[state.activeSetupTeam].token=e.target.dataset.token;renderSetup()}};$("#duration-picker").onclick=e=>{const b=e.target.closest("[data-minutes]");if(b){state.durationMin=+b.dataset.minutes;renderSetup()}};

function shuffle(a){return [...a].sort(()=>Math.random()-.5)}
function generateEvents(){const cells=shuffle(Array.from({length:72},(_,i)=>i+4)),ev={},take=n=>cells.splice(0,n);take(6).forEach(c=>ev[c]={type:"luck"});take(4).forEach(c=>ev[c]={type:"bad"});take(3).forEach(c=>ev[c]={type:"ladder",to:Math.min(79,c+6+Math.floor(Math.random()*5))});take(3).forEach(c=>ev[c]={type:"snake",to:Math.max(1,c-5-Math.floor(Math.random()*4))});take(2).forEach(c=>ev[c]={type:"forward"});take(1).forEach(c=>ev[c]={type:"shuffle"});take(2).forEach(c=>ev[c]={type:"booster"});return ev}
function resetGame(){state.current=0;state.locked=false;state.lands=Array(81).fill(null);state.wrongLog=[];state.asked=state.correct=0;state.turnNonce=1;state.revision=0;state.steal=null;state.finished=null;state.extraTurn=false;state.endsAt=0;state.teams.forEach((t,i)=>Object.assign(t,{position:1,items:[],skip:0,correct:0,wrong:0,color:TEAM_COLORS[i],ownerUid:t.ownerUid||null,active:true,boost:false}));state.events=generateEvents();state.deck=shuffle(state.quizzes.map(q=>q.id).filter(Boolean));renderGame();addLog("80칸 역사 탐험을 시작합니다!")}
function teamScore(t,i){return (t.position||0)+state.lands.filter(x=>x===i).length*5+(t.correct||0)*3}
function myTeamIndex(){if(!online.roomId||online.isHost)return state.current;return online.teamIndex}
function renderGame(){const team=state.teams[state.current];if(!team)return;$("#turn-banner").innerHTML=`<span style="color:${team.color}">${team.token} ${escapeText(team.name)}</span>의 차례`;$("#dice-owner").textContent=online.isHost&&online.status==="playing"&&!online.hostControl&&!team.ownerUid?`${team.name}: 🎮 대리 진행을 켜면 교사가 굴릴 수 있어요`:`${team.name}의 주사위`;$("#team-list").innerHTML=state.teams.map((t,i)=>`<div class="team-card ${i===state.current?'current':''} ${t.active===false?'inactive':''}"><span class="pawn">${t.token}</span><div><b>${escapeText(t.name)}</b><small>${t.position}칸 · 땅 ${state.lands.filter(x=>x===i).length} · ${teamScore(t,i)}점${t.ownerUid?'':' · 미접속'}</small></div><div class="team-flags">${t.skip?'<span class="skip">한 턴 쉼</span>':''}${t.boost?'<span class="boost">🚀×2</span>':''}${online.isHost&&online.status==="playing"?`<button class="team-toggle" data-idx="${i}" type="button">${t.active===false?'복귀':'제외'}</button>`:''}</div></div>`).join("");renderTokens();renderLands();renderEvents();renderInventory();const myTurn=canCurrentStudentAct();$("#roll-button").disabled=state.locked||!myTurn||!!state.steal||!!state.finished;$("#teacher-tools").hidden=!(online.isHost&&online.status==="playing");$("#tool-host").textContent=online.hostControl?"🎮 대리 진행: ON":"🎮 대리 진행: OFF";updateClassTimer();updateStealUi();updateOnlineBadges()}
function renderTokens(){const layers=[$("#token-layer"),$("#tv-token-layer")].filter(Boolean);state.teams.forEach((t,i)=>layers.forEach(layer=>{const key=String(t.id||i);let el=layer.querySelector(`[data-team-id="${key}"]`);if(!el){el=document.createElement("div");el.className="player-token";el.dataset.teamId=key;layer.append(el)}const p=POS[Math.min(80,Math.max(1,t.position))-1];el.textContent=t.token;el.title=`${t.name} ${t.position}칸`;el.classList.toggle("inactive",t.active===false);el.style.setProperty("--team-color",t.color);el.style.left=`${p.x}%`;el.style.top=`${p.y}%`;el.style.marginLeft=`${(i%4-1.5)*7}px`;el.style.marginTop=`${Math.floor(i/4)*7}px`}));layers.forEach(layer=>[...layer.children].forEach(el=>{if(!state.teams.some((t,i)=>String(t.id||i)===el.dataset.teamId))el.remove()}));if($("#tv-status"))$("#tv-status").textContent=`${state.teams[state.current]?.name||"게임"} 차례 · 최근 주사위 ${state.lastRoll||"-"}`;renderTvRank()}
function renderLands(){const layer=$("#land-layer");if(!layer)return;layer.innerHTML="";state.lands.forEach((owner,n)=>{if(owner!==null&&n>1&&state.teams[owner]){const p=POS[n-1],el=document.createElement("i");el.className="land-mark";el.style.cssText=`--team-color:${state.teams[owner].color};left:${p.x}%;top:${p.y}%`;layer.append(el)}})}
function renderEvents(){[$("#event-layer"),$("#tv-event-layer")].filter(Boolean).forEach(layer=>{layer.innerHTML="";Object.entries(state.events||{}).forEach(([cell,ev])=>{const p=POS[cell-1];if(!p||!ev)return;const el=document.createElement("span");el.className="event-mark";el.textContent=EVENT_ICONS[ev.type]||"✨";el.title={luck:"행운 칸",bad:"불운 칸",ladder:`사다리 → ${ev.to}칸`,snake:`미끄럼틀 → ${ev.to}칸`,forward:"3칸 전진",shuffle:"전체 위치 셔플",booster:"주사위 2배 부스터"}[ev.type]||"";el.style.left=`${p.x}%`;el.style.top=`${p.y}%`;layer.append(el)})})}
function renderInventory(){const idx=myTeamIndex(),t=state.teams[idx],box=$("#inventory");$("#inventory-title").textContent=online.roomId&&!online.isHost?"내 팀 아이템":`${t?.name||"현재 팀"} 아이템`;if(!t){box.innerHTML='<p class="empty">팀 정보가 없습니다.</p>';return}box.innerHTML=t.items.length?`<div class="inventory-items">${t.items.map((k,n)=>`<button type="button" class="item-chip ${k==='freeze'?'usable':''}" data-item="${k}" data-n="${n}">${k==='freeze'?'⏸️ ':''}${ITEMS[k][0]}</button>`).join("")}</div><p class="inv-hint">멈춰라!는 내 차례에 눌러 사용 · 나머지는 필요한 순간 자동으로 물어봅니다</p>`:`<p class="empty">아직 획득한 아이템이 없습니다.</p>`}
$("#inventory").addEventListener("click",async e=>{const chip=e.target.closest(".item-chip");if(!chip)return;const key=chip.dataset.item;if(key!=="freeze"){toast(ITEMS[key][1]);return}if(!canCurrentStudentAct()||state.locked||state.steal||state.finished){toast("멈춰라!는 내 차례에 주사위를 굴리기 전에 사용할 수 있어요.");return}const idx=myTeamIndex(),team=state.teams[idx];if(!team||!team.items.includes("freeze"))return;const target=await pickFreezeTarget(idx);if(target==null)return;team.items.splice(team.items.indexOf("freeze"),1);state.teams[target].skip++;sfx.item();toast(`⏸️ ${state.teams[target].name}, 멈춰라!`);publishTv("event",{icon:"⏸️",title:"멈춰라! 발동",message:`${team.name}이(가) ${state.teams[target].name}을(를) 한 턴 쉬게 했습니다!`});addLog(`${team.name}: 멈춰라! → ${state.teams[target].name}`);renderGame();await syncState()});
function pickFreezeTarget(myIdx){return new Promise(resolve=>{const d=$("#freeze-dialog"),box=$("#freeze-targets");box.innerHTML=state.teams.map((t,i)=>i===myIdx||t.active===false?"":`<button type="button" class="rejoin-team" data-idx="${i}"><span>${t.token}</span><b>${escapeText(t.name)}</b><small>${t.position}칸</small></button>`).join("");let settled=false;const done=v=>{if(settled)return;settled=true;box.onclick=null;d.onclose=null;if(d.open)d.close();resolve(v)};box.onclick=e=>{const b=e.target.closest(".rejoin-team");if(b)done(+b.dataset.idx)};d.onclose=()=>done(null);d.showModal()})}
function addLog(text){const li=document.createElement("li");li.textContent=text;$("#game-log").prepend(li);while($("#game-log").children.length>14)$("#game-log").lastChild.remove()}
async function publishTv(type,payload={}){
  if(!online.roomId)return;
  const roomDb=online.isHost?db:studentDb;
  try{await updateDoc(doc(roomDb,"rooms",online.roomId),{tv:{type,payload,nonce:crypto.randomUUID(),sentAt:Date.now()},updatedAt:serverTimestamp()})}
  catch(error){console.error("TV event publish failed",error)}
}
function toast(text){const el=$("#board-toast");el.textContent=text;el.classList.add("show");publishTv("notice",{message:text});setTimeout(()=>el.classList.remove("show"),1400)}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function moveTeam(team,target,{sync=true}={}){target=Math.max(1,Math.min(80,target));while(team.position!==target){team.position+=Math.sign(target-team.position);sfx.move();renderTokens();await wait(240)}renderGame();if(sync)await syncState()}

/* ── 주사위 2개 ─────────────────────────────────────────────── */
function setDice(d1,d2){$("#die1").textContent=d1??"–";$("#die2").textContent=d2??"–"}
let pressStart=0,chargeFrame=0,autoRoll=0;function beginCharge(e){if(state.locked||state.steal||state.finished||!canCurrentStudentAct())return;e.preventDefault();audioCtx();pressStart=performance.now();state.locked=true;$("#roll-button").classList.add("charging");const tick=()=>{const p=Math.min(1,(performance.now()-pressStart)/2000);$("#charge-fill").style.width=`${p*100}%`;if(p<1)chargeFrame=requestAnimationFrame(tick);else rollDice()};chargeFrame=requestAnimationFrame(tick);autoRoll=setTimeout(()=>rollDice(),2050)}function releaseCharge(e){if(!pressStart)return;e.preventDefault();rollDice()}
$("#roll-button").addEventListener("pointerdown",beginCharge);window.addEventListener("pointerup",releaseCharge);
async function rollDice(){if(!pressStart)return;if(!canCurrentStudentAct()||state.steal||state.finished){pressStart=0;state.locked=false;renderGame();return;}pressStart=0;cancelAnimationFrame(chargeFrame);clearTimeout(autoRoll);$("#roll-button").classList.remove("charging");const team=state.teams[state.current],diceBox=$("#dice");diceBox.classList.add("rolling");sfx.dice();await publishTv("diceRolling",{teamName:team?.name,token:team?.token});for(let i=0;i<12;i++){setDice(1+Math.floor(Math.random()*6),1+Math.floor(Math.random()*6));await wait(60+i*6)}let d1=1+Math.floor(Math.random()*6),d2=1+Math.floor(Math.random()*6);setDice(d1,d2);diceBox.classList.remove("rolling");if(team.items.includes("dice")&&await askItem("dice")){team.items.splice(team.items.indexOf("dice"),1);if(d1<=d2)d1=6;else d2=6;setDice(d1,d2);sfx.item();toast("🎲 주사위 하나를 6으로 변경!")}let value=d1+d2;const isDouble=d1===d2;addLog(`${team.name}: 주사위 ${d1}+${d2}=${value}${isDouble?" (더블!)":""}`);if(team.boost){team.boost=false;value*=2;toast(`🚀 부스터! ${d1}+${d2} ×2 = ${value}칸 전진!`);addLog(`${team.name}: 부스터로 ${value}칸 전진`)}state.lastRoll=value;await publishTv("diceResult",{teamName:team.name,token:team.token,value,d1,d2,double:isDouble});$("#charge-fill").style.width="0";if(isDouble){state.extraTurn=true;sfx.item();toast("✨ 더블! 이번 턴이 끝나면 한 번 더!")}const from=team.position,target=Math.min(80,from+value);await moveTeam(team,target);if(target===80){finishGame(team);return}await resolveLanding(team,from)}
function askItem(key){return new Promise(resolve=>{const d=$("#item-dialog");$("#item-title").textContent=ITEMS[key][0];$("#item-message").textContent=ITEMS[key][1]+" 지금 사용할까요?";$("#item-use").onclick=()=>{d.close();resolve(true)};$("#item-skip").onclick=()=>{d.close();resolve(false)};d.showModal()})}

/* ── 착지 처리: 잡기 → 이벤트 칸 → 퀴즈 ───────────────────────── */
async function resolveCatch(team,from){if(team.position<=1||team.position>=80)return;for(const other of state.teams){if(other===team||other.active===false||other.position!==team.position)continue;if(other.items.includes("shield")){other.items.splice(other.items.indexOf("shield"),1);sfx.item();toast(`🛡️ ${other.name} 방어패로 잡기 방어!`);addLog(`${other.name}: 방어패 사용`);continue}other.position=Math.max(1,from);sfx.catch();await showEvent("💥","말을 잡았다!",`${team.name}이(가) ${other.name}의 말을 잡았습니다! ${other.name}은(는) ${Math.max(1,from)}칸으로 밀려납니다.`);addLog(`${team.name} ▶ ${other.name} 잡음!`);renderTokens()}}
async function handleEventCell(team,from,ev){
  if(ev.type==="luck"){await luckyEvent(team);return}
  if(ev.type==="bad"){await badEvent(team);return}
  if(ev.type==="ladder"){sfx.item();await showEvent("🪜","사다리 발견!",`${team.name}이(가) ${ev.to}칸까지 단숨에 올라갑니다!`);await moveTeam(team,ev.to,{sync:false});await resolveCatch(team,from);return}
  if(ev.type==="snake"){sfx.wrong();await showEvent("🐍","미끄럼틀!",`앗! ${team.name}이(가) ${ev.to}칸까지 미끄러집니다…`);await moveTeam(team,ev.to,{sync:false});return}
  if(ev.type==="forward"){sfx.item();await showEvent("⏩","순풍이 분다!",`${team.name}이(가) 3칸 더 전진합니다!`);await moveTeam(team,Math.min(79,team.position+3),{sync:false});await resolveCatch(team,from);return}
  if(ev.type==="shuffle"){sfx.catch();await showEvent("🌀","대혼란!","모든 팀의 위치가 뒤섞입니다!");const act=state.teams.filter(t=>t.active!==false),pos=shuffle(act.map(t=>t.position));act.forEach((t,i)=>t.position=pos[i]);renderTokens();addLog("🌀 전체 위치 셔플!");return}
  if(ev.type==="booster"){team.boost=true;sfx.item();await showEvent("🚀","부스터 장착!",`${team.name}의 다음 주사위 결과가 2배가 됩니다!`);addLog(`${team.name}: 부스터 획득`);return}
}
async function resolveLanding(team,from){await resolveCatch(team,from);const ev=(state.events||{})[team.position];if(ev){await handleEventCell(team,from,ev);endTurn();return}await askQuiz(team,from)}
function drawQuiz(){if(!state.quizzes.length)return null;if(!Array.isArray(state.deck)||!state.deck.length){state.deck=shuffle(state.quizzes.map(q=>q.id).filter(Boolean));addLog("문제 덱을 새로 섞었습니다.")}let q=null;while(state.deck.length&&!q){const id=state.deck.pop();q=state.quizzes.find(x=>x.id===id)||null}return q||state.quizzes[Math.floor(Math.random()*state.quizzes.length)]}
async function verifyQuizAnswer(q,answer,attemptNo){if(Number.isInteger(q.answer))return q.answer===answer;if(!online.roomId)throw new Error("온라인 게임방 연결이 필요합니다.");const playerAuth=online.isHost?auth:studentAuth,playerDb=online.isHost?db:studentDb,uid=playerAuth.currentUser.uid,attemptId=`${state.turnNonce}_${uid}_${attemptNo}`,attemptRef=doc(playerDb,"rooms",online.roomId,"attempts",attemptId),correctRef=doc(playerDb,"rooms",online.roomId,"correct",attemptId);await setDoc(attemptRef,{userId:uid,questionId:q.id,selectedAnswer:answer,createdAt:serverTimestamp()});try{await setDoc(correctRef,{userId:uid,questionId:q.id,createdAt:serverTimestamp()});return true}catch(error){if(error.code==="permission-denied")return false;throw error}}
async function askQuiz(team,from){const q=drawQuiz(),d=$("#quiz-dialog");if(!q){alert("등록된 퀴즈가 없습니다. 교사 대시보드에서 XLSX를 업로드하세요.");await moveTeam(team,from);endTurn();return}state.asked++;await publishTv("quiz",{teamName:team.name,token:team.token,category:q.category,difficulty:q.difficulty,html:sanitizeHtml(q.html),choices:q.choices,time:q.time||0});$("#quiz-category").textContent=`${q.category} · ${q.difficulty}`;$("#quiz-question").innerHTML=sanitizeHtml(q.html);$("#quiz-feedback").textContent="";let budget=1,answered=[],finished=false;if(team.items.includes("hint")&&await askItem("hint")){team.items.splice(team.items.indexOf("hint"),1);budget=2}$("#quiz-choices").innerHTML=q.choices.map((c,i)=>`<button type="button" class="quiz-choice" data-answer="${i+1}"><b>${i+1}.</b> ${escapeText(c)}</button>`).join("");const finish=async(correct,correctAnswer)=>{if(finished)return;finished=true;clearInterval(state.timer);$$('.quiz-choice').forEach((b,i)=>{b.disabled=true;if(i+1===(q.answer||correctAnswer))b.classList.add("correct")});if(correct){state.correct++;team.correct++;sfx.correct();$("#quiz-feedback").textContent="정답입니다! 이 땅을 차지했습니다.";await publishTv("quizResult",{teamName:team.name,correct:true,message:"정답입니다! 이 땅을 차지했습니다."});await wait(950);d.close();await onCorrect(team,from)}else{team.wrong++;sfx.wrong();state.wrongLog.push({id:q.id||null,team:team.name});$("#quiz-feedback").textContent="아쉽습니다. 원래 칸으로 돌아갑니다.";await publishTv("quizResult",{teamName:team.name,correct:false,message:"오답! 다른 팀에게 스틸 찬스가 열립니다."});await wait(950);d.close();const square=team.position;await moveTeam(team,from,{sync:false});if(!(await startSteal(team,square,q)))endTurn()}};$("#quiz-choices").onclick=async e=>{const b=e.target.closest("button");if(!b||b.disabled||finished)return;const a=+b.dataset.answer;if(answered.includes(a))return;answered.push(a);b.disabled=true;try{const correct=await verifyQuizAnswer(q,a,answered.length);if(correct){finish(true,a);return}b.classList.add("wrong");budget--;if(budget<=0){if(team.items.includes("retry")&&await askItem("retry")){team.items.splice(team.items.indexOf("retry"),1);budget=1;$("#quiz-feedback").textContent="재도전 기회!"}else finish(false)}}catch(error){$("#quiz-feedback").textContent=`채점 연결 오류: ${error.message}`;b.disabled=false;answered=answered.filter(x=>x!==a)}};if(q.time){let left=q.time;$("#quiz-timer").textContent=`⏱ ${left}초`;state.timer=setInterval(()=>{$("#quiz-timer").textContent=`⏱ ${--left}초`;if(left<=3&&left>0&&SND.sfxOn)tone(880,.08,"sine",.1);if(left<=0)finish(false)},1000)}else $("#quiz-timer").textContent="";d.showModal()}
async function onCorrect(team,from){const idx=state.teams.indexOf(team),owner=state.lands[team.position];if(owner!==null&&owner!==idx&&state.teams[owner]){const defender=state.teams[owner];if(defender.items.includes("shield")){defender.items.splice(defender.items.indexOf("shield"),1);sfx.item();toast(`🛡️ ${defender.name}이 방어패로 땅을 지켰습니다!`);addLog(`${defender.name}: 땅 방어 성공`)}else{state.lands[team.position]=idx;toast(`${defender.name}의 땅을 빼앗았습니다!`);addLog(`${team.name}이 ${defender.name}의 땅을 차지`)}}else{state.lands[team.position]=idx;toast("정답! 땅 차지 완료")}endTurn()}
function showEvent(icon,title,msg){publishTv("event",{icon,title,message:msg});return new Promise(r=>{const d=$("#event-dialog");$("#event-icon").textContent=icon;$("#event-title").textContent=title;$("#event-message").textContent=msg;$("#event-confirm").onclick=()=>{d.close();r()};d.showModal()})}
async function luckyEvent(team){const outcomes=["shield","retry","hint","dice","freeze"],item=outcomes[Math.floor(Math.random()*outcomes.length)];team.items.push(item);sfx.item();await showEvent("🍀","행운 칸!",`${ITEMS[item][0]} 획득 — ${ITEMS[item][1]}`);addLog(`${team.name}: ${ITEMS[item][0]} 획득`)}
async function badEvent(team){team.skip++;sfx.wrong();$("#board-shell").classList.add("shake");await wait(500);$("#board-shell").classList.remove("shake");await showEvent("🌩️","불운 칸!",`${team.name}은 다음 차례를 한 번 쉽니다.`);addLog(`${team.name}: 한 턴 쉼`)}
function endTurn(){state.locked=true;state.steal=null;stealUiKey="";syncState();setTimeout(()=>{if(checkTimeUp())return;if(state.extraTurn){state.extraTurn=false;addLog(`${state.teams[state.current].name}: 더블 보너스 턴!`)}else{let tries=0;do{state.current=(state.current+1)%state.teams.length;const t=state.teams[state.current];if(t.active===false)continue;if(t.skip){t.skip--;addLog(`${t.name}: 쉬어가는 차례`)}else break}while(++tries<state.teams.length*2)}state.turnNonce++;state.locked=false;renderGame();syncState()},650)}

/* ── 스틸 찬스(버저) ────────────────────────────────────────── */
function eligibleStealTeams(attackerIdx){return state.teams.map((t,i)=>i).filter(i=>i!==attackerIdx&&state.teams[i].active!==false&&state.teams[i].ownerUid)}
async function startSteal(team,square,q){
  if(!online.roomId||!q?.id)return false;
  const idx=state.teams.indexOf(team);
  const eligible=eligibleStealTeams(idx);
  if(!eligible.length)return false;
  state.steal={nonce:state.turnNonce,quizId:q.id,square,attacker:idx,phase:"rolling",rolls:{},order:[],idx:0,deadline:Date.now()+15000};
  sfx.buzzer();
  addLog(`⚡ 스틸 찬스! ${square}번 땅을 노려라`);
  publishTv("steal",{phase:"rolling",message:`${team.name} 오답! 다른 팀들은 주사위를 굴려 스틸에 도전하세요! (15초)`});
  renderGame();
  await syncState();
  return true;
}
async function submitStealRoll(){
  const my=online.teamIndex;if(my<0||online.isHost||!online.roomId)return;
  const btn=$("#steal-roll");btn.disabled=true;
  const value=1+Math.floor(Math.random()*6);sfx.dice();
  const ref=doc(studentDb,"rooms",online.roomId);
  try{
    await runTransaction(studentDb,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw new Error("게임방을 찾을 수 없습니다.");const s=snap.data().snapshot;if(!s.steal||s.steal.phase!=="rolling")throw new Error("스틸 시간이 끝났습니다.");const steal={...s.steal,rolls:{...s.steal.rolls,[my]:value}};tx.update(ref,{snapshot:{...s,steal,revision:(s.revision||0)+1},updatedAt:serverTimestamp()})});
    $("#steal-status").textContent=`내 주사위: ${value} — 결과를 기다리는 중…`;
  }catch(error){$("#steal-status").textContent=error.message;console.error("Steal roll failed",error)}
}
async function finalizeStealOrder(){
  const s=state.steal;if(!s||s.phase!=="rolling")return;
  const entries=Object.entries(s.rolls||{}).map(([i,v])=>({i:+i,v})).filter(e=>e.v>0);
  if(!entries.length){addLog("스틸 도전 팀 없음 — 턴을 넘깁니다.");publishTv("steal",{phase:"done",message:"도전한 팀이 없어 그냥 넘어갑니다."});endTurn();return}
  entries.sort((a,b)=>b.v-a.v||Math.random()-.5);
  state.steal={...s,phase:"answer",order:entries.map(e=>e.i),idx:0,deadline:Date.now()+30000};
  const first=state.teams[state.steal.order[0]];
  publishTv("steal",{phase:"answer",message:`🎲 ${first.name} 팀이 주사위 ${entries[0].v}(으)로 1순위 스틸 도전!`});
  addLog(`스틸 1순위: ${first.name} (주사위 ${entries[0].v})`);
  await syncState();renderGame();
}
async function advanceSteal(success){
  const s=state.steal;if(!s||s.phase!=="answer")return;
  if(success){
    const winner=s.order[s.idx],t=state.teams[winner];
    state.lands[s.square]=winner;t.correct++;state.correct++;
    sfx.correct();
    addLog(`⚡ ${t.name} 스틸 성공! ${s.square}번 땅 획득`);
    publishTv("steal",{phase:"done",message:`⚡ ${t.name} 스틸 성공! ${s.square}번 땅을 가져갑니다!`});
    endTurn();return;
  }
  const t=state.teams[s.order[s.idx]];if(t){t.wrong++;addLog(`${t.name} 스틸 실패`)}
  const next=s.idx+1;
  if(next>=s.order.length){publishTv("steal",{phase:"done",message:"모든 팀이 스틸에 실패했습니다."});endTurn();return}
  state.steal={...s,idx:next,deadline:Date.now()+30000};
  publishTv("steal",{phase:"answer",message:`다음 기회: ${state.teams[state.steal.order[next]].name} 팀!`});
  await syncState();renderGame();
}
let stealUiKey="";
function updateStealUi(){
  const s=state.steal,d=$("#steal-dialog"),myIdx=online.roomId&&!online.isHost?online.teamIndex:-1;
  if(!s){stealUiKey="";if(d.open)d.close();return}
  if(s.phase==="rolling"){
    if(myIdx>=0&&myIdx!==s.attacker&&state.teams[myIdx]?.active!==false){
      $("#steal-message").textContent=`${state.teams[s.attacker]?.name||"상대"} 팀이 틀렸습니다! 주사위가 높은 팀부터 도전합니다.`;
      if(s.rolls?.[myIdx]!=null){$("#steal-status").textContent=`내 주사위: ${s.rolls[myIdx]} — 결과를 기다리는 중…`;$("#steal-roll").disabled=true}
      else{$("#steal-status").textContent="";$("#steal-roll").disabled=false}
      if(!d.open){sfx.buzzer();d.showModal()}
    }else if(d.open)d.close();
    return;
  }
  if(s.phase==="answer"){
    if(d.open)d.close();
    const key=`ans_${s.nonce}_${s.idx}`;
    if(myIdx>=0&&s.order[s.idx]===myIdx&&stealUiKey!==key){stealUiKey=key;openStealQuiz()}
  }
}
async function openStealQuiz(){
  const s=state.steal;if(!s)return;
  const q=state.quizzes.find(x=>x.id===s.quizId);
  const d=$("#quiz-dialog");
  if(!q){await advanceSteal(false);return}
  $("#quiz-category").textContent=`⚡ 스틸 찬스 · ${q.category}`;
  $("#quiz-question").innerHTML=sanitizeHtml(q.html);
  $("#quiz-feedback").textContent="기회는 한 번! 신중하게 고르세요.";
  $("#quiz-timer").textContent="";
  $("#quiz-choices").innerHTML=q.choices.map((c,i)=>`<button type="button" class="quiz-choice" data-answer="${i+1}"><b>${i+1}.</b> ${escapeText(c)}</button>`).join("");
  let done=false;
  $("#quiz-choices").onclick=async e=>{
    const b=e.target.closest("button");if(!b||b.disabled||done)return;
    done=true;$$('.quiz-choice').forEach(x=>x.disabled=true);
    try{
      const correct=await verifyQuizAnswer(q,+b.dataset.answer,90+s.idx);
      b.classList.add(correct?"correct":"wrong");
      $("#quiz-feedback").textContent=correct?"⚡ 스틸 성공!":"아쉽습니다!";
      if(correct)sfx.correct();else sfx.wrong();
      await wait(900);d.close();
      await advanceSteal(correct);
    }catch(error){done=false;$$('.quiz-choice').forEach(x=>x.disabled=false);$("#quiz-feedback").textContent=`채점 연결 오류: ${error.message}`}
  };
  d.showModal();
}
function stealMaintenance(){
  const s=state.steal;if(!s||!online.roomId||online.status!=="playing"||state.finished)return;
  const attackerTeam=state.teams[s.attacker];
  const primary=!online.isHost&&online.teamIndex===s.attacker&&attackerTeam?.ownerUid===studentAuth.currentUser?.uid;
  const backup=online.isHost;
  if(s.phase==="rolling"){
    const eligible=eligibleStealTeams(s.attacker);
    const allRolled=eligible.length&&eligible.every(i=>s.rolls?.[i]!=null);
    if((primary&&(allRolled||Date.now()>s.deadline))||(backup&&(allRolled||Date.now()>s.deadline+4000)))finalizeStealOrder();
  }else if(s.phase==="answer"){
    if((primary&&Date.now()>s.deadline)||(backup&&Date.now()>s.deadline+4000)){addLog("스틸 응답 시간 초과");advanceSteal(false)}
  }
}

/* ── 승리 처리 ─────────────────────────────────────────────── */
function buildRanking(winnerIdx=null){const rows=state.teams.map((t,i)=>({t,i,score:teamScore(t,i)})).filter(r=>r.t.active!==false);if(winnerIdx==null)return rows.sort((a,b)=>b.score-a.score);const w=rows.find(r=>r.i===winnerIdx);return [w,...rows.filter(r=>r.i!==winnerIdx).sort((a,b)=>b.score-a.score)].filter(Boolean)}
function showWinner(){const f=state.finished;if(!f)return;const ranking=buildRanking(f.winner),w=ranking[0];if(!w)return;$("#winner-title").textContent=`${w.t.token} ${w.t.name} ${f.mode==="time"?"우승!":"승리!"}`;$("#winner-subtitle").textContent=f.mode==="time"?"수업 시간 종료! 점수(위치+땅×5+정답×3) 집계 결과입니다.":"역사의 흐름을 완주하고 역사왕이 되신 것을 축하합니다!";$("#winner-ranking").innerHTML=ranking.map((r,n)=>`<div class="rank-row ${n===0?'top':''}"><b>${n+1}위</b><span>${r.t.token} ${escapeText(r.t.name)}</span><strong>${r.score}점</strong></div>`).join("");sfx.win();fireConfetti();const d=$("#winner-dialog");if(!d.open)d.showModal();renderGame()}
function finishGame(team){if(state.finished)return;state.locked=true;state.steal=null;state.finished={winner:state.teams.indexOf(team),mode:"goal"};publishTv("winner",{teamName:team.name,token:team.token,message:`${team.name} 승리!`,ranking:buildRanking(state.finished.winner).map(r=>({name:r.t.name,token:r.t.token,score:r.score}))});showWinner();syncState()}
function finishByScore(){if(state.finished)return;state.locked=true;state.steal=null;const ranking=buildRanking();if(!ranking.length)return;state.finished={winner:ranking[0].i,mode:"time"};publishTv("winner",{teamName:ranking[0].t.name,token:ranking[0].t.token,message:`시간 종료! ${ranking[0].t.name} ${ranking[0].score}점 우승!`,ranking:ranking.map(r=>({name:r.t.name,token:r.t.token,score:r.score}))});showWinner();syncState()}
function checkTimeUp(){if(state.endsAt&&!state.finished&&Date.now()>=state.endsAt){finishByScore();return true}return false}
function updateClassTimer(){const els=[$("#class-timer"),$("#tv-timer")].filter(Boolean);if(!state.endsAt){els.forEach(el=>el.hidden=true);return}const left=Math.max(0,state.endsAt-Date.now()),m=Math.floor(left/60000),sec=Math.floor(left%60000/1000);els.forEach(el=>{el.hidden=false;el.textContent=`⏰ ${m}:${String(sec).padStart(2,"0")}`;el.classList.toggle("urgent",left<60000)})}
setInterval(()=>{updateClassTimer();stealMaintenance();if(online.isHost&&online.status==="playing"&&state.endsAt&&!state.finished&&Date.now()>=state.endsAt)finishByScore()},1000);

/* ── 교사 진행 도구 ─────────────────────────────────────────── */
$("#tool-skip").onclick=()=>{if(!online.isHost)return;if(!confirm("현재 팀의 턴을 강제로 넘길까요?"))return;state.extraTurn=false;state.steal=null;stealUiKey="";addLog("교사: 턴을 강제로 넘겼습니다.");publishTv("notice",{message:"선생님이 턴을 넘겼습니다."});endTurn()};
$("#tool-host").onclick=()=>{online.hostControl=!online.hostControl;renderGame();toast(online.hostControl?"대리 진행 ON — 교사가 현재 팀 대신 진행합니다":"대리 진행 OFF")};
$("#tool-steal-end").onclick=()=>{if(!state.steal){toast("진행 중인 스틸이 없습니다.");return}if(confirm("스틸 찬스를 강제로 종료하고 턴을 넘길까요?")){publishTv("steal",{phase:"done",message:"선생님이 스틸을 종료했습니다."});endTurn()}};
$("#tool-finish").onclick=()=>{if(confirm("지금 점수로 게임을 종료할까요? (위치+땅×5+정답×3)"))finishByScore()};
$("#team-list").addEventListener("click",e=>{const b=e.target.closest(".team-toggle");if(!b||!online.isHost)return;const i=+b.dataset.idx,t=state.teams[i];if(!t)return;if(t.active!==false){if(!confirm(`${t.name} 팀을 게임에서 제외할까요? (언제든 복귀 가능)`))return;t.active=false;addLog(`교사: ${t.name} 팀 제외`);if(state.current===i&&!state.finished){endTurn();return}}else{t.active=true;addLog(`교사: ${t.name} 팀 복귀`)}renderGame();syncState()});

/* ── 리포트 ────────────────────────────────────────────────── */
function wrongEntryQuiz(w){return state.quizzes.find(x=>x.id===w.id)||null}
function renderReport(){const accuracy=state.asked?Math.round(state.correct/state.asked*100):0;$("#report-summary").innerHTML=`<div class="summary-grid"><div class="summary-box"><b>${state.asked}</b><small>푼 문제</small></div><div class="summary-box"><b>${accuracy}%</b><small>정답률</small></div><div class="summary-box"><b>${state.wrongLog.length}</b><small>오답</small></div></div>`;$("#wrong-note").innerHTML=state.wrongLog.length?`<h3>오답 노트</h3>${state.wrongLog.map(w=>{const q=wrongEntryQuiz(w);if(!q)return `<div class="wrong-card"><b>${escapeText(w.team)}</b><div>문제 정보를 찾을 수 없습니다.</div></div>`;return `<div class="wrong-card"><b>${escapeText(w.team)} · ${escapeText(q.category)}</b><div>${sanitizeHtml(q.html)}</div><small>${Number.isInteger(q.answer)?`정답: ${q.answer}번 ${escapeText(q.choices[q.answer-1])}`:"정답은 교사 화면에서 확인하세요."}</small></div>`}).join("")}`:`<p class="empty">아직 기록된 오답이 없습니다.</p>`;$("#report-dialog").showModal()}
$("#download-wrong").onclick=()=>{if(!window.XLSX){alert("다운로드 도구를 불러오지 못했습니다.");return}if(!state.wrongLog.length){alert("기록된 오답이 없습니다.");return}const strip=h=>{const div=document.createElement("div");div.innerHTML=sanitizeHtml(h||"");return div.textContent.replace(/\s+/g," ").trim()};const rows=state.wrongLog.map(w=>{const q=wrongEntryQuiz(w)||{};return{"팀":w.team,"카테고리":q.category||"","난이도":q.difficulty||"","문제":strip(q.html),"정답":Number.isInteger(q.answer)?`${q.answer}번 ${q.choices?.[q.answer-1]??""}`:"(교사 로그인 후 다운로드하면 표시됩니다)"}});const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"오답노트");XLSX.writeFile(wb,`오답노트_${new Date().toISOString().slice(0,10)}.xlsx`)};

async function openTeacherDashboard(){
  const status=$("#teacher-auth-status");
  showScreen("teacher-screen");
  status.className="upload-result loading";
  status.textContent="교사 인증 완료 · 문제 은행을 불러오는 중입니다…";
  try{
    await loadQuizBank();
    status.className="upload-result success";
    status.textContent=`교사 인증 완료 · 문제 ${state.quizzes.length}개를 불러왔습니다.`;
  }catch(error){
    console.error("Teacher quiz bank load failed",error);
    status.className="upload-result error";
    status.textContent=`교사 로그인은 완료되었지만 문제 은행을 불러오지 못했습니다: ${error.message}`;
  }
}
async function teacherLogin(){
  if(auth.currentUser?.email?.toLowerCase()===TEACHER_EMAIL){await openTeacherDashboard();return}
  const d=$("#password-dialog");$("#teacher-password").value="";$("#password-error").textContent="";d.showModal();$("#teacher-password").focus();
}
async function submitTeacherAuth(){
  const password=$("#teacher-password").value;
  const errorBox=$("#password-error");
  const submit=$("#password-submit");
  if(password.length<8){errorBox.textContent="비밀번호는 8자 이상 입력하세요.";return}
  errorBox.textContent="로그인 중입니다…";
  submit.disabled=true;
  try{
    const credential=await signInWithEmailAndPassword(auth,TEACHER_EMAIL,password);
    if(credential.user.email?.toLowerCase()!==TEACHER_EMAIL){await signOut(auth);throw new Error("허용된 교사 계정이 아닙니다.")}
    $("#password-dialog").close();
    if(online.isHost&&online.roomId&&online.status==="lobby"){subscribeRoom();subscribePlayers();renderTeacherLobby();showScreen("teacher-lobby-screen")}
    else await openTeacherDashboard();
  }catch(error){
    console.error("Teacher sign-in failed",error);
    errorBox.textContent=error.code==="auth/invalid-credential"
      ? "등록된 교사 계정 또는 비밀번호를 확인하세요. 비밀번호를 모르면 아래에서 재설정할 수 있습니다."
      : `로그인 오류: ${error.message}`;
  }finally{submit.disabled=false}
}
async function resetTeacherPassword(){
  const errorBox=$("#password-error"),button=$("#password-reset");
  button.disabled=true;
  errorBox.textContent="재설정 메일을 요청하는 중입니다…";
  try{
    await sendPasswordResetEmail(auth,TEACHER_EMAIL);
    errorBox.textContent=`${TEACHER_EMAIL}로 비밀번호 재설정 메일을 요청했습니다. 받은편지함과 스팸함을 확인하세요.`;
  }catch(error){
    console.error("Teacher password reset failed",error);
    errorBox.textContent=`재설정 메일 요청 실패: ${error.message}`;
  }finally{button.disabled=false}
}
$("#password-submit").onclick=submitTeacherAuth;
$("#password-reset").onclick=resetTeacherPassword;
$("#teacher-password").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();submitTeacherAuth()}});
$("#join-submit").onclick=joinOnlineRoom;
$("#steal-roll").onclick=submitStealRoll;
$("#student-entry").onclick=()=>{$("#join-code").value="";$("#join-error").textContent="";$("#join-dialog").showModal()};$("#teacher-entry").onclick=teacherLogin;$$('.back-home').forEach(b=>b.onclick=()=>showScreen("home-screen"));$("#start-game").onclick=async()=>{try{resetGame();await createOnlineRoom();renderTeacherLobby();showScreen("teacher-lobby-screen");showRoomAccess()}catch(error){alert(`게임방 생성 실패: ${error.message}`)}};$("#teacher-start").onclick=()=>{online.isHost=true;setupTeams(4);showScreen("setup-screen")};$("#student-ready").onclick=markStudentReady;$("#host-start-game").onclick=startHostedGame;$("#teacher-player-list").onclick=e=>{const button=e.target.closest(".kick-player");if(button)kickPlayer(button.dataset.uid).catch(error=>alert(`강퇴 실패: ${error.message}`))};$("#room-access-button").onclick=showRoomAccess;$("#lobby-room-access").onclick=showRoomAccess;$("#copy-join-link").onclick=copyJoinLink;$("#exit-game").onclick=()=>showScreen("home-screen");$("#open-report").onclick=renderReport;$("#winner-report").onclick=()=>{$("#winner-dialog").close();renderReport()};
function openTv(preopened=null,keepDashboard=false){const url=new URL(location.href);url.search="";if(online.roomId)url.searchParams.set("room",online.roomId);url.hash="tv";if(preopened&&typeof preopened.closed==="boolean"&&!preopened.closed){preopened.location.href=url.toString();return true}const tab=window.open(url.toString(),"_blank");if(tab)return true;if(keepDashboard){alert("TV 중계 새 창이 차단됐습니다. 브라우저에서 이 사이트의 팝업을 허용한 뒤 TV 중계 버튼을 눌러주세요.");return false}location.href=url.toString();return false};$("#tv-button").onclick=()=>openTv();$("#teacher-tv").onclick=()=>openTv();$("#lobby-tv-button").onclick=()=>openTv();
const channel=new BroadcastChannel("history-exploration");
async function syncState(){
  const safe={teams:state.teams.map(({name,token,color,position,correct,active,id})=>({name,token,color,position,correct,active,id})),current:state.current,lastRoll:state.lastRoll,lands:[...state.lands],endsAt:state.endsAt||0,events:jsonClone(state.events)||{}};
  localStorage.setItem("history-game-state",JSON.stringify(safe));
  channel.postMessage(safe);
  if(online.roomId&&!online.applying){
    const playerDb=online.isHost?db:studentDb;
    state.revision++;
    try{await updateDoc(doc(playerDb,"rooms",online.roomId),{snapshot:publicSnapshot(),updatedAt:serverTimestamp()})}
    catch(error){console.error("Firestore sync failed",error)}
  }
}
channel.onmessage=e=>{if(location.hash==="#tv")applyTv(e.data)};
function applyTv(data){
  if(!data?.teams)return;
  state.teams=data.teams;
  state.current=data.current??0;
  state.lastRoll=data.lastRoll||0;
  state.lands=data.lands||state.lands;
  state.endsAt=data.endsAt||0;
  state.events=data.events||state.events;
  renderTokens();
  renderEvents();
  updateClassTimer();
}
function renderTvRank(){const box=$("#tv-rank");if(!box||location.hash!=="#tv")return;const rows=state.teams.map((t,i)=>({t,i,score:teamScore(t,i)})).filter(r=>r.t.active!==false).sort((a,b)=>b.score-a.score);const max=Math.max(1,...rows.map(r=>r.score));box.innerHTML=`<h3>실시간 순위</h3>${rows.map((r,n)=>`<div class="tv-rank-row"><span class="tv-rank-no">${n+1}</span><span class="tv-rank-token">${r.t.token}</span><div class="tv-rank-bar-wrap"><div class="tv-rank-bar" style="width:${Math.round(r.score/max*100)}%;background:${r.t.color}"></div><b>${escapeText(r.t.name)}</b></div><strong>${r.score}점</strong></div>`).join("")}`}
let tvDiceTimer=0,tvOverlayTimer=0,tvRoomUnsub=null,lastTvNonce="";
function setTvDiceRolling(teamName){
  const dice=$("#tv-dice");
  clearInterval(tvDiceTimer);
  $("#tv-dice-team").textContent=`${teamName||"현재 팀"} 주사위`;
  dice.classList.add("rolling");
  sfx.dice();
  tvDiceTimer=setInterval(()=>{dice.textContent=`${1+Math.floor(Math.random()*6)}·${1+Math.floor(Math.random()*6)}`},75);
}
function setTvDiceResult(teamName,value,d1,d2,isDouble){
  clearInterval(tvDiceTimer);
  const dice=$("#tv-dice");
  $("#tv-dice-team").textContent=`${teamName||"현재 팀"}${isDouble?" 더블!":" 결과"}`;
  dice.textContent=d1&&d2?`${d1}+${d2}=${value}`:(value||"–");
  dice.classList.remove("rolling");
}
function showTvOverlay(icon,title,body,className="",hideAfter=0){
  clearTimeout(tvOverlayTimer);
  const overlay=$("#tv-overlay");
  overlay.className=`tv-overlay ${className}`.trim();
  $("#tv-overlay-icon").textContent=icon||"";
  $("#tv-overlay-title").textContent=title||"";
  $("#tv-overlay-body").innerHTML=body||"";
  overlay.hidden=false;
  if(hideAfter)tvOverlayTimer=setTimeout(()=>{overlay.hidden=true},hideAfter);
}
let tvQuizTimer=0;
function renderTvEvent(event){
  const p=event?.payload||{};
  if(event.type==="diceRolling"){setTvDiceRolling(p.teamName);return}
  if(event.type==="diceResult"){setTvDiceResult(p.teamName,p.value,p.d1,p.d2,p.double);return}
  if(event.type==="quiz"){
    clearInterval(tvQuizTimer);
    const choices=(p.choices||[]).map((choice,index)=>`<div class="tv-choice"><b>${index+1}.</b> ${escapeText(choice)}</div>`).join("");
    const timerHtml=p.time?`<div class="tv-quiz-timer" id="tv-quiz-left">⏱ ${p.time}초</div>`:"";
    showTvOverlay("📚",`${p.teamName||""} 역사 퀴즈`,`${timerHtml}<div>${sanitizeHtml(p.html)}</div>${choices}`);
    if(p.time){let left=p.time;tvQuizTimer=setInterval(()=>{const el=$("#tv-quiz-left");if(!el||--left<0){clearInterval(tvQuizTimer);return}el.textContent=`⏱ ${left}초`},1000)}
    return;
  }
  if(event.type==="quizResult"){clearInterval(tvQuizTimer);if(p.correct)sfx.correct();else sfx.wrong();showTvOverlay(p.correct?"⭕":"❌",p.correct?"정답!":"오답",escapeText(p.message||""),p.correct?"result-good":"result-bad",3200);return}
  if(event.type==="steal"){sfx.buzzer();showTvOverlay("⚡","스틸 찬스!",escapeText(p.message||""),"steal-overlay",p.phase==="done"?3600:8000);return}
  if(event.type==="event"){sfx.item();showTvOverlay(p.icon||"✨",p.title,escapeText(p.message||""),"",6000);return}
  if(event.type==="notice"){showTvOverlay("📣","게임 알림",escapeText(p.message||""),"",2200);return}
  if(event.type==="winner"){sfx.win();fireConfetti();const ranking=(p.ranking||[]).map((r,n)=>`<div class="tv-choice"><b>${n+1}위</b> ${r.token||""} ${escapeText(r.name||"")} — ${r.score??"-"}점</div>`).join("");showTvOverlay("🏆",`${p.token||""} ${p.teamName||""} 승리!`,`${escapeText(p.message||"")}${ranking}`,"result-good");}
}
function subscribeTvRoom(roomId){
  tvRoomUnsub?.();
  $("#tv-status").textContent="게임방 실시간 연결 중…";
  tvRoomUnsub=onSnapshot(doc(db,"rooms",roomId),snap=>{
    if(!snap.exists()){ $("#tv-status").textContent="게임방을 찾을 수 없습니다.";return }
    const data=snap.data(),s=data.snapshot||{};
    state.teams=s.teams||state.teams;
    state.current=s.current||0;
    state.lastRoll=s.lastRoll||0;
    state.lands=s.lands||state.lands;
    state.endsAt=s.endsAt||0;
    state.events=s.events||state.events;
    renderTokens();renderEvents();updateClassTimer();
    if(data.tv?.nonce&&data.tv.nonce!==lastTvNonce){lastTvNonce=data.tv.nonce;renderTvEvent(data.tv)}
  },error=>{console.error("TV room subscription failed",error);$("#tv-status").textContent=`TV 실시간 연결 실패: ${error.message}`});
}
if(location.hash==="#tv"){
  showScreen("tv-screen");
  const tvRoomId=new URLSearchParams(location.search).get("room");
  if(tvRoomId)subscribeTvRoom(tvRoomId);
  else try{applyTv(JSON.parse(localStorage.getItem("history-game-state")))}catch{}
}else showScreen("home-screen");

function parseWorkbook(file){return new Promise((resolve,reject)=>{if(!window.XLSX)return reject(new Error("XLSX 라이브러리를 불러오지 못했습니다."));const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{try{const wb=XLSX.read(reader.result,{type:"array"}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});const req=["카테고리","난이도(하/중/고)","문제","선택지1","선택지2","선택지3","선택지4","선택지5","정답번호(1~5)"];if(!rows.length||req.some(k=>!(k in rows[0])))throw new Error("필수 열 이름이 양식과 다릅니다.");resolve(rows.map(r=>({category:String(r["카테고리"]),difficulty:String(r["난이도(하/중/고)"]),html:sanitizeHtml(r["문제"]),choices:[1,2,3,4,5].map(i=>String(r[`선택지${i}`])),answer:Number(r["정답번호(1~5)"]),time:Number(r["제한시간(초, 선택)"])||null})).filter(q=>q.answer>=1&&q.answer<=5))}catch(e){reject(e)}};reader.readAsArrayBuffer(file)})}
async function uploadQuizBank(qs){if(auth.currentUser?.email?.toLowerCase()!==TEACHER_EMAIL)throw new Error("교사 로그인 후 업로드할 수 있습니다.");const existing=await getDocs(query(collection(db,"quizPublic"),limit(500)));const batch=writeBatch(db);qs.forEach((q,i)=>{const id=`q${String(i+1).padStart(4,"0")}`;batch.set(doc(db,"quizPublic",id),{category:q.category,difficulty:q.difficulty,html:q.html,choices:q.choices,time:q.time||null,active:true,order:i+1,updatedAt:serverTimestamp()});batch.set(doc(db,"quizAnswers",id),{answer:q.answer,updatedAt:serverTimestamp()})});existing.docs.forEach(d=>{const n=Number(d.id.replace(/^q0*/,""));if(!n||n>qs.length)batch.set(doc(db,"quizPublic",d.id),{active:false,updatedAt:serverTimestamp()},{merge:true})});batch.set(doc(db,"metadata","quizBank"),{count:qs.length,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});await batch.commit()}
async function loadQuizBank(clientAuth=auth,clientDb=db){if(!clientAuth.currentUser)return;const publicDocs=await getDocs(query(collection(clientDb,"quizPublic"),limit(500)));const items=publicDocs.docs.map(d=>({id:d.id,...d.data()})).filter(q=>q.active!==false).sort((a,b)=>(a.order||0)-(b.order||0));if(clientAuth.currentUser.email?.toLowerCase()===TEACHER_EMAIL){const answerDocs=await getDocs(query(collection(clientDb,"quizAnswers"),limit(500))),answers=new Map(answerDocs.docs.map(d=>[d.id,d.data().answer]));items.forEach(q=>q.answer=answers.get(q.id))}state.quizzes=items;$("#question-count").textContent=items.length;return items}
$("#quiz-upload").onchange=async e=>{const out=$("#upload-result");try{out.textContent="업로드 및 정답 분리 저장 중…";const qs=await parseWorkbook(e.target.files[0]);await uploadQuizBank(qs);await loadQuizBank();out.textContent=`✅ ${qs.length}개 문제를 Firestore에 저장했습니다.`}catch(err){out.textContent=`❌ ${err.message}`}};
$("#download-template").onclick=()=>{if(!window.XLSX){alert("다운로드 도구를 불러오지 못했습니다.");return}const headers=[["카테고리","난이도(하/중/고)","문제","선택지1","선택지2","선택지3","선택지4","선택지5","정답번호(1~5)","제한시간(초, 선택)"]],ws=XLSX.utils.aoa_to_sheet(headers),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"문제_양식");XLSX.writeFile(wb,"한국사_퀴즈_빈양식.xlsx")};
setupTeams(4);updateOnlineBadges();updateSoundButtons();if(SND.bgmOn)SND.bgmTimer=setInterval(bgmLoop,700);
const sharedJoinCode=new URLSearchParams(location.search).get("join")?.trim().toUpperCase();
if(location.hash!=="#tv"&&/^[A-HJ-NP-Z2-9]{6}$/.test(sharedJoinCode||"")){$("#join-code").value=sharedJoinCode;$("#join-error").textContent="QR 접속 코드가 자동 입력되었습니다. 대기실 입장을 눌러주세요.";requestAnimationFrame(()=>$("#join-dialog").showModal())}
// 오프라인 스모크 테스트 모드: ?debugLocal 로 접속하면 Firebase 없이 전체 턴 루프를 점검할 수 있다.
if(location.hash!=="#tv"&&new URLSearchParams(location.search).has("debugLocal")){
  state.quizzes=Array.from({length:12},(_,i)=>({id:`debug${i}`,category:"디버그",difficulty:"하",html:`<p>${i+1}번 테스트 문제: 정답은 2번</p>`,choices:["오답1","정답","오답3","오답4","오답5"],answer:2,time:null}));
  setupTeams(2);resetGame();showScreen("game-screen");
}
