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
const state = { teams: [], current: 0, locked: true, lands: Array(81).fill(null), luck: new Set(), bad: new Set(), quizzes: [], wrong: [], asked: 0, correct: 0, activeSetupTeam: 0, lastRoll: 0, timer: null, turnNonce: 1, revision: 0 };
const online = { roomId: null, code: null, isHost: false, status: null, teamIndex: -1, players: [], unsub: null, playersUnsub: null, playerUnsub: null, applying: false };
const ITEMS = { shield:["방어패","상대의 땅 공격을 한 번 막습니다."], retry:["재도전권","오답일 때 한 번 더 답합니다."], hint:["쌍답권","정답을 두 개까지 고를 수 있습니다."], dice:["주사위 조작","굴린 뒤 숫자를 6으로 바꿉니다."], freeze:["멈춰라!","다른 팀 한 곳을 한 턴 쉬게 합니다."] };

function showScreen(id){ $$(".screen").forEach(x=>x.classList.toggle("active",x.id===id)); }
function escapeText(value){return String(value??"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]))}
function sanitizeHtml(html){ const doc=new DOMParser().parseFromString(String(html||""),"text/html"); const ok=new Set(["DIV","P","SPAN","BR","B","STRONG","EM","U","TABLE","TBODY","TR","TD","TH","UL","OL","LI","IMG"]); [...doc.body.querySelectorAll("*")].forEach(el=>{ if(!ok.has(el.tagName)){el.replaceWith(...el.childNodes);return;} [...el.attributes].forEach(a=>{if(a.name.startsWith("on")||!["class","colspan","rowspan","src","alt"].includes(a.name))el.removeAttribute(a.name);}); if(el.tagName==="IMG"&&!/^data:image\//.test(el.getAttribute("src")||""))el.remove(); }); return doc.body.innerHTML; }

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
  if(online.isHost||online.status!=="playing")return false;
  const team=state.teams[state.current];
  return !!team?.ownerUid&&team.ownerUid===studentAuth.currentUser?.uid&&state.current===online.teamIndex;
}
function publicSnapshot(){return{teams:state.teams.map(t=>({...t,items:[...t.items]})),current:state.current,locked:state.locked,lands:[...state.lands],luck:[...state.luck],bad:[...state.bad],asked:state.asked,correct:state.correct,lastRoll:state.lastRoll,turnNonce:state.turnNonce,revision:state.revision}}
function applySnapshot(s,navigate=false){if(!s)return;if((s.revision||0)>state.revision){online.applying=true;state.teams=s.teams||[];state.current=s.current||0;state.locked=!!s.locked;state.lands=s.lands||Array(81).fill(null);state.luck=new Set(s.luck||[]);state.bad=new Set(s.bad||[]);state.asked=s.asked||0;state.correct=s.correct||0;state.lastRoll=s.lastRoll||0;state.turnNonce=s.turnNonce||1;state.revision=s.revision||0;online.applying=false}if(navigate&&state.teams.length){renderGame();showScreen("game-screen")}updateOnlineBadges()}
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
function subscribeRoom(){online.unsub?.();if(!online.roomId)return;const roomDb=online.isHost?db:studentDb;online.unsub=onSnapshot(doc(roomDb,"rooms",online.roomId),snap=>{if(!snap.exists())return;const data=snap.data();online.status=data.status;online.code=data.code||online.code;applySnapshot(data.snapshot,data.status==="playing"&&!online.isHost);if(data.status==="lobby"){if(online.isHost){renderTeacherLobby();showScreen("teacher-lobby-screen")}else{renderStudentLobby();showScreen("student-lobby-screen")}}},error=>console.error("Room subscription failed",error))}
function subscribePlayers(){online.playersUnsub?.();if(!online.roomId||!online.isHost)return;online.playersUnsub=onSnapshot(collection(db,"rooms",online.roomId,"players"),snap=>{online.players=snap.docs.map(d=>({uid:d.id,...d.data()}));renderTeacherLobby()},error=>{$("#ready-summary-message").textContent="교사 실시간 연결 권한이 끊겼습니다. 다시 로그인해 주세요.";console.error("Teacher player subscription failed",error)})}
function subscribeOwnPlayer(){online.playerUnsub?.();if(!online.roomId||online.isHost)return;let existed=false;const kicked=()=>{if(!online.roomId)return;online.unsub?.();online.playerUnsub?.();online.roomId=null;online.code=null;alert("교사가 대기실에서 이 팀을 내보냈습니다.");showScreen("home-screen")};online.playerUnsub=onSnapshot(doc(studentDb,"rooms",online.roomId,"players",studentAuth.currentUser.uid),snap=>{if(snap.exists()){existed=true;const player=snap.data();online.teamIndex=player.teamIndex;renderStudentLobby(player)}else if(existed)kicked()},error=>{if(existed&&online.status==="lobby"){console.warn("Player listener closed after removal",error);kicked()}else console.error("Player listener failed",error)})}
function renderStudentLobby(player=null){if(online.teamIndex<0)return;const team=state.teams[online.teamIndex];if(!team)return;$("#student-lobby-code").textContent=online.code;$("#student-lobby-token").textContent=team.token;$("#student-lobby-title").textContent=`${online.teamIndex+1}번 팀 준비`;if(player&&!$("#lobby-team-name").value)$("#lobby-team-name").value=player.teamName||team.name;if(player?.members?.length&&!$("#lobby-member-names").value)$("#lobby-member-names").value=player.members.join("\n");const ready=!!player?.ready;$("#student-ready").disabled=ready;$("#student-ready").textContent=ready?"준비완료됨":"준비완료";$("#student-ready-status").textContent=ready?"준비완료! 선생님이 게임을 시작할 때까지 기다려 주세요.":"팀 정보를 입력하고 준비완료를 눌러주세요.";$("#student-ready-status").classList.toggle("ready",ready)}
function renderTeacherLobby(){if(!online.isHost)return;$("#teacher-lobby-code").textContent=online.code||"------";const players=online.players.filter(p=>p.role==="student"),byTeam=new Map(players.map(p=>[p.teamIndex,p])),ready=players.filter(p=>p.ready).length,total=state.teams.length;$("#ready-summary-count").textContent=`${ready} / ${total}팀`;$("#ready-summary-message").textContent=total&&ready===total?"모든 팀이 준비완료했습니다.":`${players.length}/${total}팀 입장 · ${total-ready}팀 미준비`;$("#teacher-player-list").innerHTML=state.teams.map((team,index)=>{const p=byTeam.get(index);return `<div class="lobby-player"><span class="pawn">${team.token||"🎒"}</span><div><b>${escapeText(p?.teamName||team.name||`${index+1}팀`)}</b><small>${p?.members?.length?escapeText(p.members.join(", ")):p?"팀원명 미입력":"학생 입장 대기"}</small></div><span class="ready-badge ${p?.ready?'done':''}">${p?.ready?'준비완료':p?'준비 중':'미입장'}</span>${p?`<button class="kick-player" data-uid="${escapeText(p.uid)}" type="button">강퇴</button>`:""}</div>`}).join("");updateOnlineBadges()}
async function createOnlineRoom(){online.isHost=true;online.status="lobby";online.players=[];online.roomId=crypto.randomUUID();for(let tries=0;tries<8;tries++){online.code=makeRoomCode();if(!(await getDoc(doc(db,"roomCodes",online.code))).exists())break}state.revision=1;state.locked=true;const snapshot=publicSnapshot();const batch=writeBatch(db);batch.set(doc(db,"rooms",online.roomId),{teacherId:auth.currentUser.uid,code:online.code,status:"lobby",snapshot,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});batch.set(doc(db,"roomCodes",online.code),{roomId:online.roomId,active:true,createdAt:serverTimestamp()});batch.set(doc(db,"rooms",online.roomId,"players",auth.currentUser.uid),{role:"teacher",teamIndex:-1,ready:true,joinedAt:serverTimestamp()});await batch.commit();subscribeRoom();subscribePlayers();updateOnlineBadges();try{await loadQuizBank()}catch(error){console.error("Quiz bank load after room creation failed",error)}}
async function joinOnlineRoom(){const errorBox=$("#join-error"),code=$("#join-code").value.trim().toUpperCase();if(code.length!==6){errorBox.textContent="6자리 입장 코드를 입력하세요.";return}errorBox.textContent="대기실에 입장하는 중입니다…";try{const studentUser=await ensureStudentAuth(),uid=studentUser.uid,codeSnap=await getDoc(doc(studentDb,"roomCodes",code));if(!codeSnap.exists()||!codeSnap.data().active)throw new Error("사용할 수 없는 입장 코드입니다.");const roomId=codeSnap.data().roomId,roomRef=doc(studentDb,"rooms",roomId),playerRef=doc(studentDb,"rooms",roomId,"players",uid);let joinedIndex=-1;await runTransaction(studentDb,async tx=>{const roomSnap=await tx.get(roomRef);if(!roomSnap.exists())throw new Error("게임방을 찾을 수 없습니다.");const data=roomSnap.data();if(data.status!=="lobby")throw new Error("이미 시작된 게임입니다.");const snapshot=data.snapshot,teams=snapshot.teams.map(t=>({...t}));joinedIndex=teams.findIndex(t=>t.ownerUid===uid);if(joinedIndex<0)joinedIndex=teams.findIndex(t=>!t.ownerUid);if(joinedIndex<0)throw new Error("모든 팀 자리가 찼습니다.");teams[joinedIndex].ownerUid=uid;const next={...snapshot,teams,revision:(snapshot.revision||0)+1};tx.set(playerRef,{role:"student",teamIndex:joinedIndex,teamName:teams[joinedIndex].name,members:[],ready:false,joinedAt:serverTimestamp()},{merge:true});tx.update(roomRef,{snapshot:next,updatedAt:serverTimestamp()})});online.roomId=roomId;online.code=code;online.status="lobby";online.teamIndex=joinedIndex;online.isHost=false;state.revision=0;subscribeRoom();subscribeOwnPlayer();try{await loadQuizBank(studentAuth,studentDb)}catch(error){console.error("Student quiz bank load failed",error)}$("#join-dialog").close();renderStudentLobby();showScreen("student-lobby-screen");updateOnlineBadges()}catch(error){console.error("Student lobby join failed",error);errorBox.textContent=error.message}}
async function markStudentReady(){const teamName=$("#lobby-team-name").value.trim(),members=$("#lobby-member-names").value.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean),status=$("#student-ready-status");if(!teamName){status.textContent="팀명을 입력하세요.";return}if(!members.length){status.textContent="팀원명을 한 명 이상 입력하세요.";return}$("#student-ready").disabled=true;status.textContent="준비 상태를 저장하는 중입니다…";try{const uid=studentAuth.currentUser.uid,roomRef=doc(studentDb,"rooms",online.roomId),playerRef=doc(studentDb,"rooms",online.roomId,"players",uid);await runTransaction(studentDb,async tx=>{const roomSnap=await tx.get(roomRef);if(!roomSnap.exists()||roomSnap.data().status!=="lobby")throw new Error("대기 중인 게임방이 아닙니다.");const snapshot=roomSnap.data().snapshot,teams=snapshot.teams.map(t=>({...t}));teams[online.teamIndex]={...teams[online.teamIndex],name:teamName,ownerUid:uid};tx.update(roomRef,{snapshot:{...snapshot,teams,revision:(snapshot.revision||0)+1},updatedAt:serverTimestamp()});tx.set(playerRef,{role:"student",teamIndex:online.teamIndex,teamName,members,ready:true,readyAt:serverTimestamp()},{merge:true})});status.textContent="준비완료! 선생님이 게임을 시작할 때까지 기다려 주세요.";status.classList.add("ready")}catch(error){console.error("Student ready update failed",error);status.textContent=`준비 상태 저장 실패: ${error.message}`;$("#student-ready").disabled=false}}
async function kickPlayer(uid){if(!online.isHost||!confirm("이 팀을 대기실에서 강퇴할까요?"))return;const roomRef=doc(db,"rooms",online.roomId),playerRef=doc(db,"rooms",online.roomId,"players",uid);await runTransaction(db,async tx=>{const roomSnap=await tx.get(roomRef);if(!roomSnap.exists())return;const snapshot=roomSnap.data().snapshot,teams=snapshot.teams.map((t,i)=>t.ownerUid===uid?{...t,name:`${i+1}팀`,ownerUid:null}:{...t});tx.update(roomRef,{snapshot:{...snapshot,teams,revision:(snapshot.revision||0)+1},updatedAt:serverTimestamp()});tx.delete(playerRef)})}
async function startHostedGame(){if(!online.isHost||!online.roomId)return;if(auth.currentUser?.email?.toLowerCase()!==TEACHER_EMAIL){alert("교사 인증 세션이 만료됐습니다. 다시 로그인한 뒤 게임 시작을 눌러주세요.");teacherLogin();return}const ready=online.players.filter(p=>p.role==="student"&&p.ready).length,notReady=Math.max(0,state.teams.length-ready);if(notReady&&!confirm(`${notReady}팀이 아직 준비완료하지 않았습니다. 그래도 게임을 시작할까요?`))return;const tvWindow=window.open("about:blank","history-tv");try{const roomRef=doc(db,"rooms",online.roomId),next=await runTransaction(db,async tx=>{const roomSnap=await tx.get(roomRef);if(!roomSnap.exists())throw new Error("게임방을 찾을 수 없습니다.");const snapshot=roomSnap.data().snapshot,started={...snapshot,locked:false,revision:(snapshot.revision||0)+1};tx.update(roomRef,{status:"playing",snapshot:started,startedAt:serverTimestamp(),updatedAt:serverTimestamp()});return started});online.status="playing";state.revision=0;applySnapshot(next,false);showScreen("teacher-screen");updateOnlineBadges();syncState();openTv(tvWindow,true)}catch(error){tvWindow?.close();console.error("Host game start failed",error);alert(`게임 시작 실패: ${error.message}`)}}

function cat(p0,p1,p2,p3,t){const t2=t*t,t3=t2*t;return [.5*(2*p1[0]+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),.5*(2*p1[1]+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)];}
function boardPositions(){const cp=[[1450,720],[1170,735],[820,735],[460,730],[185,665],[160,500],[330,435],[650,520],[920,550],[1210,500],[1435,430],[1430,245],[1240,170],[980,170],[800,175]],dense=[];for(let i=0;i<cp.length-1;i++)for(let j=0;j<100;j++)dense.push(cat(cp[Math.max(0,i-1)],cp[i],cp[i+1],cp[Math.min(cp.length-1,i+2)],j/100));dense.push(cp.at(-1));const len=[0];for(let i=1;i<dense.length;i++)len.push(len.at(-1)+Math.hypot(dense[i][0]-dense[i-1][0],dense[i][1]-dense[i-1][1]));const out=[];let c=0;for(let i=0;i<80;i++){const target=len.at(-1)*i/79;while(len[c+1]<target)c++;const r=(target-len[c])/(len[c+1]-len[c]),a=dense[c],b=dense[c+1];out.push({x:(a[0]+(b[0]-a[0])*r)/16,y:(a[1]+(b[1]-a[1])*r)/9});}return out;}
const POS=boardPositions();

function setupTeams(count=4){const old=state.teams;state.teams=Array.from({length:count},(_,i)=>old[i]||{id:crypto.randomUUID(),name:`${i+1}팀`,token:TOKENS[i],color:TEAM_COLORS[i],position:1,items:[],skip:0,correct:0,wrong:0,ownerUid:null});state.activeSetupTeam=Math.min(state.activeSetupTeam,count-1);renderSetup();}
function renderSetup(){ $("#team-count").innerHTML=[4,5,6,7,8].map(n=>`<button class="${state.teams.length===n?'active':''}" data-count="${n}">${n}</button>`).join(""); $("#team-fields").innerHTML=state.teams.map((t,i)=>`<div class="team-field ${i===state.activeSetupTeam?'active':''}" data-team="${i}"><button>${t.token}</button><input value="${escapeText(t.name)}" maxlength="12" aria-label="${i+1}팀 이름"></div>`).join(""); $("#active-team-label").textContent=`${state.teams[state.activeSetupTeam].name}의 말 선택`; $("#token-picker").innerHTML=TOKENS.map(x=>`<button class="token-choice ${state.teams[state.activeSetupTeam].token===x?'selected':''}" data-token="${x}">${x}</button>`).join("");}
$("#team-count").onclick=e=>{const n=+e.target.dataset.count;if(n)setupTeams(n)};$("#team-fields").onclick=e=>{const row=e.target.closest(".team-field");if(row){state.activeSetupTeam=+row.dataset.team;renderSetup()}};$("#team-fields").oninput=e=>{const row=e.target.closest(".team-field");if(row&&e.target.tagName==="INPUT"){state.teams[+row.dataset.team].name=e.target.value||`${+row.dataset.team+1}팀`;$("#active-team-label").textContent=`${state.teams[state.activeSetupTeam].name}의 말 선택`}};$("#token-picker").onclick=e=>{if(e.target.dataset.token){state.teams[state.activeSetupTeam].token=e.target.dataset.token;renderSetup()}};

function shuffle(a){return [...a].sort(()=>Math.random()-.5)}
function resetGame(){state.current=0;state.locked=false;state.lands=Array(81).fill(null);state.wrong=[];state.asked=state.correct=0;state.turnNonce=1;state.revision=0;state.teams.forEach((t,i)=>Object.assign(t,{position:1,items:[],skip:0,correct:0,wrong:0,color:TEAM_COLORS[i],ownerUid:t.ownerUid||null}));const spots=shuffle(Array.from({length:72},(_,i)=>i+5));state.luck=new Set(spots.slice(0,3));state.bad=new Set(spots.slice(3,6));renderGame();addLog("80칸 역사 탐험을 시작합니다!")}
function renderGame(){const team=state.teams[state.current];if(!team)return;$("#turn-banner").innerHTML=`<span style="color:${team.color}">${team.token} ${escapeText(team.name)}</span>의 차례`;$("#dice-owner").textContent=`${team.name}의 주사위`;$("#team-list").innerHTML=state.teams.map((t,i)=>`<div class="team-card ${i===state.current?'current':''}"><span class="pawn">${t.token}</span><div><b>${escapeText(t.name)}</b><small>${t.position}칸 · 땅 ${state.lands.filter(x=>x===i).length}개${t.ownerUid?' · 접속':' · 대기'}</small></div>${t.skip?'<span class="skip">한 턴 쉼</span>':''}</div>`).join("");renderTokens();renderLands();renderInventory();const myTurn=canCurrentStudentAct();$("#roll-button").disabled=state.locked||!myTurn;updateOnlineBadges()}
function renderTokens(){const layers=[$("#token-layer"),$("#tv-token-layer")].filter(Boolean);layers.forEach(layer=>layer.innerHTML="");state.teams.forEach((t,i)=>layers.forEach(layer=>{const p=POS[t.position-1],el=document.createElement("div");el.className="player-token";el.textContent=t.token;el.title=`${t.name} ${t.position}칸`;el.style.cssText=`--team-color:${t.color};left:${p.x}%;top:${p.y}%;margin-left:${(i%4-1.5)*7}px;margin-top:${Math.floor(i/4)*7}px`;layer.append(el)}));if($("#tv-status"))$("#tv-status").textContent=`${state.teams[state.current]?.name||"게임"} 차례 · 최근 주사위 ${state.lastRoll||"-"}`;}
function renderLands(){const layer=$("#land-layer");layer.innerHTML="";state.lands.forEach((owner,n)=>{if(owner!==null&&n>1){const p=POS[n-1],el=document.createElement("i");el.className="land-mark";el.style.cssText=`--team-color:${state.teams[owner].color};left:${p.x}%;top:${p.y}%`;layer.append(el)}})}
function renderInventory(){const t=state.teams[state.current],box=$("#inventory");box.innerHTML=t.items.length?`<div class="inventory-items">${t.items.map(k=>`<span class="item-chip">${ITEMS[k][0]}</span>`).join("")}</div>`:`<p class="empty">아직 획득한 아이템이 없습니다.</p>`}
function addLog(text){const li=document.createElement("li");li.textContent=text;$("#game-log").prepend(li);while($("#game-log").children.length>12)$("#game-log").lastChild.remove()}
async function publishTv(type,payload={}){
  if(!online.roomId)return;
  const roomDb=online.isHost?db:studentDb;
  try{await updateDoc(doc(roomDb,"rooms",online.roomId),{tv:{type,payload,nonce:crypto.randomUUID(),sentAt:Date.now()},updatedAt:serverTimestamp()})}
  catch(error){console.error("TV event publish failed",error)}
}
function toast(text){const el=$("#board-toast");el.textContent=text;el.classList.add("show");publishTv("notice",{message:text});setTimeout(()=>el.classList.remove("show"),1200)}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function moveTeam(team,target){while(team.position!==target){team.position+=Math.sign(target-team.position);renderTokens();document.querySelectorAll(".player-token")[state.teams.indexOf(team)]?.classList.add("moving");await syncState();await wait(320)}renderGame();}

let pressStart=0,chargeFrame=0,autoRoll=0;function beginCharge(e){if(state.locked||!canCurrentStudentAct())return;e.preventDefault();pressStart=performance.now();state.locked=true;$("#roll-button").classList.add("charging");const tick=()=>{const p=Math.min(1,(performance.now()-pressStart)/2000);$("#charge-fill").style.width=`${p*100}%`;if(p<1)chargeFrame=requestAnimationFrame(tick);else rollDice()};chargeFrame=requestAnimationFrame(tick);autoRoll=setTimeout(()=>rollDice(),2050)}function releaseCharge(e){if(!pressStart)return;e.preventDefault();rollDice()}
$("#roll-button").addEventListener("pointerdown",beginCharge);window.addEventListener("pointerup",releaseCharge);
async function rollDice(){if(!pressStart)return;if(!canCurrentStudentAct()){pressStart=0;state.locked=false;renderGame();return;}pressStart=0;cancelAnimationFrame(chargeFrame);clearTimeout(autoRoll);$("#roll-button").classList.remove("charging");const dice=$("#dice");dice.classList.add("rolling");await publishTv("diceRolling",{teamName:state.teams[state.current]?.name,token:state.teams[state.current]?.token});for(let i=0;i<12;i++){dice.textContent=1+Math.floor(Math.random()*6);await wait(70+i*6)}let value=1+Math.floor(Math.random()*6);dice.textContent=value;dice.classList.remove("rolling");state.lastRoll=value;await publishTv("diceResult",{teamName:state.teams[state.current]?.name,token:state.teams[state.current]?.token,value});$("#charge-fill").style.width="0";const team=state.teams[state.current];addLog(`${team.name}: 주사위 ${value}`);if(team.items.includes("dice")){const use=await askItem("dice");if(use){team.items.splice(team.items.indexOf("dice"),1);value=6;state.lastRoll=6;dice.textContent=6;await publishTv("diceResult",{teamName:team.name,token:team.token,value:6});toast("주사위가 6으로 변경!")}}const from=team.position,target=Math.min(80,from+value);await moveTeam(team,target);if(target===80){finishGame(team);return}await resolveLanding(team,from)}
function askItem(key){return new Promise(resolve=>{const d=$("#item-dialog");$("#item-title").textContent=ITEMS[key][0];$("#item-message").textContent=ITEMS[key][1]+" 지금 사용할까요?";$("#item-use").onclick=()=>{d.close();resolve(true)};$("#item-skip").onclick=()=>{d.close();resolve(false)};d.showModal()})}

async function resolveLanding(team,from){if(state.luck.has(team.position)){await luckyEvent(team);endTurn();return}if(state.bad.has(team.position)){await badEvent(team);endTurn();return}askQuiz(team,from)}
function randomQuiz(){return state.quizzes[Math.floor(Math.random()*state.quizzes.length)]||null}
function normalizeQuiz(q){if(Array.isArray(q))return{category:q[0],difficulty:q[1],html:q[2],choices:q[3],answer:q[4],time:null};return q}
async function verifyQuizAnswer(q,answer,attemptNo){if(Number.isInteger(q.answer))return q.answer===answer;if(!online.roomId)throw new Error("온라인 게임방 연결이 필요합니다.");const playerAuth=online.isHost?auth:studentAuth,playerDb=online.isHost?db:studentDb,uid=playerAuth.currentUser.uid,attemptId=`${state.turnNonce}_${uid}_${attemptNo}`,attemptRef=doc(playerDb,"rooms",online.roomId,"attempts",attemptId),correctRef=doc(playerDb,"rooms",online.roomId,"correct",attemptId);await setDoc(attemptRef,{userId:uid,questionId:q.id,selectedAnswer:answer,createdAt:serverTimestamp()});try{await setDoc(correctRef,{userId:uid,questionId:q.id,createdAt:serverTimestamp()});return true}catch(error){if(error.code==="permission-denied")return false;throw error}}
async function askQuiz(team,from){const q=randomQuiz(),d=$("#quiz-dialog");if(!q){alert("등록된 퀴즈가 없습니다. 교사 대시보드에서 XLSX를 업로드하세요.");await moveTeam(team,from);endTurn();return}state.asked++;await publishTv("quiz",{teamName:team.name,token:team.token,category:q.category,difficulty:q.difficulty,html:sanitizeHtml(q.html),choices:q.choices});$("#quiz-category").textContent=`${q.category} · ${q.difficulty}`;$("#quiz-question").innerHTML=sanitizeHtml(q.html);$("#quiz-feedback").textContent="";let budget=1,answered=[];if(team.items.includes("hint")&&await askItem("hint")){team.items.splice(team.items.indexOf("hint"),1);budget=2}$("#quiz-choices").innerHTML=q.choices.map((c,i)=>`<button type="button" class="quiz-choice" data-answer="${i+1}"><b>${i+1}.</b> ${escapeText(c)}</button>`).join("");const finish=async(correct,correctAnswer)=>{clearInterval(state.timer);$$('.quiz-choice').forEach((b,i)=>{b.disabled=true;if(i+1===(q.answer||correctAnswer))b.classList.add("correct")});if(correct){state.correct++;team.correct++;$("#quiz-feedback").textContent="정답입니다! 이 땅을 차지했습니다.";await publishTv("quizResult",{teamName:team.name,correct:true,message:"정답입니다! 이 땅을 차지했습니다."});await wait(950);d.close();await onCorrect(team,from)}else{team.wrong++;state.wrong.push({...q,team:team.name});$("#quiz-feedback").textContent="아쉽습니다. 원래 칸으로 돌아갑니다.";await publishTv("quizResult",{teamName:team.name,correct:false,message:"오답입니다. 원래 칸으로 돌아갑니다."});await wait(950);d.close();await moveTeam(team,from);endTurn()}};$("#quiz-choices").onclick=async e=>{const b=e.target.closest("button");if(!b||b.disabled)return;const a=+b.dataset.answer;if(answered.includes(a))return;answered.push(a);b.disabled=true;try{const correct=await verifyQuizAnswer(q,a,answered.length);if(correct){finish(true,a);return}b.classList.add("wrong");budget--;if(budget<=0){if(team.items.includes("retry")&&await askItem("retry")){team.items.splice(team.items.indexOf("retry"),1);budget=1;$("#quiz-feedback").textContent="재도전 기회!"}else finish(false)}}catch(error){$("#quiz-feedback").textContent=`채점 연결 오류: ${error.message}`;b.disabled=false}};if(q.time){let left=q.time;$("#quiz-timer").textContent=`⏱ ${left}초`;state.timer=setInterval(()=>{$("#quiz-timer").textContent=`⏱ ${--left}초`;if(left<=0)finish(false)},1000)}else $("#quiz-timer").textContent="";d.showModal()}
async function onCorrect(team,from){const idx=state.teams.indexOf(team),owner=state.lands[team.position];if(owner!==null&&owner!==idx){const defender=state.teams[owner];if(defender.items.includes("shield")){defender.items.splice(defender.items.indexOf("shield"),1);toast(`${defender.name}이 방어패 사용!`);addLog(`${defender.name}의 땅 방어 성공`)}else{defender.position=from;state.lands[team.position]=idx;toast(`${defender.name}과 자리 교환!`);addLog(`${team.name}이 ${defender.name}의 땅을 차지`);renderTokens()}}else{state.lands[team.position]=idx;toast("정답! 땅 차지 완료")}endTurn()}
function showEvent(icon,title,msg){publishTv("event",{icon,title,message:msg});return new Promise(r=>{const d=$("#event-dialog");$("#event-icon").textContent=icon;$("#event-title").textContent=title;$("#event-message").textContent=msg;$("#event-confirm").onclick=()=>{d.close();r()};d.showModal()})}
async function luckyEvent(team){const outcomes=["shield","retry","hint","dice","freeze"],item=outcomes[Math.floor(Math.random()*outcomes.length)];team.items.push(item);await showEvent("🍀","비밀 행운 칸!",`${ITEMS[item][0]} 획득 — ${ITEMS[item][1]}`);addLog(`${team.name}: ${ITEMS[item][0]} 획득`)}
async function badEvent(team){team.skip++;$("#board-shell").classList.add("shake");await wait(500);$("#board-shell").classList.remove("shake");await showEvent("🌩️","비밀 불운 칸!",`${team.name}은 다음 차례를 한 번 쉽니다.`);addLog(`${team.name}: 한 턴 쉼`)}
function endTurn(){state.locked=true;syncState();setTimeout(()=>{let tries=0;do{state.current=(state.current+1)%state.teams.length;if(state.teams[state.current].skip){state.teams[state.current].skip--;addLog(`${state.teams[state.current].name}: 쉬어가는 차례`)}else break}while(++tries<state.teams.length);state.turnNonce++;state.locked=false;renderGame();syncState()},650)}
function finishGame(team){state.locked=true;publishTv("winner",{teamName:team.name,token:team.token,message:`${team.name} 승리!`});$("#winner-title").textContent=`${team.token} ${team.name} 승리!`;$("#winner-dialog").showModal();syncState()}

function renderReport(){const accuracy=state.asked?Math.round(state.correct/state.asked*100):0;$("#report-summary").innerHTML=`<div class="summary-grid"><div class="summary-box"><b>${state.asked}</b><small>푼 문제</small></div><div class="summary-box"><b>${accuracy}%</b><small>정답률</small></div><div class="summary-box"><b>${state.wrong.length}</b><small>오답</small></div></div>`;$("#wrong-note").innerHTML=state.wrong.length?`<h3>오답 노트</h3>${state.wrong.map(q=>`<div class="wrong-card"><b>${escapeText(q.team)} · ${escapeText(q.category)}</b><div>${sanitizeHtml(q.html)}</div><small>${Number.isInteger(q.answer)?`정답: ${q.answer}번 ${escapeText(q.choices[q.answer-1])}`:"정답은 교사 화면에서 확인하세요."}</small></div>`).join("")}`:`<p class="empty">아직 기록된 오답이 없습니다.</p>`;$("#report-dialog").showModal()}

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
$("#student-entry").onclick=()=>{$("#join-code").value="";$("#join-error").textContent="";$("#join-dialog").showModal()};$("#teacher-entry").onclick=teacherLogin;$$('.back-home').forEach(b=>b.onclick=()=>showScreen("home-screen"));$("#start-game").onclick=async()=>{try{resetGame();await createOnlineRoom();renderTeacherLobby();showScreen("teacher-lobby-screen");showRoomAccess()}catch(error){alert(`게임방 생성 실패: ${error.message}`)}};$("#teacher-start").onclick=()=>{online.isHost=true;setupTeams(4);showScreen("setup-screen")};$("#student-ready").onclick=markStudentReady;$("#host-start-game").onclick=startHostedGame;$("#teacher-player-list").onclick=e=>{const button=e.target.closest(".kick-player");if(button)kickPlayer(button.dataset.uid).catch(error=>alert(`강퇴 실패: ${error.message}`))};$("#room-access-button").onclick=showRoomAccess;$("#lobby-room-access").onclick=showRoomAccess;$("#copy-join-link").onclick=copyJoinLink;$("#exit-game").onclick=()=>showScreen("home-screen");$("#open-report").onclick=renderReport;$("#winner-report").onclick=()=>{$("#winner-dialog").close();renderReport()};
function openTv(preopened=null,keepDashboard=false){const url=new URL(location.href);url.search="";if(online.roomId)url.searchParams.set("room",online.roomId);url.hash="tv";if(preopened&&typeof preopened.closed==="boolean"&&!preopened.closed){preopened.location.href=url.toString();return true}const tab=window.open(url.toString(),"_blank");if(tab)return true;if(keepDashboard){alert("TV 중계 새 창이 차단됐습니다. 브라우저에서 이 사이트의 팝업을 허용한 뒤 TV 중계 버튼을 눌러주세요.");return false}location.href=url.toString();return false};$("#tv-button").onclick=()=>openTv();$("#teacher-tv").onclick=()=>openTv();$("#lobby-tv-button").onclick=()=>openTv();
const channel=new BroadcastChannel("history-exploration");
async function syncState(){
  const safe={teams:state.teams.map(({name,token,color,position})=>({name,token,color,position})),current:state.current,lastRoll:state.lastRoll};
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
  renderTokens();
}
let tvDiceTimer=0,tvOverlayTimer=0,tvRoomUnsub=null,lastTvNonce="";
function setTvDiceRolling(teamName){
  const dice=$("#tv-dice");
  clearInterval(tvDiceTimer);
  $("#tv-dice-team").textContent=`${teamName||"현재 팀"} 주사위`;
  dice.classList.add("rolling");
  tvDiceTimer=setInterval(()=>{dice.textContent=1+Math.floor(Math.random()*6)},75);
}
function setTvDiceResult(teamName,value){
  clearInterval(tvDiceTimer);
  const dice=$("#tv-dice");
  $("#tv-dice-team").textContent=`${teamName||"현재 팀"} 결과`;
  dice.textContent=value||"–";
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
function renderTvEvent(event){
  const p=event?.payload||{};
  if(event.type==="diceRolling"){setTvDiceRolling(p.teamName);return}
  if(event.type==="diceResult"){setTvDiceResult(p.teamName,p.value);return}
  if(event.type==="quiz"){
    const choices=(p.choices||[]).map((choice,index)=>`<div class="tv-choice"><b>${index+1}.</b> ${escapeText(choice)}</div>`).join("");
    showTvOverlay("📚",`${p.teamName||""} 역사 퀴즈`,`<div>${sanitizeHtml(p.html)}</div>${choices}`);
    return;
  }
  if(event.type==="quizResult"){showTvOverlay(p.correct?"⭕":"❌",p.correct?"정답!":"오답",escapeText(p.message||""),p.correct?"result-good":"result-bad",3200);return}
  if(event.type==="event"){showTvOverlay(p.icon||"✨",p.title,escapeText(p.message||""),"",6000);return}
  if(event.type==="notice"){showTvOverlay("📣","게임 알림",escapeText(p.message||""),"",2200);return}
  if(event.type==="winner"){showTvOverlay("🏆",`${p.token||""} ${p.teamName||""} 승리!`,escapeText(p.message||""),"result-good");}
}
function subscribeTvRoom(roomId){
  tvRoomUnsub?.();
  $("#tv-status").textContent="게임방 실시간 연결 중…";
  tvRoomUnsub=onSnapshot(doc(db,"rooms",roomId),snap=>{
    if(!snap.exists()){ $("#tv-status").textContent="게임방을 찾을 수 없습니다.";return }
    const data=snap.data();
    applyTv(data.snapshot);
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
async function uploadQuizBank(qs){if(auth.currentUser?.email?.toLowerCase()!==TEACHER_EMAIL)throw new Error("교사 로그인 후 업로드할 수 있습니다.");const batch=writeBatch(db);qs.forEach((q,i)=>{const id=`q${String(i+1).padStart(4,"0")}`;batch.set(doc(db,"quizPublic",id),{category:q.category,difficulty:q.difficulty,html:q.html,choices:q.choices,time:q.time||null,active:true,order:i+1,updatedAt:serverTimestamp()});batch.set(doc(db,"quizAnswers",id),{answer:q.answer,updatedAt:serverTimestamp()})});batch.set(doc(db,"metadata","quizBank"),{count:qs.length,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});await batch.commit()}
async function loadQuizBank(clientAuth=auth,clientDb=db){if(!clientAuth.currentUser)return;const publicDocs=await getDocs(query(collection(clientDb,"quizPublic"),limit(500)));const items=publicDocs.docs.map(d=>({id:d.id,...d.data()})).filter(q=>q.active!==false).sort((a,b)=>(a.order||0)-(b.order||0));if(clientAuth.currentUser.email?.toLowerCase()===TEACHER_EMAIL){const answerDocs=await getDocs(query(collection(clientDb,"quizAnswers"),limit(500))),answers=new Map(answerDocs.docs.map(d=>[d.id,d.data().answer]));items.forEach(q=>q.answer=answers.get(q.id))}state.quizzes=items;$("#question-count").textContent=items.length;return items}
$("#quiz-upload").onchange=async e=>{const out=$("#upload-result");try{out.textContent="업로드 및 정답 분리 저장 중…";const qs=await parseWorkbook(e.target.files[0]);await uploadQuizBank(qs);await loadQuizBank();out.textContent=`✅ ${qs.length}개 문제를 Firestore에 저장했습니다.`}catch(err){out.textContent=`❌ ${err.message}`}};
$("#download-template").onclick=()=>{if(!window.XLSX){alert("다운로드 도구를 불러오지 못했습니다.");return}const headers=[["카테고리","난이도(하/중/고)","문제","선택지1","선택지2","선택지3","선택지4","선택지5","정답번호(1~5)","제한시간(초, 선택)"]],ws=XLSX.utils.aoa_to_sheet(headers),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"문제_양식");XLSX.writeFile(wb,"한국사_퀴즈_빈양식.xlsx")};
setupTeams(4);updateOnlineBadges();
const sharedJoinCode=new URLSearchParams(location.search).get("join")?.trim().toUpperCase();
if(location.hash!=="#tv"&&/^[A-HJ-NP-Z2-9]{6}$/.test(sharedJoinCode||"")){$("#join-code").value=sharedJoinCode;$("#join-error").textContent="QR 접속 코드가 자동 입력되었습니다. 대기실 입장을 눌러주세요.";requestAnimationFrame(()=>$("#join-dialog").showModal())}
