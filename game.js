import * as THREE from "three";

const $ = id => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec8ed);
scene.fog = new THREE.Fog(0x8ec8ed, 45, 125);
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, .1, 250);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$("game").appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9f2ff,0x53616c,2.0));
const sun = new THREE.DirectionalLight(0xffffff,2.2);
sun.position.set(-25,45,25); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); scene.add(sun);

const mat=(color,roughness=.85)=>new THREE.MeshStandardMaterial({color,roughness});
const groundMat=mat(0x658b59), wallMat=mat(0x3c9ac4), rampMat=mat(0xdaa94d), floorMat=mat(0x7db7c9);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,180),groundMat);
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
const grid=new THREE.GridHelper(180,90,0x496d52,0x72956b); grid.position.y=.015; scene.add(grid);

// Arena boundaries and simple cover props
for(let i=0;i<4;i++){
  const a=i*Math.PI/2, x=Math.sin(a)*48, z=Math.cos(a)*48;
  const b=new THREE.Mesh(new THREE.BoxGeometry(100,5,1),mat(0x526b7c));
  b.position.set(x,2.5,z); b.rotation.y=a; b.castShadow=true; b.receiveShadow=true; scene.add(b);
}
for(let i=0;i<18;i++){
  const x=(Math.random()-.5)*65,z=(Math.random()-.5)*65;
  if(Math.hypot(x,z)<9) continue;
  const box=new THREE.Mesh(new THREE.BoxGeometry(2+Math.random()*2,1.5+Math.random()*2,2+Math.random()*2),mat(0x718b9c));
  box.position.set(x,box.geometry.parameters.height/2,z); box.castShadow=true; box.receiveShadow=true; scene.add(box);
}

const player={pos:new THREE.Vector3(0,0,8),vel:new THREE.Vector3(),yaw:0,pitch:0,health:100,elims:0,materials:500,weapon:1};
const avatar=new THREE.Group();
const body=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.85,5,10),mat(0x176a9b));
body.position.y=1.15; body.castShadow=true; avatar.add(body);
const head=new THREE.Mesh(new THREE.SphereGeometry(.31,16,12),mat(0xf0c9a5)); head.position.y=1.95; head.castShadow=true; avatar.add(head);
const visor=new THREE.Mesh(new THREE.BoxGeometry(.42,.13,.12),mat(0x182d42)); visor.position.set(0,2.02,-.27); avatar.add(visor);
const pack=new THREE.Mesh(new THREE.BoxGeometry(.55,.6,.22),mat(0x263b4c)); pack.position.set(0,1.25,.48); avatar.add(pack);
scene.add(avatar);

const keys={}, binds=loadBinds();
let pointerLocked=false, matchMode="practice", socket=null, myId=null, roomCode="", remotePlayers={}, bots=[], builds=[], projectiles=[], selectedBuild="wall", buildRotation=0, editMode=false;
const defaultBinds={forward:"W",back:"S",left:"A",right:"D",jump:"SPACE",wall:"Q",floor:"C",ramp:"V",rotate:"R",edit:"F",shotgun:"1",rifle:"2",pickaxe:"3"};
function loadBinds(){try{return {...defaultBinds,...JSON.parse(localStorage.getItem("bb3d_binds")||"{}")}}catch{return {...defaultBinds}}}
function saveBinds(){localStorage.setItem("bb3d_binds",JSON.stringify(binds))}
function keyName(e){if(e.code==="Space")return "SPACE"; if(e.key.length===1)return e.key.toUpperCase(); return e.key.toUpperCase()}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),1800)}
function makeBindRows(){
  const labels={forward:"Move forward",back:"Move backward",left:"Move left",right:"Move right",jump:"Jump",wall:"Build wall",floor:"Build floor",ramp:"Build ramp",rotate:"Rotate build",edit:"Edit / remove build",shotgun:"Shotgun",rifle:"Rifle",pickaxe:"Pickaxe"};
  $("bindRows").innerHTML="";
  Object.keys(labels).forEach(k=>{
    const row=document.createElement("div");row.className="bind-row";
    const label=document.createElement("span");label.textContent=labels[k];
    const btn=document.createElement("button");btn.textContent=binds[k];btn.onclick=()=>{btn.textContent="PRESS KEY";btn.classList.add("listening");const handler=e=>{e.preventDefault();binds[k]=keyName(e);saveBinds();window.removeEventListener("keydown",handler,true);makeBindRows()};window.addEventListener("keydown",handler,true)};
    row.append(label,btn);$("bindRows").appendChild(row);
  });
}
makeBindRows();

function openSettings(){ $("settings").classList.remove("hidden"); makeBindRows(); }
$("settingsBtn").onclick=openSettings;
$("closeSettings").onclick=()=>$("settings").classList.add("hidden");
$("resetBinds").onclick=()=>{Object.assign(binds,defaultBinds);saveBinds();makeBindRows()};
$("howBtn").onclick=()=>$("how").classList.remove("hidden");
$("closeHow").onclick=()=>$("how").classList.add("hidden");
$("onlineBtn").onclick=()=>$("onlinePanel").classList.toggle("hidden");

function makeBot(x,z,index){
  const g=new THREE.Group(), color=index%2?0xb54c45:0x9c62bd;
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.46,.82,4,9),mat(color));torso.position.y=1.12;torso.castShadow=true;g.add(torso);
  const h=new THREE.Mesh(new THREE.SphereGeometry(.3,14,10),mat(0xe0b28d));h.position.y=1.9;g.add(h);
  g.position.set(x,0,z);scene.add(g);
  return {group:g,health:100,attackTimer:0,dir:Math.random()*6.28};
}
function startPractice(){
  matchMode="practice";$("menu").classList.add("hidden");$("hud").classList.remove("hidden");$("modeLabel").textContent="PRACTICE VS BOTS";
  player.pos.set(0,0,8);player.health=100;player.elims=0;player.materials=500;
  bots.forEach(b=>scene.remove(b.group));bots=[makeBot(-9,0,0),makeBot(9,-8,1),makeBot(0,-16,2)];
  updateHud();toast("Practice match started");renderer.domElement.requestPointerLock?.();
}
$("practiceBtn").onclick=startPractice;

function connectOnline(create){
  const url=window.GAME_CONFIG?.SERVER_URL;
  if(!url){$("networkStatus").textContent="Add your deployed server URL to config.js first.";return}
  if(typeof io==="undefined"){$("networkStatus").textContent="Socket.IO library did not load. Check connection.";return}
  if(!socket) socket=io(url,{transports:["websocket","polling"]});
  $("networkStatus").textContent="Connecting...";
  socket.once("connect",()=>{
    const code=create?null:$("roomInput").value.trim().toUpperCase();
    socket.emit(create?"createRoom":"joinRoom",code,(res)=>{
      if(!res?.ok){$("networkStatus").textContent=res?.error||"Could not join room.";return}
      roomCode=res.code;myId=socket.id;matchMode="online";
      $("networkStatus").textContent="Connected to room "+roomCode;
      $("menu").classList.add("hidden");$("hud").classList.remove("hidden");$("modeLabel").textContent="ONLINE • "+roomCode;
      player.pos.set(res.spawn?.x||0,0,res.spawn?.z||8);player.health=100;updateHud();renderer.domElement.requestPointerLock?.();
    });
  });
  socket.on("connect_error",()=>{$("networkStatus").textContent="Could not reach multiplayer server.";});
  socket.on("state",state=>{if(matchMode!=="online")return;const seen=new Set();for(const p of state.players||[]){if(p.id===myId)continue;seen.add(p.id);if(!remotePlayers[p.id])remotePlayers[p.id]=makeRemote();remotePlayers[p.id].position.lerp(new THREE.Vector3(p.x,0,p.z),.45);remotePlayers[p.id].rotation.y=p.yaw||0;}Object.keys(remotePlayers).forEach(id=>{if(!seen.has(id)){scene.remove(remotePlayers[id]);delete remotePlayers[id]}})});
  socket.on("message",m=>toast(m));
  socket.on("opponentLeft",()=>toast("Opponent left the room"));
}
function makeRemote(){const g=new THREE.Group();const m=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.85,5,10),mat(0xd35d49));m.position.y=1.15;g.add(m);const h=new THREE.Mesh(new THREE.SphereGeometry(.31,12,10),mat(0xf0c9a5));h.position.y=1.95;g.add(h);scene.add(g);return g}
$("createRoomBtn").onclick=()=>connectOnline(true);
$("joinBtn").onclick=()=>connectOnline(false);

function addBuild(type){
  if(player.materials<10){toast("Not enough materials");return}
  const forward=new THREE.Vector3(Math.sin(player.yaw),0,-Math.cos(player.yaw));
  const p=player.pos.clone().add(forward.multiplyScalar(4));p.y=0;
  const group=new THREE.Group();let mesh;
  if(type==="wall"){mesh=new THREE.Mesh(new THREE.BoxGeometry(4,3.1,.22),wallMat);mesh.position.y=1.55}
  if(type==="floor"){mesh=new THREE.Mesh(new THREE.BoxGeometry(4,.2,4),floorMat);mesh.position.y=1.5}
  if(type==="ramp"){mesh=new THREE.Mesh(new THREE.BoxGeometry(4,.22,4),rampMat);mesh.rotation.x=-.48;mesh.position.y=1.05}
  mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);group.position.copy(p);group.rotation.y=player.yaw+buildRotation;
  scene.add(group);builds.push({group,type,owner:myId||"local"});player.materials-=10;updateHud();
  if(matchMode==="online"&&socket)socket.emit("build",{type,x:p.x,z:p.z,yaw:group.rotation.y});
}
function removeBuild(){
  if(!builds.length)return;
  let nearest=null,dist=7;
  builds.forEach(b=>{const d=b.group.position.distanceTo(player.pos);if(d<dist){dist=d;nearest=b}});
  if(nearest){scene.remove(nearest.group);builds=builds.filter(b=>b!==nearest);toast("Build edited / removed")}
}
function shoot(){
  if(player.weapon===3){removeBuild();return}
  const dir=new THREE.Vector3(Math.sin(player.yaw)*Math.cos(player.pitch),Math.sin(player.pitch),-Math.cos(player.yaw)*Math.cos(player.pitch)).normalize();
  const start=player.pos.clone().add(new THREE.Vector3(0,1.55,0));
  const length=player.weapon===1?28:65;
  const ray=new THREE.Raycaster(start,dir,0,length);
  const targets=bots.map(b=>b.group);
  const hits=ray.intersectObjects(targets,true);
  if(hits.length){const bot=bots.find(b=>b.group===hits[0].object||b.group.children.includes(hits[0].object));if(bot){bot.health-=player.weapon===1?48:24;if(bot.health<=0){scene.remove(bot.group);bots=bots.filter(b=>b!==bot);player.elims++;updateHud();toast("Bot eliminated!");}}}
  if(matchMode==="online"&&socket)socket.emit("shoot",{yaw:player.yaw,pitch:player.pitch,weapon:player.weapon});
}
function updateHud(){$("health").textContent=Math.max(0,Math.round(player.health));$("healthBar").style.width=Math.max(0,player.health)+"%";$("elims").textContent=player.elims;$("materials").textContent=player.materials}
function setWeapon(n){player.weapon=n;document.querySelectorAll(".slot").forEach(s=>s.classList.toggle("active",Number(s.dataset.slot)===n))}
function keyAction(action){if(action==="wall")addBuild("wall");if(action==="floor")addBuild("floor");if(action==="ramp")addBuild("ramp");if(action==="rotate")buildRotation+=Math.PI/2;if(action==="edit")removeBuild();if(action==="shotgun")setWeapon(1);if(action==="rifle")setWeapon(2);if(action==="pickaxe")setWeapon(3)}
window.addEventListener("keydown",e=>{
  if(["INPUT"].includes(document.activeElement?.tagName))return;
  const k=keyName(e);keys[k]=true;
  for(const [action,key] of Object.entries(binds)){if(k===key){if(["wall","floor","ramp","rotate","edit","shotgun","rifle","pickaxe"].includes(action)&&!e.repeat)keyAction(action)}}
  if(k==="ESCAPE")document.exitPointerLock?.();
});
window.addEventListener("keyup",e=>keys[keyName(e)]=false);
renderer.domElement.addEventListener("click",()=>{if(!$("menu").classList.contains("hidden"))return;renderer.domElement.requestPointerLock?.()});
document.addEventListener("pointerlockchange",()=>pointerLocked=document.pointerLockElement===renderer.domElement);
document.addEventListener("mousemove",e=>{if(!pointerLocked)return;player.yaw-=e.movementX*.0022;player.pitch=Math.max(-.8,Math.min(.65,player.pitch-e.movementY*.002));});
document.addEventListener("mousedown",e=>{if(pointerLocked&&e.button===0)shoot()});
$("leaveBtn").onclick=()=>{document.exitPointerLock?.();if(socket&&matchMode==="online"){socket.emit("leaveRoom");socket.disconnect();socket=null;remotePlayers={};Object.values(remotePlayers).forEach(scene.remove.bind(scene))}matchMode="practice";$("hud").classList.add("hidden");$("menu").classList.remove("hidden")};

let last=performance.now(),sendTimer=0;
function animate(now){
  requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.04);last=now;
  const forward=(keys[binds.forward]||false)?1:0,back=(keys[binds.back]||false)?1:0,left=(keys[binds.left]||false)?1:0,right=(keys[binds.right]||false)?1:0;
  const speed=keys["SHIFT"]?10:7;
  const move=new THREE.Vector3(right-left,0,back-forward);
  if(move.lengthSq()>0){move.normalize().applyAxisAngle(new THREE.Vector3(0,1,0),player.yaw);player.pos.addScaledVector(move,speed*dt)}
  player.pos.x=THREE.MathUtils.clamp(player.pos.x,-44,44);player.pos.z=THREE.MathUtils.clamp(player.pos.z,-44,44);
  avatar.position.copy(player.pos);avatar.rotation.y=player.yaw;
  const desired=new THREE.Vector3(player.pos.x+Math.sin(player.yaw)*6,player.pos.y+4.1,player.pos.z+Math.cos(player.yaw)*6);
  camera.position.lerp(desired,.16);
  const look=player.pos.clone().add(new THREE.Vector3(0,1.5,0));look.x-=Math.sin(player.yaw)*2;look.z+=Math.cos(player.yaw)*2;camera.lookAt(look);
  if(keys[binds.jump]&&player.pos.y===0){player.vel.y=7.5}
  player.vel.y-=19*dt;player.pos.y=Math.max(0,player.pos.y+player.vel.y*dt);if(player.pos.y===0)player.vel.y=0;
  avatar.position.y=player.pos.y;
  if(matchMode==="practice"){
    bots.forEach(bot=>{
      const to=player.pos.clone().sub(bot.group.position);const d=to.length();
      if(d>5){to.y=0;to.normalize();bot.group.position.addScaledVector(to,dt*2.1);bot.group.rotation.y=Math.atan2(to.x,to.z)}
      bot.attackTimer-=dt;if(d<17&&bot.attackTimer<=0){bot.attackTimer=1.6;player.health=Math.max(0,player.health-4);updateHud();if(player.health<=0){toast("You were eliminated — restart practice");}}
    });
  }
  if(matchMode==="online"&&socket?.connected){sendTimer+=dt;if(sendTimer>.05){sendTimer=0;socket.emit("move",{x:player.pos.x,z:player.pos.z,yaw:player.yaw})}}
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
window.addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
setWeapon(1);
