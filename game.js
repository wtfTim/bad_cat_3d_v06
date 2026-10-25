import * as THREE from 'three';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/loaders/GLTFLoader.js';

// BAD CAT 3D v1.7: the only collision sources are architectural walls and the
// furniture models actually loaded into the scene. Old invisible furniture is gone.
// Real progress: all mandatory assets and every saved furniture instance must settle.
const loadingUI={
 status:document.getElementById('loadingStatus'),fill:document.getElementById('loadingFill'),
 percent:document.getElementById('loadingPercent'),details:document.getElementById('loadingDetails'),
 track:document.getElementById('loadingTrack'),play:document.getElementById('play'),
 retry:document.getElementById('loadingRetry')
};
let loadingPhase=0,loadingCount=0,loadingTotal=1;
function updateLoading(pct,status,detail){
 const value=Math.max(loadingPhase,Math.min(100,Math.floor(pct)));
 loadingPhase=value;
 loadingUI.fill.style.width=value+'%';loadingUI.percent.textContent=value+'%';
 loadingUI.track.setAttribute('aria-valuenow',String(value));
 if(status)loadingUI.status.textContent=status;
 if(detail!==undefined)loadingUI.details.textContent=detail;
}
function updateFurnitureLoading(){
 const portion=loadingCount/Math.max(1,loadingTotal);
 updateLoading(14+Math.floor(portion*80),'Расставляем мебель и предметы…',loadingCount+' из '+loadingTotal);
}
loadingUI.retry.addEventListener('click',()=>location.reload());
const scene=new THREE.Scene();scene.background=new THREE.Color('#b4dbe9');scene.fog=new THREE.Fog('#b4dbe9',72,165);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.08,190);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=false;document.body.prepend(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x8295a7,2.2));
const sunlight=new THREE.DirectionalLight(0xffebcf,2.35);sunlight.position.set(-12,20,10);scene.add(sunlight);
const material=(color,roughness=.85)=>new THREE.MeshStandardMaterial({color,roughness});
const mats={wall:material('#f5eadd'),divider:material('#dbe8eb'),wood:material('#c99e75'),floor:material('#ddaf83'),white:material('#f4ebe0'),dark:material('#54414b'),fur:material('#7f7770'),ear:material('#a98c89'),roof:material('#8d6a6a'),trim:material('#fff8ee')};
const glassMat=new THREE.MeshStandardMaterial({color:'#aed6ea',metalness:.15,roughness:.12,transparent:true,opacity:.55});
const house=new THREE.Group();scene.add(house);
const colliders=[],walkableSurfaces=[],wallMeshes=[],furniture=[],interactables=[],fx=[];
const roofPieces=[],streetObjects=[];
const architecturalWallRecords=[];
const editablePieces=new Map();
const EDIT_SAVE_KEY='badcat3d-furniture-layout-v18';
let storedLayout={};try{storedLayout=JSON.parse(localStorage.getItem(EDIT_SAVE_KEY)||'{}')||{}}catch(e){storedLayout={}}
function registerEditable(id,piece,description){
 piece.editId=id;piece.description=description;editablePieces.set(id,piece);
 const saved=storedLayout[id];if(saved&&Array.isArray(saved.pos)&&saved.pos.length===3){
  piece.holder.position.set(...saved.pos);piece.holder.rotation.y=saved.rot||0;
  // Old layouts without scale remain at their original size.
  if(Number.isFinite(saved.scale)&&saved.scale>=.2&&saved.scale<=4)piece.holder.scale.setScalar(saved.scale);
  if(saved.hidden){piece.holder.visible=false;piece.removed=true;}
  refreshEditBounds(piece);
 }
}
function refreshEditBounds(piece){
 piece.holder.updateMatrixWorld(true);
 const bb=new THREE.Box3().setFromObject(piece.holder);piece.bounds=bb;
 if(piece.collider){
  const b=piece.collider;
  if(piece.trunkCollider){
   const x=piece.holder.position.x,z=piece.holder.position.z;
   const r=piece.trunkRadius*piece.holder.scale.x;
   b.x1=x-r;b.x2=x+r;b.z1=z-r;b.z2=z+r;
   b.y1=bb.min.y;b.y2=Math.min(bb.max.y,bb.min.y+2.2*piece.holder.scale.y);
  }else{
  const inset=Math.min(.06,(bb.max.x-bb.min.x)*.12,(bb.max.z-bb.min.z)*.12);
  b.x1=bb.min.x+inset;b.x2=bb.max.x-inset;b.z1=bb.min.z+inset;b.z2=bb.max.z-inset;
  b.y1=bb.min.y;
  b.y2=piece.fullHeightCollider?bb.max.y:piece.surface?piece.surface.y:Math.min(bb.max.y,Math.max(bb.min.y+.1,piece.holder.position.y+1.8));
  if(piece.removed){b.y1=999;b.y2=1000;}
  }
 }
 if(piece.surface){
  piece.surface.x1=bb.min.x;piece.surface.x2=bb.max.x;
  piece.surface.z1=bb.min.z;piece.surface.z2=bb.max.z;
  piece.surface.y=piece.surface.fullTop?bb.max.y:
   bb.min.y+(bb.max.y-bb.min.y)*(piece.seatFraction??.5);
  if(piece.removed)piece.surface.y=-999;
 }
}
// Editor collision guard: test the entire rotated model's world-space AABB
// against actual architectural wall colliders. A failed move restores its old pose.
function canPlaceEdited(piece){
 if(!piece||piece.removed)return true;
 piece.holder.updateMatrixWorld(true);
 const bb=new THREE.Box3().setFromObject(piece.holder);
 if(bb.min.x < -67.6 || bb.max.x > 67.6 || bb.min.z < -67.6 || bb.max.z > 67.6)return false;
 const pad=.018;
 for(const wall of colliders){
   if(wall.source!=='wall')continue;
   if(bb.max.y<=wall.y1+pad||bb.min.y>=wall.y2-pad)continue;
   if(bb.max.x>wall.x1+pad&&bb.min.x<wall.x2-pad&&bb.max.z>wall.z1+pad&&bb.min.z<wall.z2-pad)return false;
 }
 return true;
}
function moveEditedSafely(piece,changePose){
 if(!piece)return false;
 const prev=piece.holder.position.clone(),rot=piece.holder.rotation.y,oldScale=piece.holder.scale.clone();
 changePose();
 if(!canPlaceEdited(piece)){
  piece.holder.position.copy(prev);piece.holder.rotation.y=rot;piece.holder.scale.copy(oldScale);
  toast('🚧 Здесь стена или граница участка');
  return false;
 }
 piece.level=piece.holder.position.y;piece.floorY=piece.level;
 refreshEditBounds(piece);if(editHelper)editHelper.update();syncEditorLabel();
 return true;
}
function saveFurniture(){
 // Preserve saved poses when a model is temporarily unavailable.
 let all={...storedLayout};
 for(const [id,p] of editablePieces){
  all[id]={pos:[p.holder.position.x,p.holder.position.y,p.holder.position.z],rot:p.holder.rotation.y,scale:p.holder.scale.x,hidden:!!p.removed};
 }
 const previous=localStorage.getItem(EDIT_SAVE_KEY);
 if(previous){
  try{
   const before=JSON.parse(previous);
   if(Object.keys(before).length>Object.keys(all).length)all={...before,...all};
   localStorage.setItem(EDIT_SAVE_KEY+'-last-backup',previous);
  }catch(e){console.warn('Could not back up furniture save',e)}
 }
 localStorage.setItem(EDIT_SAVE_KEY,JSON.stringify(all));
 storedLayout=all;
}

const F=3.55, CAT_RADIUS=.30, HUMAN_RADIUS=.35;
function addBox(w,h,d,mat,x,y,z,{wall=false,top=false}={}){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);house.add(mesh);
 if(wall){
 const box={x1:x-w/2,x2:x+w/2,z1:z-d/2,z2:z+d/2,y1:y-h/2,y2:y+h/2,source:'wall'};
 colliders.push(box);wallMeshes.push(mesh);
 const id='original-'+architecturalWallRecords.length;
 mesh.userData.wallEditId=id;
 architecturalWallRecords.push({id,originalMesh:mesh,originalCollider:box,
  base:{x,z,y:y-h/2,length:Math.max(w,d),height:h,thickness:Math.min(w,d),rotation:w>=d?0:Math.PI/2,opening:'none',openingWidth:1.2,openingHeight:2.2,sill:1}});
}
 if(top)walkableSurfaces.push({x1:x-w/2,x2:x+w/2,z1:z-d/2,z2:z+d/2,y:y+h/2,architecture:true});
 return mesh;
}
function ball(r,mat,x,y,z,parent,sx=1,sy=1,sz=1){const m=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m}
function column(a,b,h,mat,x,y,z,parent){const m=new THREE.Mesh(new THREE.CylinderGeometry(a,b,h,10),mat);m.position.set(x,y,z);parent.add(m);return m}
// v2.1: Joined floors and actual holes for glazed windows.
addBox(22,.28,18,mats.floor,0,-.14,0,{top:true});
addBox(16,.25,18,mats.floor,-3,F-.125,0,{top:true});
addBox(6,.25,10,mats.floor,8,F-.125,-4,{top:true});
const mainWindowGlass=new THREE.MeshPhysicalMaterial({color:'#a9dcec',roughness:.12,transparent:true,opacity:.65,side:THREE.DoubleSide});
const windowTrim=material('#fcf5e9');
function sectionZ(x0,x1,z,b,t){
 if(x1>x0+.01&&t>b+.01)addBox(x1-x0,t-b,.24,mats.wall,(x0+x1)/2,(b+t)/2,z,{wall:true});
}
function sectionX(z0,z1,x,b,t){
 if(z1>z0+.01&&t>b+.01)addBox(.24,t-b,z1-z0,mats.wall,x,(b+t)/2,(z0+z1)/2,{wall:true});
}
function glassZ(x,z,b,w=2){
 const lo=b+1.0,hi=b+2.33;
 sectionZ(x-w/2,x+w/2,z,b,lo);sectionZ(x-w/2,x+w/2,z,hi,b+F);
 addBox(w-.1,hi-lo-.10,.06,mainWindowGlass,x,(lo+hi)/2,z+Math.sign(z)*.135,{wall:true});
 addBox(w+.16,.12,.32,mats.wood,x,lo,z+Math.sign(z)*.16);
 addBox(.065,hi-lo,.12,windowTrim,x,(lo+hi)/2,z+Math.sign(z)*.17);
 for(const side of [-1,1])addBox(.085,hi-lo,.12,windowTrim,x+side*w/2,(lo+hi)/2,z+Math.sign(z)*.17);
}
function glassX(z,x,b,w=2){
 const lo=b+1.0,hi=b+2.33;
 sectionX(z-w/2,z+w/2,x,b,lo);sectionX(z-w/2,z+w/2,x,hi,b+F);
 addBox(.06,hi-lo-.10,w-.10,mainWindowGlass,x+Math.sign(x)*.135,(lo+hi)/2,z,{wall:true});
 addBox(.32,.12,w+.15,mats.wood,x+Math.sign(x)*.17,lo,z);
 for(const side of [-1,1])addBox(.12,hi-lo,.085,windowTrim,x+Math.sign(x)*.17,(lo+hi)/2,z+side*w/2);
}
function faceZ(z,b,door){
 const holes=[[-7,2.0,'window'],[7.3,2.0,'window']];
 if(door)holes.push([2.7,2.7,'door']);
 holes.sort((a,b)=>a[0]-b[0]);
 let last=-11;
 for(const [x,w,type] of holes){
  sectionZ(last,x-w/2,z,b,b+F);
  if(type==='window')glassZ(x,z,b,w);
  else{
    sectionZ(x-w/2,x+w/2,z,b+2.65,b+F);
    for(const side of [-1,1])addBox(.10,2.65,.20,windowTrim,x+side*(w/2+.04),b+1.325,z+.09);
    addBox(w,.12,.25,windowTrim,x,b+2.64,z+.09);
  }
  last=x+w/2;
 }
 sectionZ(last,11,z,b,b+F);
}
function faceX(x,b){
 let last=-9;
 for(const z of [-5,5]){
  sectionX(last,z-1,x,b,b+F);glassX(z,x,b,2);last=z+1;
 }
 sectionX(last,9,x,b,b+F);
}
for(const b of [0,F]){
 faceZ(-9,b,false);faceZ(9,b,b===0);
 faceX(-11,b);faceX(11,b);
 function partitionX(a,c){addBox(.18,F,c-a,mats.divider,0,b+F/2,(a+c)/2,{wall:true})}
 function partitionZ(a,c){addBox(c-a,F,.18,mats.divider,(a+c)/2,b+F/2,0,{wall:true})}
 partitionX(-9,-1.4);partitionX(1.2,9);
 partitionZ(-11,-2.2);partitionZ(1.5,5.8);partitionZ(8.2,11);
}
// Ridge and matching pitched panels sit above the 7.10m second floor.
for(const side of [-1,1]){
 const slab=addBox(23.2,.22,9.5,mats.roof,0,2*F+.78,side*4.45);
 slab.rotation.x=side*.15;roofPieces.push({mesh:slab,x:0,z:0});
}
addBox(23.1,.14,.26,mats.trim,0,2*F+1.48,0);
for(const y of [F,2*F]){
 addBox(22.25,.14,.29,windowTrim,0,y,9.02);
 addBox(22.25,.14,.29,windowTrim,0,y,-9.02);
}
// Each step has floor support; there are NO old sofa/table/bed colliders here.
const stairSteps=14,stepDepth=.47;
for(let k=0;k<stairSteps;k++){
 const height=F*(k+1)/stairSteps,sz=7.8-k*stepDepth;
 addBox(2.65,height,stepDepth+.018,mats.wood,8.1,height/2,sz,{top:true});
}
// Handrail is architecture, not an invisible gameplay obstacle.
addBox(.11,1.05,7.05,mats.white,6.68,2,4.45);

// Outdoor v1.4: coherent small plot, clear south entrance and a real playable yard.
const grass=material('#87b768'),grassDeep=material('#548f58'),pathMat=material('#d9c2a1'),fenceMat=material('#b98b5c'),soilMat=material('#74513f'),leafMat=material('#4c9b62'),flowerMat=material('#f7a7b9'),potMat=material('#be7959'),playMat=material('#edb54b');
// Walkable terrain surrounds the house and includes the side and back gardens.
addBox(140,.12,140,grass,0,-.19,0,{top:true});
function outdoorsBox(w,h,d,mat,x,y,z,{solid=false,top=false}={}){return addBox(w,h,d,mat,x,y,z,{wall:solid,top})}
// Outdoor paths are authored exclusively in the world editor.
// Perimeter fence; front gate at x=2.7. All sections have matching actual colliders.
function fenceX(a,b,z){for(let x=a+.42;x<b;x+=1.4){outdoorsBox(.18,1.35,.2,fenceMat,x,.68,z,{solid:true});}outdoorsBox(b-a,.14,.16,fenceMat,(a+b)/2,.94,z,{solid:true});outdoorsBox(b-a,.14,.16,fenceMat,(a+b)/2,.33,z,{solid:true})}
function fenceZ(a,b,x){for(let z=a+.42;z<b;z+=1.4)outdoorsBox(.2,1.35,.18,fenceMat,x,.68,z,{solid:true});outdoorsBox(.16,.14,b-a,fenceMat,x,.94,(a+b)/2,{solid:true});outdoorsBox(.16,.14,b-a,fenceMat,x,.33,(a+b)/2,{solid:true})}
fenceX(-68,68,-68);fenceX(-68,68,68);fenceZ(-68,68,-68);fenceZ(-68,68,68);
// Real imported outdoor objects replace the previous placeholder trees and yard props.
// Every outdoor object's collision box is derived from its loaded GLB geometry.
const yardInteractions=[];
const HUD={score:document.getElementById('score'),count:document.getElementById('count'),room:document.getElementById('room'),hunger:document.getElementById('hunger'),energy:document.getElementById('energy'),mood:document.getElementById('moodValue'),alert:document.getElementById('alert'),quest:document.getElementById('questText'),message:document.getElementById('msg')};
let score=0,chaos=0,hunger=85,energy=90,mood=85,alertness=0,questIndex=0;
let ate=false,scratched=false,slept=false,escaped=false,playing=false,furnitureReady=false;
let elapsed=0,saveTimer=0,messageUntil=0,camOrbit=0,camPitch=.15,viewFirstPerson=false;
let audio=null;
function sound(type){if(!audio)return;const now=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
 const s={meow:[490,270,.27,'sawtooth'],jump:[300,540,.13,'sine'],hit:[205,70,.2,'triangle'],scratch:[430,125,.25,'sawtooth'],tear:[620,170,.19,'triangle'],eat:[390,230,.2,'sine'],sleep:[120,85,.35,'sine'],alert:[630,860,.24,'square']}[type]||[220,90,.18,'triangle'];
 osc.type=s[3];osc.frequency.setValueAtTime(s[0],now);osc.frequency.exponentialRampToValueAtTime(s[1],now+s[2]);
 gain.gain.setValueAtTime(.07,now);gain.gain.exponentialRampToValueAtTime(.001,now+s[2]);osc.connect(gain);gain.connect(audio.destination);osc.start(now);osc.stop(now+s[2]+.02);
}
function toast(text){HUD.message.textContent=text;HUD.message.style.opacity='1';messageUntil=elapsed+2.1}
function setProgress(){HUD.score.textContent=score;HUD.count.textContent=chaos;HUD.hunger.textContent=Math.round(hunger);HUD.energy.textContent=Math.round(energy);HUD.alert.textContent=alertness>55?'ПОГОНЯ!':alertness>20?'Ищет котика':'Спокойно';HUD.mood.textContent=mood>60?'Довольный 😺':mood>25?'Скучает 😿':'Грустный 🙀'}
// The neighborhood story: progress is persistent and every mission has a real place.
let streetKnocks=0,dugTreasure=false,buriedFish=false,boughtMilk=false,bathed=false,gnomeSaved=false,dugBone=false,buriedBone=false,neighborSlept=false,parkScratched=false,marketFood=false;
let gardenBench=false,gardenTrail=false,gardenClue=false,garageSearched=false,shedSearched=false,greenhouseSearched=false,saunaVisited=false,storyFinished=false;
const nearQuest=(x,z,d=4)=>Math.hypot(cat.position.x-x,cat.position.z-z)<d;
function nearestFridge(){
 const f=[...editablePieces.values()].filter(p=>!p.removed&&p.holder.visible&&/fridge|refrigerator|холодильник/i.test(p.model+' '+p.description));
 f.sort((a,b)=>Math.hypot(cat.position.x-a.holder.position.x,cat.position.z-a.holder.position.z)-Math.hypot(cat.position.x-b.holder.position.x,cat.position.z-b.holder.position.z));
 return f[0]||null;
}
const quests=[
 {id:'porch',text:'Выйди из дома и осмотри двор',at:[3,13],done:()=>nearQuest(3,13,4)},
 {id:'trail',text:'Пройди по дорожке нового сада',at:[2,22],done:()=>nearQuest(2,22,5)},
 {id:'bench',text:'Найди записку под садовой скамейкой (X)',at:[-9.5,16],done:()=>gardenBench},
 {id:'tracks',text:'Ищи кошачьи следы у деревьев (X)',at:[-20,27],done:()=>gardenTrail},
 {id:'map',text:'Найди тайную карту возле беседки (X)',at:[-20,27],done:()=>gardenClue},
 {id:'eat',text:'Подкрепись у своего холодильника (G / ЕШЬ)',at:[-9.5,-7.5],done:()=>ate},
 {id:'shed',text:'Найди лопатку в сарае (X)',at:[-42,-31],done:()=>shedSearched},
 {id:'garage',text:'Проверь инструменты в гараже (X)',at:[38,-34],done:()=>garageSearched},
 {id:'greenhouse',text:'Ищи улику в теплице (X)',at:[-40,36],done:()=>greenhouseSearched},
 {id:'treasure',text:'Откопай спрятанный клад (X)',at:[-37,43],done:()=>dugTreasure},
 {id:'gnome',text:'Помоги садовому гному (X)',at:[-50,43],done:()=>gnomeSaved},
 {id:'evidence',text:'Закопай рыбные улики (X)',at:[-16,48],done:()=>buriedFish},
 {id:'sauna',text:'Передохни возле бани (X)',at:[40,35],done:()=>saunaVisited},
 {id:'fountain',text:'Освежись у фонтана (X)',at:[34,8],done:()=>bathed},
 {id:'bone',text:'Откопай древнюю косточку (X)',at:[-55,-47],done:()=>dugBone},
 {id:'bury',text:'Спрячь косточку у изгороди (X)',at:[51,48],done:()=>buriedBone},
 {id:'sleep',text:'Вернись домой и выспись (H / СПАТЬ)',at:[-7,5],done:()=>slept},
 {id:'scratch',text:'Оставь кошачью метку на мебели (F)',at:[0,5],done:()=>scratched},
 {id:'home',text:'Вернись в свой сад с сокровищем',at:[2,22],done:()=>nearQuest(2,22,5)},
 {id:'victory',text:'Мяукни у крыльца в честь победы (M)',at:[3,13],done:()=>storyFinished}
];
function questTarget(q){const f=q?.id==='eat'?nearestFridge():null;return f?[f.holder.position.x,f.holder.position.z]:q?.at}
function updateQuest(){
 let passed=0;
 while(questIndex<quests.length&&quests[questIndex].done()){questIndex++;passed++;score+=7;energy=Math.min(100,energy+5)}
 if(passed)toast('🏆 Новая глава пройдена! +'+(passed*7)+' 🐟');
 const q=quests[questIndex],at=questTarget(q);
 HUD.quest.textContent=q?`${questIndex+1}/${quests.length} · ${q.text}`:'🏆 Всё приключение пройдено!';
 const t=document.getElementById('questDistance');
 if(t)t.textContent=q?`📍 ${Math.round(Math.hypot(cat.position.x-at[0],cat.position.z-at[1]))} м до цели · X — действие`:'🎉 Тайна сада раскрыта!';
}
function floorOf(y){return y>F-1.1?F:0}
function isBlocked(x,z,feet,r=CAT_RADIUS,height=.70,sourceFilter=null){
 if(x<-107+r||x>107-r||z<-107+r||z>107-r)return true;
 for(const b of colliders){if(sourceFilter&&!sourceFilter(b))continue;
  if(feet+.07<b.y2&&feet+height>b.y1 && x+r>b.x1&&x-r<b.x2&&z+r>b.z1&&z-r<b.z2){
   // Standing on a supported seat/bench/table should not count as being trapped
   // by taller decorative backs or armrests of the same furniture piece.
   const supported=walkableSurfaces.some(s=>s!==null&&s.y>-998&&
     Math.abs(s.y-feet)<.11&&x>s.x1-.08&&x<s.x2+.08&&z>s.z1-.08&&z<s.z2+.08&&
     s.colliderRef===b);
   if(!supported)return true;
  }
 }
 return false;
}
// Supports always use the last feet height, not the already-fallen height.
 // Seated furniture gets a geometric downward ray so its real seating surface
 // (including scaled benches) can hold the cat even when the GLB has a tall back.
const catSeatRay=new THREE.Raycaster();
const catSeatDown=new THREE.Vector3(0,-1,0);
function groundSupport(x,z,feet,prev){let best=0;
 for(const s of walkableSurfaces){
  if(s.y<-100||x+CAT_RADIUS*.24<=s.x1||x-CAT_RADIUS*.24>=s.x2||z+CAT_RADIUS*.24<=s.z1||z-CAT_RADIUS*.24>=s.z2)continue;
  if(s.y<=prev+.18&&s.y>best)best=s.y;
 }
 // Use actual geometry for seats rather than an approximation based on the model's bounding box.
 // Only test visible, nearby seating pieces; the 416-object catalog is not raycast every frame.
 for(const p of editablePieces.values()){
  if(!p.surface||p.surface.fullTop||p.removed||!p.holder.visible)continue;
  const b=p.bounds;
  if(!b||x<b.min.x-.08||x>b.max.x+.08||z<b.min.z-.08||z>b.max.z+.08)continue;
  if(prev<b.min.y-.2||prev>b.max.y+.7)continue;
  catSeatRay.set(new THREE.Vector3(x,prev+.16,z),catSeatDown);
  catSeatRay.far=Math.min(1.1,Math.max(.3,prev+.16-b.min.y+.08));
  const hits=catSeatRay.intersectObject(p.holder,true);
  // A backrest can sit above the feet, so prefer support below the current feet
  // and fall back to the explicit seat surface in that case.
  const seatLimit=Math.min(b.max.y,b.min.y+(b.max.y-b.min.y)*.78);
  const hit=hits.find(h=>h.point.y<=prev+.16&&h.point.y>=b.min.y-.02&&h.point.y<=seatLimit);
  if(hit&&hit.point.y>best)best=hit.point.y;
 }
 return best;
}
// Manual-only rescue. Searches for nearest unobstructed position at the current level.
function safeRecoverySpot(){
 const x=cat.position.x,z=cat.position.z,y=Math.max(0,cat.position.y);
 const candidates=[];
 for(let radius=.45;radius<=7.2;radius+=.3){
  for(let i=0;i<32;i++){
   const angle=i*Math.PI/16;
   const cx=x+Math.cos(angle)*radius,cz=z+Math.sin(angle)*radius;
   const top=groundSupport(cx,cz,y,y);
   // The active floor comes first, allowing safe recovery upstairs.
   const heights=[top,Math.max(0,Math.min(y,F)),0];
   for(const level of heights){
    if(Math.abs(level-y)>1.2)continue;
    if(isBlocked(cx,cz,level,CAT_RADIUS+.05,.72))continue;
    // Ensure the spot really has supporting terrain/floor and isn't midway in air.
    if(Math.abs(groundSupport(cx,cz,level,level)-level)>.13)continue;
    candidates.push({x:cx,z:cz,y:level,score:radius+Math.abs(level-y)*2});
    break;
   }
  }
  if(candidates.length)return candidates.sort((a,b)=>a.score-b.score)[0];
 }
 return null;
}
function manualUnstuck(){
 if(!playing||editorOn)return;
 const safe=safeRecoverySpot();
 if(!safe){toast('🐾 Рядом нет свободного места, отойди или попробуй ещё раз');return}
 cat.position.set(safe.x,safe.y,safe.z);
 velY=0;grounded=true;
 toast('🐾 Выбрался рядом!');
}
function stairLevel(x,z){return x>6.74&&x<9.47&&z>.98&&z<8.12?THREE.MathUtils.clamp((8.05-z)/(stepDepth*stairSteps)*F,0,F):null}

// ------------------------------------------------------------------
// Character: preserve the user's working Cat Character GLB and its real animations.
const cat=new THREE.Group();scene.add(cat);cat.position.set(-1.8,0,5.2);
const fallback=new THREE.Group();cat.add(fallback);
ball(.39,mats.fur,0,.49,-.12,fallback,1.25,.8,.85);ball(.35,mats.fur,0,.86,.23,fallback);
for(const s of [-1,1]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.17,.32,3),mats.fur);ear.position.set(s*.24,1.18,.27);fallback.add(ear);ball(.07,mats.white,s*.15,.91,.52,fallback)}
let catModel=null,catMixer=null,catActions={},catCurrent=null;
const catReady=new GLTFLoader().loadAsync('./assets/cat_character.glb').then(g=>{
 const object=g.scene;object.traverse(n=>{if(n.isMesh||n.isSkinnedMesh){n.castShadow=false;n.receiveShadow=false;n.frustumCulled=false}});
 const studio=[];object.traverse(n=>{if(n.isLight||n.isCamera)studio.push(n)});for(const n of studio)n.parent?.remove(n);
 object.updateMatrixWorld(true);const bbox=new THREE.Box3().setFromObject(object),sz=bbox.getSize(new THREE.Vector3()),ctr=bbox.getCenter(new THREE.Vector3());
 if(sz.y<.001)throw Error('Неверный размер GLB котика');
 const scale=.70/sz.y,holder=new THREE.Group();holder.scale.setScalar(scale);
 object.position.x-=ctr.x;object.position.z-=ctr.z;object.position.y-=bbox.min.y-.035/scale;holder.add(object);cat.add(holder);
 catModel=holder;fallback.visible=false;catMixer=new THREE.AnimationMixer(object);
 for(const clip of g.animations||[]){const name=clip.name.trim().toLowerCase(),clean=clip.clone();
  clean.tracks=clean.tracks.filter(t=>!/^((Sketchfab_model|root|GLTF_SceneRootNode|cat_root_25)\.)/.test(t.name));
  if(clean.tracks.length){const action=catMixer.clipAction(clean);action.setLoop(THREE.LoopRepeat,Infinity);catActions[name]=action}
 }
 catCurrent=catActions.iddle||catActions.static||catActions.walk||null;
 if(catCurrent)catCurrent.reset().setEffectiveWeight(1).play();
}).catch(e=>{console.error('Ошибка загрузки котика',e);return false;});
function animateCat(dt,moving,running){if(!catMixer)return;
 const want=moving?(running?'run':'walk'):'iddle',next=catActions[want]||catActions.iddle||catActions.walk;
 if(next&&next!==catCurrent){next.reset().setEffectiveWeight(1).play();if(catCurrent)next.crossFadeFrom(catCurrent,.18,false);catCurrent=next}
 if(catCurrent)catCurrent.setEffectiveTimeScale(running?1.2:1);catMixer.update(dt);
}
let velY=0,grounded=true,sleeping=0;const keys={},stick={x:0,y:0};
// ------------------------------------------------------------------
// The owner follows A* paths on a grid. Every path cell is validated against
// the same colliders that block the player, so the NPC cannot walk through walls.
const owner=new THREE.Group();scene.add(owner);owner.position.set(3.4,0,5.2);
const skin=material('#efc29f'),shirt=material('#6688b7'),pants=material('#4b536c'),hair=material('#5c463e');
ball(.31,skin,0,1.69,0,owner);ball(.33,hair,0,1.91,-.045,owner,1,.36,1);
ball(.41,shirt,0,1.10,0,owner,1,.95,.68);const limbs=[];
for(const sign of [-1,1]){
 const arm=column(.11,.12,.73,shirt,sign*.43,1.06,0,owner),leg=column(.14,.14,.84,pants,sign*.18,.43,0,owner);limbs.push(arm,leg);
 ball(.038,mats.dark,sign*.12,1.73,.29,owner);
}
const patrol=[[3.3,5.2],[3.3,2],[5.25,.65],[6.3,-1.2],[5,-5.2],[2,-1.3],[-1,-.7],[-4.4,-4.5],[-1.3,-.7],[-1.4,1.6],[-6,3.2],[-2,1.6],[3.3,2],[3.3,5.2],[2.65,11.2],[5.1,13.5],[2.65,11.2],[3.3,5.2]];
let patrolIndex=0,ownerPath=[],pathTimer=0,pathGoal=[999,999],patrolPause=0;
const CELL=.52, NX=Math.floor(36/CELL)+1,NZ=Math.floor(34/CELL)+1;
function toCell(x,z){return [Math.max(0,Math.min(NX-1,Math.round((x+18)/CELL))),Math.max(0,Math.min(NZ-1,Math.round((z+16)/CELL)))]}
function toWorld(a,b){return [-18+a*CELL,-16+b*CELL]}
function nearestOpen(cx,cz){for(let k=0;k<=9;k++){for(let dz=-k;dz<=k;dz++)for(let dx=-k;dx<=k;dx++){
  if(Math.max(Math.abs(dx),Math.abs(dz))!==k)continue;const x=cx+dx,z=cz+dz;if(x<0||x>=NX||z<0||z>=NZ)continue;
  const [wx,wz]=toWorld(x,z);if(!isBlocked(wx,wz,0,HUMAN_RADIUS,1.8))return [x,z];
 }}return null}
function findPath(ax,az,bx,bz){
 let [sx,sz]=toCell(ax,az),[ex,ez]=toCell(bx,bz);const start=nearestOpen(sx,sz),end=nearestOpen(ex,ez);
 if(!start||!end)return [];
 const idx=(x,z)=>x+z*NX,n=NX*NZ,from=new Int32Array(n).fill(-1),seen=new Uint8Array(n),queue=new Int32Array(n);
 const s=idx(...start),e=idx(...end);let head=0,tail=0;queue[tail++]=s;seen[s]=1;
 const offsets=[[1,0],[-1,0],[0,1],[0,-1]];
 while(head<tail){const at=queue[head++];if(at===e)break;const x=at%NX,z=Math.floor(at/NX);
  for(const [dx,dz] of offsets){const xx=x+dx,zz=z+dz;if(xx<0||xx>=NX||zz<0||zz>=NZ)continue;
   const id=idx(xx,zz);if(seen[id])continue;const [wx,wz]=toWorld(xx,zz);
   if(isBlocked(wx,wz,0,HUMAN_RADIUS,1.8))continue;seen[id]=1;from[id]=at;queue[tail++]=id;
  }
 }
 if(!seen[e])return [];
 const route=[];let cur=e;while(cur!==s&&cur>=0){route.push(toWorld(cur%NX,Math.floor(cur/NX)));cur=from[cur]}
 route.reverse();return route;
}
function hasSight(x1,z1,x2,z2){const distance=Math.hypot(x2-x1,z2-z1);for(let i=1;i<Math.ceil(distance/.25);i++){
 const t=i/(Math.ceil(distance/.25));if(isBlocked(x1+(x2-x1)*t,z1+(z2-z1)*t,0,.05,.6))return false;
}return true}
function ownerAI(dt){const d=Math.hypot(owner.position.x-cat.position.x,owner.position.z-cat.position.z),groundCat=cat.position.y<1.3;
 const visible=groundCat&&d<3.8&&hasSight(owner.position.x,owner.position.z,cat.position.x,cat.position.z);
 if(visible&&alertness>12)alertness=Math.min(100,alertness+dt*23);else alertness=Math.max(0,alertness-dt*4.1);
 const chase=groundCat&&alertness>58;
 if(patrolPause>0&&!chase){patrolPause-=dt;return}
 const goal=chase?[cat.position.x,cat.position.z]:patrol[patrolIndex];
 if(!chase&&Math.hypot(goal[0]-owner.position.x,goal[1]-owner.position.z)<.55){patrolIndex=(patrolIndex+1)%patrol.length;patrolPause=.4;ownerPath=[];return}
 pathTimer-=dt;
 if(pathTimer<=0||Math.hypot(goal[0]-pathGoal[0],goal[1]-pathGoal[1])>.85||!ownerPath.length){
  ownerPath=findPath(owner.position.x,owner.position.z,goal[0],goal[1]);pathGoal=[...goal];pathTimer=chase?.45:1.0;
 }
 while(ownerPath.length&&Math.hypot(ownerPath[0][0]-owner.position.x,ownerPath[0][1]-owner.position.z)<.28)ownerPath.shift();
 if(ownerPath.length){const [tx,tz]=ownerPath[0],dx=tx-owner.position.x,dz=tz-owner.position.z,len=Math.hypot(dx,dz);
  if(len>.025){const step=Math.min(len,(chase?2.1:1.16)*dt),nx=owner.position.x+dx/len*step,nz=owner.position.z+dz/len*step;
   if(!isBlocked(nx,nz,0,HUMAN_RADIUS,1.8)){owner.position.set(nx,0,nz);owner.rotation.y=Math.atan2(dx,dz)}else{pathTimer=0;ownerPath=[]}
   for(let i=0;i<limbs.length;i++)limbs[i].rotation.x=Math.sin(elapsed*(chase?11:6)+i*Math.PI)*.19;
  }
 }
 if(chase&&groundCat&&d<.83){
  score=Math.max(0,score-3);alertness=0;
  // The owner may catch the cat, but never teleports the player.
  toast('😾 Хозяин поймал! −3 🐟');sound('alert');ownerPath=[];
  patrolPause=Math.max(patrolPause,2.5);
 }
 if(alertness>25&&d>6)escaped=true;
}
// ------------------------------------------------------------------
// Kenney model placement. All positions are authored for THIS layout;
// small countertop props use the surface height of the piece below them.
const layout=[]; // All placed furniture is managed by player JSON saves.
const GLB_BASE='./assets/kenney/';const loader=new GLTFLoader(),modelPromises=new Map();
function getModel(name){if(!modelPromises.has(name))modelPromises.set(name,loader.loadAsync(ALL_CATALOG['kenney:'+name]||GLB_BASE+name+'.glb'));return modelPromises.get(name)}

const tinyPromise=loader.loadAsync('./assets/tinylivingpack.glb');
const tinyLookupPromise=tinyPromise.then(g=>{
 const root=g.scene.getObjectByName('GLTF_SceneRootNode')||g.scene;
 const lookup=new Map();
 root.traverse(obj=>{if(obj!==root&&obj.parent===root&&obj.name)lookup.set(obj.name,obj)});
 return lookup;
});
async function placeTiny(entry,id){
 const [name,x,z,floor,w,dpt,h,yaw,kind,action,solid=true]=entry;
 const lookup=await tinyLookupPromise; const source=lookup.get(name); if(!source) throw Error('Tiny model missing: '+name);
 const obj=source.clone(true); obj.updateMatrixWorld(true);
 const raw=new THREE.Box3().setFromObject(obj),size=raw.getSize(new THREE.Vector3()),center=raw.getCenter(new THREE.Vector3());
 if([size.x,size.y,size.z].filter(v=>Number.isFinite(v)&&v>1e-6).length<2)throw Error('Tiny zero size: '+name);
 const scale=Math.min(size.x>1e-6?w/size.x:Infinity,size.y>1e-6?h/size.y:Infinity,size.z>1e-6?dpt/size.z:Infinity);
 obj.position.set(-center.x,-raw.min.y,-center.z);
 const align=new THREE.Group(); align.add(obj); align.scale.setScalar(scale);
 const holder=new THREE.Group(); holder.position.set(x,floor,z); holder.rotation.y=yaw; holder.add(align); house.add(holder); holder.updateMatrixWorld(true);
 const bb=new THREE.Box3().setFromObject(holder);
 const piece={model:name.replace(/^TinyLiving_|^TinytLiving_/,'').replace(/_[0-9]+$/,''),holder,kind:'tiny',action,level:floor,floorY:floor,bounds:bb,height:bb.max.y-bb.min.y,used:false,vy:0,vx:0,vz:0,collider:null};
 if(solid){const inset=Math.min(.08,(bb.max.x-bb.min.x)*.12,(bb.max.z-bb.min.z)*.12); const b={x1:bb.min.x+inset,x2:bb.max.x-inset,z1:bb.min.z+inset,z2:bb.max.z-inset,y1:Math.max(floor,bb.min.y),y2:Math.min(bb.max.y,floor+1.8),source:'tiny'}; if(b.x1<b.x2&&b.z1<b.z2){colliders.push(b); addDebugBox(b); piece.collider=b;}}
 if(piece.collider&&!/art|painting|wall|mirror|rug|carpet/i.test(name)){
  const seating=/chair|bench|loveseat|sofa|pouffe|sitting|stool/i.test(name);
  const seatY=seating?Math.min(bb.max.y,bb.min.y+.55):bb.max.y;
  piece.collider.y2=seatY;
  piece.fullHeightCollider=!seating;
  piece.surface={x1:bb.min.x,x2:bb.max.x,z1:bb.min.z,z2:bb.max.z,y:seatY,fullTop:!seating,colliderRef:piece.collider};
  if(seating){piece.seatHeight=seatY-piece.holder.position.y;piece.seatFraction=(seatY-bb.min.y)/Math.max(.001,bb.max.y-bb.min.y);}
  walkableSurfaces.push(piece.surface);
 }
 if(action)interactables.push(piece); loaded++;registerEditable(id,piece,'Tiny Living · '+piece.model);
 return piece;
}
const tinyMainLayout=[];
function neighborTinyLayoutFor(x,z,id){ const rotFront=Math.PI; const out=[]; const v=id%4;
 out.push(['TinyLiving_Space-SavingSingle_13',x-3.8,z-3.65,0,2.55,2.25,1.45,0,'bed','scratch',true]);
 out.push(['TinyLiving_PowerTowerDresser_24',x-4.85,z+2.75,0,1.08,.60,1.28,Math.PI/2,'solid','scratch',true]);
 out.push(['TinyLiving_LovelyLoveseat_12',x+3.45,z-3.25,0,2.35,1.18,1.35,rotFront,'sofa','scratch',true]);
 out.push(['TinyLiving_SirCumferenceCoffeeTable_11',x+2.75,z+1.35,0,1.55,.95,.72,0,'table','scratch',true]);
 out.push(['TinyLiving_TieredShelf_29',x-5.1,z-0.15,0,1.25,.52,1.55,Math.PI/2,'solid','scratch',true]);
 if(v===0){ out.push(['TinyLiving_OrbitalHighDining_35',x+4.35,z+3.3,0,1.55,.92,.95,0,'table','scratch',true]); out.push(['TinyLiving_LovelyDiningChair_42',x+4.35,z+4.55,0,.58,.58,1.0,Math.PI,'chair','scratch',true]); out.push(['TinyLiving_LampWithoutStorage_20',x-1.2,z+4.1,0,.42,.42,1.75,0,'solid','knock',true]); }
 else if(v===1){ out.push(['TinyLiving_OpenShelf_31',x+5.0,z+2.25,0,1.02,.52,1.15,Math.PI/2,'solid','scratch',true]); out.push(['TinyLiving_ModernPouffe_36',x+1.1,z+3.8,0,.75,.75,.55,0,'chair','scratch',true]); out.push(['TinyLiving_SimpleandCleanArt_39',x+3.9,z-6.28,0,1.1,.15,.8,0,'decor','',false]); }
 else if(v===2){ out.push(['TinyLiving_TheSinkzBathroomVanity_32',x+4.9,z+2.4,0,1.15,.68,.90,Math.PI/2,'solid','scratch',true]); out.push(['TinyLiving_CompactLavatory_45',x+3.25,z+4.1,0,.72,.92,.95,0,'solid','',true]); out.push(['TinyLiving_MyKindaZen_22',x+0.7,z+4.2,0,1.1,.65,1.45,0,'solid','knock',true]); }
 else { out.push(['TinyLiving_TinyDeskForTinyLiving_37',x+4.25,z+2.5,0,1.65,.95,.92,0,'table','scratch',true]); out.push(['TinyLiving_NotQuiteOrbitalSitting_41',x+4.25,z+4.0,0,.72,.72,1.02,Math.PI,'chair','scratch',true]); out.push(['TinyLiving_TheModernDeskLamp_23',x+4.42,z+2.45,0.78,.32,.32,.52,0,'prop','knock',false]); }
 return out;
}

const collisionVisuals=new THREE.Group();scene.add(collisionVisuals);collisionVisuals.visible=false;
function addDebugBox(b){const w=b.x2-b.x1,d=b.z2-b.z1,h=b.y2-b.y1;if(h<=0)return;
 const mesh=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),new THREE.LineBasicMaterial({color:b.source==='wall'?0xe0a624:0x38e98b,transparent:true,opacity:.8}));
 mesh.position.set((b.x1+b.x2)/2,(b.y1+b.y2)/2,(b.z1+b.z2)/2);collisionVisuals.add(mesh);
}
for(const c of colliders)addDebugBox(c);

// ─── PRIVATE ESTATE: NEIGHBORHOOD REPLACED ──────────────────────
const oldDistrictColliderCount=colliders.length;
const trimMat=material('#fff3df');
const windowMat=new THREE.MeshStandardMaterial({color:'#9ad0e4',roughness:.16,transparent:true,opacity:.6});
const homeCenters=[],tinyNeighborhoodLayout=[];
const estateBuildings=[
 {name:'Гараж',x:38,z:-34,w:17,d:13,c:'#cdd5dd'},
 {name:'Сарай',x:-42,z:-31,w:12,d:11,c:'#c49c78'},
 {name:'Баня',x:40,z:35,w:14,d:12,c:'#d0b18b'},
 {name:'Теплица',x:-40,z:36,w:16,d:12,c:'#b2d4c4'}
];
function streetCollider(x,z,w,d,h){const b={x1:x-w/2,x2:x+w/2,z1:z-d/2,z2:z+d/2,y1:0,y2:h,source:'street'};colliders.push(b);addDebugBox(b);return b}
function streetThing(label,x,z,action,opts={}){
 const holder=new THREE.Group();holder.position.set(x,0,z);house.add(holder);
 const col=opts.color||'#e38c6a',mat=material(col);
 if(opts.shape==='plant'){
   const pot=new THREE.Mesh(new THREE.CylinderGeometry(.30,.22,.55,9),material('#ca7d61'));pot.position.y=.28;holder.add(pot);
   ball(.43,material('#57995b'),0,.85,0,holder,1,1.08,1);
 }else if(opts.shape==='bench'){
   const seat=new THREE.Mesh(new THREE.BoxGeometry(2,.17,.65),material('#b47b55'));seat.position.y=.6;holder.add(seat);
   for(const side of [-.8,.8])column(.065,.065,.6,material('#554c45'),side,.3,0,holder);
 }else if(opts.shape==='gnome'){
   ball(.3,material('#ecdbc5'),0,.38,0,holder);const hat=new THREE.Mesh(new THREE.ConeGeometry(.33,.65,8),material('#e54a4a'));hat.position.y=.85;holder.add(hat);
 }else{
   const cube=new THREE.Mesh(new THREE.BoxGeometry(.7,.62,.7),mat);cube.position.y=.31;holder.add(cube);
 }
 const piece={model:label,holder,kind:'street',action,level:0,floorY:0,used:false,vy:0,vx:0,vz:0,collider:null};
 if(opts.solid)piece.collider=streetCollider(x,z,opts.shape==='bench'?1.9:.58,opts.shape==='bench'?.54:.58,opts.shape==='bench'?.62:.7);
 interactables.push(piece);streetObjects.push(piece);return piece;
}

function estateBuilding(b){
 const {x,z,w,d}=b,H=3.4,m=material(b.c),roof=material('#806658');
 addBox(w,.22,d,material('#cab99a'),x,-.13,z,{top:true});
 addBox(w,H,.22,m,x,H/2,z-d/2,{wall:true});
 for(const side of [-1,1])addBox(.22,H,d,m,x+side*w/2,H/2,z,{wall:true});
 if(b.name==='Гараж'){
  // Two real openings in the front (+Z) facade: vehicle gate and pedestrian door.
  // Wall segments are built around the openings, so collision geometry leaves both paths free.
  const front=z+d/2,frontLeft=x-w/2,frontRight=x+w/2;
  const vehicleLeft=x-5.6,vehicleRight=x+.6,vehicleTop=2.85;
  const personLeft=x+4.45,personRight=x+5.9,personTop=2.45;
  function frontSegment(left,right,height=H,bottom=0){
   if(right<=left)return;
   addBox(right-left,height-bottom,.22,m,(left+right)/2,(height+bottom)/2,front,{wall:true});
  }
  frontSegment(frontLeft,vehicleLeft);
  frontSegment(vehicleRight,personLeft);
  frontSegment(personRight,frontRight);
  frontSegment(vehicleLeft,vehicleRight,H,vehicleTop);
  frontSegment(personLeft,personRight,H,personTop);
  // Raised sectional garage gate above the vehicle opening (the entrance remains open).
  const gateMat=material('#67798b'),gateEdge=material('#e2e8ed');
  for(let row=0;row<3;row++){
   const yy=vehicleTop+.08+row*.13;
   const panel=addBox(vehicleRight-vehicleLeft-.14,.105,.075,gateMat,(vehicleLeft+vehicleRight)/2,yy,front+.17);
   addBox(vehicleRight-vehicleLeft-.14,.018,.09,gateEdge,(vehicleLeft+vehicleRight)/2,yy+.054,front+.18);
  }
  for(const xx of [vehicleLeft,vehicleRight]){
   addBox(.13,vehicleTop,.26,trimMat,xx,vehicleTop/2,front+.09);
  }
  // Small pedestrian door is drawn opened sideways, without covering its walkable opening.
  for(const xx of [personLeft,personRight])addBox(.085,personTop,.20,trimMat,xx,personTop/2,front+.12);
  addBox(personRight-personLeft+.14,.12,.20,trimMat,(personLeft+personRight)/2,personTop+.05,front+.12);
  const doorPanel=addBox(.075,2.2,1.20,material('#8e5b43'),personLeft-.19,1.1,front+1.0);
  addBox(.10,.085,.12,material('#e7c263'),personLeft-.10,1.03,front+1.47);
  // No solid door or gate colliders: both entrances can be walked through.
 }else{
  for(const side of [-1,1])addBox((w-3.4)/2,H,.22,m,x+side*(w+3.4)/4,H/2,z+d/2,{wall:true});
  addBox(3.4,.52,.22,m,x,H-.26,z+d/2,{wall:true});
  for(const side of [-1,1]){addBox(1.5,1.2,.05,windowMat,x+side*w*.33,1.8,z+d/2+.14);addBox(.13,2.6,.17,trimMat,x+side*1.75,1.3,z+d/2+.15)}
 }
 // Proper gable roof: slopes run left/right across the facade (X), ridge runs in Z.
 const overhang=.55,ridgeRise=Math.min(1.45,Math.max(.85,w*.075));
 const angle=Math.atan2(ridgeRise,w/2);
 const slopedWidth=(w/2+overhang)/Math.cos(angle);
 for(const side of [-1,1]){
  const slab=addBox(slopedWidth,.19,d+overhang*2,roof,x+side*w/4,H+.14+ridgeRise/2,z);
  slab.rotation.z=-side*angle;
  roofPieces.push({mesh:slab,x,z});
 }
 // Triangular front and rear gables close the holes between flat walls and the pitched roof.
 for(const end of [-1,1]){
  const vertices=new Float32Array([
   x-w/2,H,z+end*d/2,
   x+w/2,H,z+end*d/2,
   x,H+ridgeRise,z+end*d/2
  ]);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(vertices,3));
  geo.computeVertexNormals();
  const gable=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:b.c,roughness:.85,side:THREE.DoubleSide}));
  house.add(gable);
 }
 // Slim ridge cap seals the seam between the two overlapping roof slabs.
 addBox(.24,.16,d+overhang*2,roof,x,H+.15+ridgeRise,z);

}
for(const b of estateBuildings)estateBuilding(b);


// Furnish the actual estate outbuildings from the existing Tiny Living pack.
// Positions are inside their accessible doorways; furniture stays editable.
const estateInteriorLayout=[];
// No procedural scenery, pool, planted beds, paths or trees.
for(const c of colliders.slice(oldDistrictColliderCount))if(c.source==='wall')addDebugBox(c);

let loaded=0,failed=0;
async function place(d,id){const [model,x,z,floor,w,dpt,h,yaw,kind,action]=d;
 const result=await getModel(model);const obj=result.scene.clone(true);obj.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(obj),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 if([size.x,size.y,size.z].filter(v=>Number.isFinite(v)&&v>.00001).length<2)throw Error('Bad dimensions '+model);
 const scale=Math.min(size.x>.00001?w/size.x:Infinity,size.y>.00001?h/size.y:Infinity,size.z>.00001?dpt/size.z:Infinity);
 const align=new THREE.Group();obj.position.set(-center.x,-bounds.min.y,-center.z);align.add(obj);align.scale.setScalar(scale);
 const holder=new THREE.Group();holder.position.set(x,floor,z);holder.rotation.y=yaw;holder.add(align);
 holder.traverse(n=>{if(n.isMesh){n.castShadow=false;n.receiveShadow=false}});house.add(holder);holder.updateMatrixWorld(true);
 const bb=new THREE.Box3().setFromObject(holder);
 const furniturePiece={model,holder,kind,action,level:floorOf(floor),floorY:floor,bounds:bb,height:bb.max.y-bb.min.y,scratched:false,used:false,vy:0,vx:0,vz:0};furniture.push(furniturePiece);
 if(kind!=='rug'&&kind!=='decor'&&kind!=='prop'){
  let blockTop=bb.max.y;
  let seat=null;
  if(kind==='sofa')seat=floor+.55;
  else if(kind==='bed')seat=floor+.69;
  else if(kind==='chair')seat=floor+.48;
  else if(kind==='table')seat=bb.max.y-.06;
  if(seat!=null){blockTop=Math.min(blockTop,seat);furniturePiece.seatHeight=blockTop-floor;furniturePiece.seatFraction=(blockTop-bb.min.y)/Math.max(.001,bb.max.y-bb.min.y);furniturePiece.surface={x1:bb.min.x,x2:bb.max.x,z1:bb.min.z,z2:bb.max.z,y:blockTop};walkableSurfaces.push(furniturePiece.surface)}
  const box={x1:bb.min.x+.02,x2:bb.max.x-.02,z1:bb.min.z+.02,z2:bb.max.z-.02,y1:bb.min.y,y2:blockTop,source:'furniture'};
  colliders.push(box);addDebugBox(box);furniturePiece.collider=box;if(furniturePiece.surface)furniturePiece.surface.colliderRef=box;
 }
 // Full-height model collision plus top support for furniture not already marked as a seat/table.
 if(furniturePiece.collider&&kind!=='decor'&&kind!=='rug'){
  furniturePiece.fullHeightCollider=!furniturePiece.surface;
  if(!furniturePiece.surface)furniturePiece.collider.y2=bb.max.y;
  if(!furniturePiece.surface){
   furniturePiece.surface={x1:bb.min.x,x2:bb.max.x,z1:bb.min.z,z2:bb.max.z,y:bb.max.y,fullTop:true};
   walkableSurfaces.push(furniturePiece.surface);
  }
  furniturePiece.surface.colliderRef=furniturePiece.collider;
 }
 if(action)interactables.push(furniturePiece);
 loaded++;registerEditable(id,furniturePiece,'Kenney · '+model);
 return furniturePiece;
}
// Imported garden: models are deliberately positioned beyond the house footprint.
// tuple: pack, file, display name, x, z, max width, max depth, max height, angle, action, solid
const gardenLayout=[];
const gardenCache=new Map();let yardLoaded=0;
function getGardenModel(pack,name){const key=pack+'_'+name;if(!gardenCache.has(key))gardenCache.set(key,loader.loadAsync(ALL_CATALOG[pack+':'+name]||'./assets/outdoor/'+key+'.glb'));return gardenCache.get(key)}
async function placeGarden(entry,id){const [pack,name,label,x,z,w,d,h,yaw,action,solid]=entry;
 const result=await getGardenModel(pack,name),obj=result.scene.clone(true);
 obj.updateMatrixWorld(true);const raw=new THREE.Box3().setFromObject(obj),size=raw.getSize(new THREE.Vector3()),center=raw.getCenter(new THREE.Vector3());
 // Doors, signs and panels may be flat on one axis; this is valid 2D geometry.
 const activeAxes=[size.x,size.y,size.z].filter(v=>Number.isFinite(v)&&v>.000001);
 if(activeAxes.length<2)throw Error('Модель не содержит пригодной геометрии: '+pack+' '+name);
 const ratios=[size.x>.000001?w/size.x:Infinity,size.y>.000001?h/size.y:Infinity,size.z>.000001?d/size.z:Infinity];
 const scale=Math.min(...ratios);obj.position.set(-center.x,-raw.min.y,-center.z);
 const aligned=new THREE.Group();aligned.add(obj);aligned.scale.setScalar(scale);
 const holder=new THREE.Group();holder.position.set(x,0,z);holder.rotation.y=yaw;holder.add(aligned);house.add(holder);holder.updateMatrixWorld(true);
 const bb=new THREE.Box3().setFromObject(holder);
 const piece={model:label,holder,kind:'yard',action,level:0,floorY:0,bounds:bb,height:bb.max.y-bb.min.y,used:false,vy:0,vx:0,vz:0,collider:null};
 // Solid imported objects block the cat at their real full height. Flat decoration,
 // roads, flowers and grass are non-solid. Trees block only at the trunk (not the canopy).
 const keyName=(pack+':'+name).toLowerCase();
 const tree=/tree|birch|pine|palm/.test(keyName);
 const groundDecor=/road|path|paving|tile|grass|flower|mushroom|fern|seedling|carpet|rug|decal/.test(keyName);
 const flat=bb.max.y-bb.min.y<.09;
 const physical=!groundDecor&&!flat&&!/sign|poster|painting|wall_art/.test(keyName);
 if(tree){
  const r=Math.max(.25,Math.min(.58,(bb.max.x-bb.min.x)*.12));
  const b={x1:x-r,x2:x+r,z1:z-r,z2:z+r,y1:bb.min.y,y2:Math.min(bb.max.y,2.2),source:'tree'};
  colliders.push(b);addDebugBox(b);piece.collider=b;piece.trunkCollider=true;piece.trunkRadius=r;
 }else if(physical){
  const inset=Math.min(.035,(bb.max.x-bb.min.x)*.035,(bb.max.z-bb.min.z)*.035);
  const b={x1:bb.min.x+inset,x2:bb.max.x-inset,z1:bb.min.z+inset,z2:bb.max.z-inset,y1:bb.min.y,y2:bb.max.y,source:'garden'};
  if(b.x1<b.x2&&b.z1<b.z2){
   colliders.push(b);addDebugBox(b);piece.collider=b;
   // When jumping onto a physical object, the top supports the cat.
   const seating=/bench|chair|sofa|stool|seat/i.test(keyName);
   const seatY=seating?Math.min(bb.max.y,bb.min.y+.56):bb.max.y;
   b.y2=seatY;
   piece.fullHeightCollider=!seating;
   piece.surface={x1:bb.min.x,x2:bb.max.x,z1:bb.min.z,z2:bb.max.z,y:seatY,fullTop:!seating,colliderRef:b};
   if(seating){piece.seatHeight=seatY-piece.holder.position.y;piece.seatFraction=(seatY-bb.min.y)/Math.max(.001,bb.max.y-bb.min.y);}
   walkableSurfaces.push(piece.surface);
  }
 }
 if(action)interactables.push(piece);yardLoaded++;registerEditable(id,piece,'Сад · '+label);
 return piece;
}

// In-browser layout editor: choose furniture, drag on the floor plane, rotate and save.
const editorPanel=document.createElement('section');editorPanel.id='furnitureEditor';
editorPanel.innerHTML=`<header>🛠️ Редактор мира <button id="edToggle">Закрыть</button></header>
 <div class="edLine"><button id="edModeFurniture">🪑 Мебель</button><button id="edModeWalls">🧱 Стены</button></div>
 <div id="edFurnitureTools">
 <div class="edSmall">🖱️ ЛКМ по предмету — выбрать/перетащить. ПКМ — вращать камеру. Средняя кнопка — двигать камеру. Колесо — приближать. WASD — перемещать камеру, Пробел/E — вверх, Q — вниз, Shift — быстрее. На телефоне: режим «Камера» для свайпа и два пальца для зума.</div>
 <div class="edLine"><button id="edCameraMode">📷 Камера</button><button id="edFocus">🎯 К предмету</button><button id="edTop">⬇ Вид сверху</button></div>
 <div id="edSelected">Предмет не выбран</div>
 <div class="edLine"><button id="edLeft">←</button><button id="edForward">↑</button><button id="edBack">↓</button><button id="edRight">→</button><button id="edRotL">↶</button><button id="edRotR">↷</button></div>
 <div class="edLine"><button id="edFineUp">⬆ Выше +5 см</button><button id="edFineDown">⬇ Ниже −5 см</button></div>
 <div class="edLine"><button id="edScaleUp">🔎 Размер +5%</button><button id="edScaleDown">Размер −5%</button><button id="edScaleReset">100%</button></div>
 <div class="edLine"><button id="edUp">Этаж ↑</button><button id="edDown">Этаж ↓</button><button id="edRemove">Убрать</button></div>
 <label for="edCategory">Категория:</label><select id="edCategory"></select><label for="edPack">Набор:</label><select id="edPack"></select>
 <label for="edCatalog">Модель:</label><input id="edSearch" placeholder="🔎 Найти модель" style="width:100%;padding:9px;margin-top:5px;border-radius:8px"><select id="edCatalog" size="6" style="height:155px"></select>
 <div id="edPreviewStatus" class="edSmall">Выбери модель — увидишь её перед размещением.</div>
 <canvas id="edPreview" width="300" height="200" style="width:100%;height:190px;border-radius:12px;background:#dce9eb;touch-action:none"></canvas>
 <div class="edLine"><button id="edAdd">＋ Добавить выбранное</button><button id="edSave">💾 Сохранить</button></div>
 <div class="edLine"><button id="edExport">⬇ Экспорт JSON</button><label class="edImport">⬆ Импорт JSON<input type="file" id="edImportFile" accept=".json,application/json" hidden></label></div>
 <div class="edLine"><button id="edStarter">🏡 Стартовая расстановка</button><button id="edReset">↺ Вернуть мою расстановку</button></div>
 <div class="edSmall">Все перемещения сохраняются в браузере. Экспортируй JSON и пришли мне: я перенесу твою расстановку в исходный код игры.</div>
 </div>
 <div id="edWallTools" style="display:none">
 <div class="edSmall">🧱 Выбирай стену мышью. Размеры в метрах. Изменения сохраняются отдельно от мебели.</div>
 <div class="edLine"><button id="edWallAdd">＋ Новая стена перед камерой</button></div>
 <div id="edWallSelected" class="edSmall">Выбери стену или добавь новую</div>
 <div class="edLine"><label style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:120px">Длина (<span id="edWallLengthValue">3</span> м)<input id="edWallLengthSlider" type="range" min="0.4" max="30" step="0.1" value="3" style="width:100%"><input id="edWallLength" type="number" min="0.4" max="30" step="0.1" value="3" style="width:100%"></label>
 <label style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:120px">Высота (<span id="edWallHeightValue">2.7</span> м)<input id="edWallHeightSlider" type="range" min="0.4" max="9" step="0.1" value="2.7" style="width:100%"><input id="edWallHeight" type="number" min="0.4" max="9" step="0.1" value="2.7" style="width:100%"></label>
 <label style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:120px">Толщина (<span id="edWallThicknessValue">0.2</span> м)<input id="edWallThicknessSlider" type="range" min="0.08" max="1.2" step="0.02" value="0.2" style="width:100%"><input id="edWallThickness" type="number" min="0.08" max="1.2" step="0.02" value="0.2" style="width:100%"></label></div>
 <div class="edLine"><label>Проём <select id="edWallOpening"><option value="none">Без проёма</option><option value="door">Дверной</option><option value="window">Оконный</option></select></label>
 <label>Ширина <input id="edWallOpeningWidth" type="number" min=".4" max="12" step=".1" value="1.2" style="width:65px"></label></div>
 <div class="edLine"><label>Высота проёма <input id="edWallOpeningHeight" type="number" min=".3" max="6" step=".1" value="2.2" style="width:65px"></label>
 <label>Низ окна <input id="edWallSill" type="number" min="0" max="6" step=".1" value="1" style="width:65px"></label></div>
 <div class="edLine"><button id="edWallApply">✅ Применить</button><button id="edWallRotate">↻ Повернуть 90°</button></div>
 <div class="edLine"><button id="edWallLeft">←</button><button id="edWallRight">→</button><button id="edWallForward">↑</button><button id="edWallBack">↓</button><button id="edWallUp">+5 см</button><button id="edWallDown">−5 см</button></div>
 <div class="edLine"><button id="edWallReset">↶ Вернуть / удалить стену</button><button id="edWallSave">💾 Сохранить стены</button><button id="edWallExport">⬇ Стены JSON</button></div>
 </div>`;
document.body.append(editorPanel);
const editorButton=document.createElement('button');editorButton.id='editorButton';editorButton.textContent='🛠️ Мебель';document.body.append(editorButton);
const ALL_CATALOG={"kenney:bathroomCabinet":"./assets/kenney/bathroomCabinet.glb","kenney:bathroomCabinetDrawer":"./assets/catalog/kenney_bathroomCabinetDrawer.glb","kenney:bathroomMirror":"./assets/kenney/bathroomMirror.glb","kenney:bathroomSink":"./assets/kenney/bathroomSink.glb","kenney:bathroomSinkSquare":"./assets/catalog/kenney_bathroomSinkSquare.glb","kenney:bathtub":"./assets/kenney/bathtub.glb","kenney:bear":"./assets/kenney/bear.glb","kenney:bedBunk":"./assets/catalog/kenney_bedBunk.glb","kenney:bedDouble":"./assets/kenney/bedDouble.glb","kenney:bedSingle":"./assets/catalog/kenney_bedSingle.glb","kenney:bench":"./assets/catalog/kenney_bench.glb","kenney:benchCushion":"./assets/kenney/benchCushion.glb","kenney:benchCushionLow":"./assets/catalog/kenney_benchCushionLow.glb","kenney:bookcaseClosed":"./assets/kenney/bookcaseClosed.glb","kenney:bookcaseClosedDoors":"./assets/catalog/kenney_bookcaseClosedDoors.glb","kenney:bookcaseClosedWide":"./assets/kenney/bookcaseClosedWide.glb","kenney:bookcaseOpen":"./assets/kenney/bookcaseOpen.glb","kenney:bookcaseOpenLow":"./assets/kenney/bookcaseOpenLow.glb","kenney:books":"./assets/kenney/books.glb","kenney:cabinetBed":"./assets/catalog/kenney_cabinetBed.glb","kenney:cabinetBedDrawer":"./assets/catalog/kenney_cabinetBedDrawer.glb","kenney:cabinetBedDrawerTable":"./assets/catalog/kenney_cabinetBedDrawerTable.glb","kenney:cabinetTelevision":"./assets/kenney/cabinetTelevision.glb","kenney:cabinetTelevisionDoors":"./assets/catalog/kenney_cabinetTelevisionDoors.glb","kenney:cardboardBoxClosed":"./assets/catalog/kenney_cardboardBoxClosed.glb","kenney:cardboardBoxOpen":"./assets/kenney/cardboardBoxOpen.glb","kenney:ceilingFan":"./assets/catalog/kenney_ceilingFan.glb","kenney:chair":"./assets/catalog/kenney_chair.glb","kenney:chairCushion":"./assets/kenney/chairCushion.glb","kenney:chairDesk":"./assets/kenney/chairDesk.glb","kenney:chairModernCushion":"./assets/catalog/kenney_chairModernCushion.glb","kenney:chairModernFrameCushion":"./assets/catalog/kenney_chairModernFrameCushion.glb","kenney:chairRounded":"./assets/kenney/chairRounded.glb","kenney:coatRack":"./assets/catalog/kenney_coatRack.glb","kenney:coatRackStanding":"./assets/kenney/coatRackStanding.glb","kenney:computerKeyboard":"./assets/kenney/computerKeyboard.glb","kenney:computerMouse":"./assets/catalog/kenney_computerMouse.glb","kenney:computerScreen":"./assets/kenney/computerScreen.glb","kenney:desk":"./assets/kenney/desk.glb","kenney:deskCorner":"./assets/catalog/kenney_deskCorner.glb","kenney:doorway":"./assets/catalog/kenney_doorway.glb","kenney:doorwayFront":"./assets/catalog/kenney_doorwayFront.glb","kenney:doorwayOpen":"./assets/catalog/kenney_doorwayOpen.glb","kenney:dryer":"./assets/catalog/kenney_dryer.glb","kenney:floorCorner":"./assets/catalog/kenney_floorCorner.glb","kenney:floorCornerRound":"./assets/catalog/kenney_floorCornerRound.glb","kenney:floorFull":"./assets/catalog/kenney_floorFull.glb","kenney:floorHalf":"./assets/catalog/kenney_floorHalf.glb","kenney:hoodLarge":"./assets/catalog/kenney_hoodLarge.glb","kenney:hoodModern":"./assets/catalog/kenney_hoodModern.glb","kenney:kitchenBar":"./assets/catalog/kenney_kitchenBar.glb","kenney:kitchenBarEnd":"./assets/catalog/kenney_kitchenBarEnd.glb","kenney:kitchenBlender":"./assets/catalog/kenney_kitchenBlender.glb","kenney:kitchenCabinet":"./assets/kenney/kitchenCabinet.glb","kenney:kitchenCabinetCornerInner":"./assets/catalog/kenney_kitchenCabinetCornerInner.glb","kenney:kitchenCabinetCornerRound":"./assets/catalog/kenney_kitchenCabinetCornerRound.glb","kenney:kitchenCabinetDrawer":"./assets/catalog/kenney_kitchenCabinetDrawer.glb","kenney:kitchenCabinetUpper":"./assets/catalog/kenney_kitchenCabinetUpper.glb","kenney:kitchenCabinetUpperCorner":"./assets/catalog/kenney_kitchenCabinetUpperCorner.glb","kenney:kitchenCabinetUpperDouble":"./assets/catalog/kenney_kitchenCabinetUpperDouble.glb","kenney:kitchenCabinetUpperLow":"./assets/catalog/kenney_kitchenCabinetUpperLow.glb","kenney:kitchenCoffeeMachine":"./assets/kenney/kitchenCoffeeMachine.glb","kenney:kitchenFridge":"./assets/catalog/kenney_kitchenFridge.glb","kenney:kitchenFridgeBuiltIn":"./assets/catalog/kenney_kitchenFridgeBuiltIn.glb","kenney:kitchenFridgeLarge":"./assets/kenney/kitchenFridgeLarge.glb","kenney:kitchenFridgeSmall":"./assets/catalog/kenney_kitchenFridgeSmall.glb","kenney:kitchenMicrowave":"./assets/kenney/kitchenMicrowave.glb","kenney:kitchenSink":"./assets/kenney/kitchenSink.glb","kenney:kitchenStove":"./assets/kenney/kitchenStove.glb","kenney:kitchenStoveElectric":"./assets/catalog/kenney_kitchenStoveElectric.glb","kenney:lampRoundFloor":"./assets/kenney/lampRoundFloor.glb","kenney:lampRoundTable":"./assets/kenney/lampRoundTable.glb","kenney:lampSquareCeiling":"./assets/catalog/kenney_lampSquareCeiling.glb","kenney:lampSquareFloor":"./assets/kenney/lampSquareFloor.glb","kenney:lampSquareTable":"./assets/catalog/kenney_lampSquareTable.glb","kenney:lampWall":"./assets/catalog/kenney_lampWall.glb","kenney:laptop":"./assets/kenney/laptop.glb","kenney:loungeChair":"./assets/kenney/loungeChair.glb","kenney:loungeChairRelax":"./assets/catalog/kenney_loungeChairRelax.glb","kenney:loungeDesignChair":"./assets/catalog/kenney_loungeDesignChair.glb","kenney:loungeDesignSofa":"./assets/catalog/kenney_loungeDesignSofa.glb","kenney:loungeDesignSofaCorner":"./assets/catalog/kenney_loungeDesignSofaCorner.glb","kenney:loungeSofa":"./assets/kenney/loungeSofa.glb","kenney:loungeSofaCorner":"./assets/catalog/kenney_loungeSofaCorner.glb","kenney:loungeSofaLong":"./assets/kenney/loungeSofaLong.glb","kenney:loungeSofaOttoman":"./assets/catalog/kenney_loungeSofaOttoman.glb","kenney:paneling":"./assets/catalog/kenney_paneling.glb","kenney:pillow":"./assets/kenney/pillow.glb","kenney:pillowBlue":"./assets/kenney/pillowBlue.glb","kenney:pillowBlueLong":"./assets/catalog/kenney_pillowBlueLong.glb","kenney:pillowLong":"./assets/catalog/kenney_pillowLong.glb","kenney:plantSmall1":"./assets/kenney/plantSmall1.glb","kenney:plantSmall2":"./assets/catalog/kenney_plantSmall2.glb","kenney:plantSmall3":"./assets/kenney/plantSmall3.glb","kenney:pottedPlant":"./assets/kenney/pottedPlant.glb","kenney:radio":"./assets/kenney/radio.glb","kenney:rugDoormat":"./assets/kenney/rugDoormat.glb","kenney:rugRectangle":"./assets/kenney/rugRectangle.glb","kenney:rugRound":"./assets/kenney/rugRound.glb","kenney:rugRounded":"./assets/kenney/rugRounded.glb","kenney:rugSquare":"./assets/kenney/rugSquare.glb","kenney:shower":"./assets/catalog/kenney_shower.glb","kenney:showerRound":"./assets/catalog/kenney_showerRound.glb","kenney:sideTable":"./assets/kenney/sideTable.glb","kenney:sideTableDrawers":"./assets/kenney/sideTableDrawers.glb","kenney:speaker":"./assets/catalog/kenney_speaker.glb","kenney:speakerSmall":"./assets/catalog/kenney_speakerSmall.glb","kenney:stairs":"./assets/catalog/kenney_stairs.glb","kenney:stairsCorner":"./assets/catalog/kenney_stairsCorner.glb","kenney:stairsOpen":"./assets/catalog/kenney_stairsOpen.glb","kenney:stairsOpenSingle":"./assets/catalog/kenney_stairsOpenSingle.glb","kenney:stoolBar":"./assets/catalog/kenney_stoolBar.glb","kenney:stoolBarSquare":"./assets/catalog/kenney_stoolBarSquare.glb","kenney:table":"./assets/kenney/table.glb","kenney:tableCloth":"./assets/kenney/tableCloth.glb","kenney:tableCoffee":"./assets/kenney/tableCoffee.glb","kenney:tableCoffeeGlass":"./assets/catalog/kenney_tableCoffeeGlass.glb","kenney:tableCoffeeGlassSquare":"./assets/catalog/kenney_tableCoffeeGlassSquare.glb","kenney:tableCoffeeSquare":"./assets/kenney/tableCoffeeSquare.glb","kenney:tableCross":"./assets/catalog/kenney_tableCross.glb","kenney:tableCrossCloth":"./assets/catalog/kenney_tableCrossCloth.glb","kenney:tableGlass":"./assets/catalog/kenney_tableGlass.glb","kenney:tableRound":"./assets/catalog/kenney_tableRound.glb","kenney:televisionAntenna":"./assets/catalog/kenney_televisionAntenna.glb","kenney:televisionModern":"./assets/catalog/kenney_televisionModern.glb","kenney:televisionVintage":"./assets/catalog/kenney_televisionVintage.glb","kenney:toaster":"./assets/catalog/kenney_toaster.glb","kenney:toilet":"./assets/kenney/toilet.glb","kenney:toiletSquare":"./assets/catalog/kenney_toiletSquare.glb","kenney:trashcan":"./assets/kenney/trashcan.glb","kenney:wall":"./assets/catalog/kenney_wall.glb","kenney:wallCorner":"./assets/catalog/kenney_wallCorner.glb","kenney:wallCornerRond":"./assets/catalog/kenney_wallCornerRond.glb","kenney:wallDoorway":"./assets/catalog/kenney_wallDoorway.glb","kenney:wallDoorwayWide":"./assets/catalog/kenney_wallDoorwayWide.glb","kenney:wallHalf":"./assets/catalog/kenney_wallHalf.glb","kenney:wallWindow":"./assets/catalog/kenney_wallWindow.glb","kenney:wallWindowSlide":"./assets/catalog/kenney_wallWindowSlide.glb","kenney:washer":"./assets/catalog/kenney_washer.glb","kenney:washerDryerStacked":"./assets/catalog/kenney_washerDryerStacked.glb","nature:bed":"./assets/catalog/nature_bed.glb","nature:bed_floor":"./assets/catalog/nature_bed_floor.glb","nature:bridge_center_stone":"./assets/catalog/nature_bridge_center_stone.glb","nature:bridge_center_stoneRound":"./assets/catalog/nature_bridge_center_stoneRound.glb","nature:bridge_center_wood":"./assets/catalog/nature_bridge_center_wood.glb","nature:bridge_center_woodRound":"./assets/catalog/nature_bridge_center_woodRound.glb","nature:bridge_side_stone":"./assets/catalog/nature_bridge_side_stone.glb","nature:bridge_side_stoneRound":"./assets/catalog/nature_bridge_side_stoneRound.glb","nature:bridge_side_wood":"./assets/catalog/nature_bridge_side_wood.glb","nature:bridge_side_woodRound":"./assets/catalog/nature_bridge_side_woodRound.glb","nature:bridge_stone":"./assets/catalog/nature_bridge_stone.glb","nature:bridge_stoneNarrow":"./assets/catalog/nature_bridge_stoneNarrow.glb","nature:bridge_stoneRound":"./assets/catalog/nature_bridge_stoneRound.glb","nature:bridge_stoneRoundNarrow":"./assets/catalog/nature_bridge_stoneRoundNarrow.glb","nature:bridge_wood":"./assets/catalog/nature_bridge_wood.glb","nature:bridge_woodNarrow":"./assets/catalog/nature_bridge_woodNarrow.glb","nature:bridge_woodRound":"./assets/catalog/nature_bridge_woodRound.glb","nature:bridge_woodRoundNarrow":"./assets/catalog/nature_bridge_woodRoundNarrow.glb","nature:cactus_short":"./assets/catalog/nature_cactus_short.glb","nature:cactus_tall":"./assets/catalog/nature_cactus_tall.glb","nature:campfire_bricks":"./assets/catalog/nature_campfire_bricks.glb","nature:campfire_logs":"./assets/catalog/nature_campfire_logs.glb","nature:campfire_planks":"./assets/catalog/nature_campfire_planks.glb","nature:campfire_stones":"./assets/catalog/nature_campfire_stones.glb","nature:canoe":"./assets/catalog/nature_canoe.glb","nature:canoe_paddle":"./assets/catalog/nature_canoe_paddle.glb","nature:cliff_blockCave_rock":"./assets/catalog/nature_cliff_blockCave_rock.glb","nature:cliff_blockCave_stone":"./assets/catalog/nature_cliff_blockCave_stone.glb","nature:cliff_blockDiagonal_rock":"./assets/catalog/nature_cliff_blockDiagonal_rock.glb","nature:cliff_blockDiagonal_stone":"./assets/catalog/nature_cliff_blockDiagonal_stone.glb","nature:cliff_blockHalf_rock":"./assets/catalog/nature_cliff_blockHalf_rock.glb","nature:cliff_blockHalf_stone":"./assets/catalog/nature_cliff_blockHalf_stone.glb","nature:cliff_blockQuarter_rock":"./assets/catalog/nature_cliff_blockQuarter_rock.glb","nature:cliff_blockQuarter_stone":"./assets/catalog/nature_cliff_blockQuarter_stone.glb","nature:cliff_blockSlopeHalfWalls_rock":"./assets/catalog/nature_cliff_blockSlopeHalfWalls_rock.glb","nature:cliff_blockSlopeHalfWalls_stone":"./assets/catalog/nature_cliff_blockSlopeHalfWalls_stone.glb","nature:cliff_blockSlopeWalls_rock":"./assets/catalog/nature_cliff_blockSlopeWalls_rock.glb","nature:cliff_blockSlopeWalls_stone":"./assets/catalog/nature_cliff_blockSlopeWalls_stone.glb","nature:cliff_blockSlope_rock":"./assets/catalog/nature_cliff_blockSlope_rock.glb","nature:cliff_blockSlope_stone":"./assets/catalog/nature_cliff_blockSlope_stone.glb","nature:cliff_block_rock":"./assets/catalog/nature_cliff_block_rock.glb","nature:cliff_block_stone":"./assets/catalog/nature_cliff_block_stone.glb","nature:cliff_cave_rock":"./assets/catalog/nature_cliff_cave_rock.glb","nature:cliff_cave_stone":"./assets/catalog/nature_cliff_cave_stone.glb","nature:cliff_cornerInnerLarge_rock":"./assets/catalog/nature_cliff_cornerInnerLarge_rock.glb","nature:cliff_cornerInnerLarge_stone":"./assets/catalog/nature_cliff_cornerInnerLarge_stone.glb","nature:cliff_cornerInnerTop_rock":"./assets/catalog/nature_cliff_cornerInnerTop_rock.glb","nature:cliff_cornerInnerTop_stone":"./assets/catalog/nature_cliff_cornerInnerTop_stone.glb","nature:cliff_cornerInner_rock":"./assets/catalog/nature_cliff_cornerInner_rock.glb","nature:cliff_cornerInner_stone":"./assets/catalog/nature_cliff_cornerInner_stone.glb","nature:cliff_cornerLarge_rock":"./assets/catalog/nature_cliff_cornerLarge_rock.glb","nature:cliff_cornerLarge_stone":"./assets/catalog/nature_cliff_cornerLarge_stone.glb","nature:cliff_cornerTop_rock":"./assets/catalog/nature_cliff_cornerTop_rock.glb","nature:cliff_cornerTop_stone":"./assets/catalog/nature_cliff_cornerTop_stone.glb","nature:cliff_corner_rock":"./assets/catalog/nature_cliff_corner_rock.glb","nature:cliff_corner_stone":"./assets/catalog/nature_cliff_corner_stone.glb","nature:cliff_diagonal_rock":"./assets/catalog/nature_cliff_diagonal_rock.glb","nature:cliff_diagonal_stone":"./assets/catalog/nature_cliff_diagonal_stone.glb","nature:cliff_halfCornerInner_rock":"./assets/catalog/nature_cliff_halfCornerInner_rock.glb","nature:cliff_halfCornerInner_stone":"./assets/catalog/nature_cliff_halfCornerInner_stone.glb","nature:cliff_halfCorner_rock":"./assets/catalog/nature_cliff_halfCorner_rock.glb","nature:cliff_halfCorner_stone":"./assets/catalog/nature_cliff_halfCorner_stone.glb","nature:cliff_half_rock":"./assets/catalog/nature_cliff_half_rock.glb","nature:cliff_half_stone":"./assets/catalog/nature_cliff_half_stone.glb","nature:cliff_large_rock":"./assets/catalog/nature_cliff_large_rock.glb","nature:cliff_large_stone":"./assets/catalog/nature_cliff_large_stone.glb","nature:cliff_rock":"./assets/catalog/nature_cliff_rock.glb","nature:cliff_stepsCornerInner_rock":"./assets/catalog/nature_cliff_stepsCornerInner_rock.glb","nature:cliff_stepsCornerInner_stone":"./assets/catalog/nature_cliff_stepsCornerInner_stone.glb","nature:cliff_stepsCorner_rock":"./assets/catalog/nature_cliff_stepsCorner_rock.glb","nature:cliff_stepsCorner_stone":"./assets/catalog/nature_cliff_stepsCorner_stone.glb","nature:cliff_steps_rock":"./assets/catalog/nature_cliff_steps_rock.glb","nature:cliff_steps_stone":"./assets/catalog/nature_cliff_steps_stone.glb","nature:cliff_stone":"./assets/catalog/nature_cliff_stone.glb","nature:cliff_topDiagonal_rock":"./assets/catalog/nature_cliff_topDiagonal_rock.glb","nature:cliff_topDiagonal_stone":"./assets/catalog/nature_cliff_topDiagonal_stone.glb","nature:cliff_top_rock":"./assets/catalog/nature_cliff_top_rock.glb","nature:cliff_top_stone":"./assets/catalog/nature_cliff_top_stone.glb","nature:cliff_waterfallTop_rock":"./assets/catalog/nature_cliff_waterfallTop_rock.glb","nature:cliff_waterfallTop_stone":"./assets/catalog/nature_cliff_waterfallTop_stone.glb","nature:cliff_waterfall_rock":"./assets/catalog/nature_cliff_waterfall_rock.glb","nature:cliff_waterfall_stone":"./assets/catalog/nature_cliff_waterfall_stone.glb","nature:crops_bambooStageA":"./assets/catalog/nature_crops_bambooStageA.glb","nature:crops_bambooStageB":"./assets/catalog/nature_crops_bambooStageB.glb","nature:crops_cornStageA":"./assets/catalog/nature_crops_cornStageA.glb","nature:crops_cornStageB":"./assets/catalog/nature_crops_cornStageB.glb","nature:crops_cornStageC":"./assets/catalog/nature_crops_cornStageC.glb","nature:crops_cornStageD":"./assets/catalog/nature_crops_cornStageD.glb","nature:crops_dirtDoubleRow":"./assets/catalog/nature_crops_dirtDoubleRow.glb","nature:crops_dirtDoubleRowCorner":"./assets/catalog/nature_crops_dirtDoubleRowCorner.glb","nature:crops_dirtDoubleRowEnd":"./assets/catalog/nature_crops_dirtDoubleRowEnd.glb","nature:crops_dirtRow":"./assets/catalog/nature_crops_dirtRow.glb","nature:crops_dirtRowCorner":"./assets/catalog/nature_crops_dirtRowCorner.glb","nature:crops_dirtRowEnd":"./assets/catalog/nature_crops_dirtRowEnd.glb","nature:crops_dirtSingle":"./assets/catalog/nature_crops_dirtSingle.glb","nature:crops_leafsStageA":"./assets/catalog/nature_crops_leafsStageA.glb","nature:crops_leafsStageB":"./assets/catalog/nature_crops_leafsStageB.glb","nature:crops_wheatStageA":"./assets/catalog/nature_crops_wheatStageA.glb","nature:crops_wheatStageB":"./assets/catalog/nature_crops_wheatStageB.glb","nature:crop_carrot":"./assets/catalog/nature_crop_carrot.glb","nature:crop_melon":"./assets/catalog/nature_crop_melon.glb","nature:crop_pumpkin":"./assets/catalog/nature_crop_pumpkin.glb","nature:crop_turnip":"./assets/catalog/nature_crop_turnip.glb","nature:fence_bend":"./assets/catalog/nature_fence_bend.glb","nature:fence_bendCenter":"./assets/catalog/nature_fence_bendCenter.glb","nature:fence_corner":"./assets/catalog/nature_fence_corner.glb","nature:fence_gate":"./assets/catalog/nature_fence_gate.glb","nature:fence_planks":"./assets/catalog/nature_fence_planks.glb","nature:fence_planksDouble":"./assets/catalog/nature_fence_planksDouble.glb","nature:fence_simple":"./assets/catalog/nature_fence_simple.glb","nature:fence_simpleCenter":"./assets/catalog/nature_fence_simpleCenter.glb","nature:fence_simpleDiagonal":"./assets/catalog/nature_fence_simpleDiagonal.glb","nature:fence_simpleDiagonalCenter":"./assets/catalog/nature_fence_simpleDiagonalCenter.glb","nature:fence_simpleHigh":"./assets/catalog/nature_fence_simpleHigh.glb","nature:fence_simpleLow":"./assets/catalog/nature_fence_simpleLow.glb","nature:flower_purpleA":"./assets/outdoor/nature_flower_purpleA.glb","nature:flower_purpleB":"./assets/catalog/nature_flower_purpleB.glb","nature:flower_purpleC":"./assets/catalog/nature_flower_purpleC.glb","nature:flower_redA":"./assets/catalog/nature_flower_redA.glb","nature:flower_redB":"./assets/outdoor/nature_flower_redB.glb","nature:flower_redC":"./assets/catalog/nature_flower_redC.glb","nature:flower_yellowA":"./assets/outdoor/nature_flower_yellowA.glb","nature:flower_yellowB":"./assets/catalog/nature_flower_yellowB.glb","nature:flower_yellowC":"./assets/catalog/nature_flower_yellowC.glb","nature:grass":"./assets/catalog/nature_grass.glb","nature:grass_large":"./assets/outdoor/nature_grass_large.glb","nature:grass_leafs":"./assets/catalog/nature_grass_leafs.glb","nature:grass_leafsLarge":"./assets/catalog/nature_grass_leafsLarge.glb","nature:ground_grass":"./assets/catalog/nature_ground_grass.glb","nature:ground_pathBend":"./assets/catalog/nature_ground_pathBend.glb","nature:ground_pathBendBank":"./assets/catalog/nature_ground_pathBendBank.glb","nature:ground_pathCorner":"./assets/catalog/nature_ground_pathCorner.glb","nature:ground_pathCornerSmall":"./assets/catalog/nature_ground_pathCornerSmall.glb","nature:ground_pathCross":"./assets/catalog/nature_ground_pathCross.glb","nature:ground_pathEnd":"./assets/catalog/nature_ground_pathEnd.glb","nature:ground_pathEndClosed":"./assets/catalog/nature_ground_pathEndClosed.glb","nature:ground_pathOpen":"./assets/catalog/nature_ground_pathOpen.glb","nature:ground_pathRocks":"./assets/catalog/nature_ground_pathRocks.glb","nature:ground_pathSide":"./assets/catalog/nature_ground_pathSide.glb","nature:ground_pathSideOpen":"./assets/catalog/nature_ground_pathSideOpen.glb","nature:ground_pathSplit":"./assets/catalog/nature_ground_pathSplit.glb","nature:ground_pathStraight":"./assets/catalog/nature_ground_pathStraight.glb","nature:ground_pathTile":"./assets/catalog/nature_ground_pathTile.glb","nature:ground_riverBend":"./assets/catalog/nature_ground_riverBend.glb","nature:ground_riverBendBank":"./assets/catalog/nature_ground_riverBendBank.glb","nature:ground_riverCorner":"./assets/catalog/nature_ground_riverCorner.glb","nature:ground_riverCornerSmall":"./assets/catalog/nature_ground_riverCornerSmall.glb","nature:ground_riverCross":"./assets/catalog/nature_ground_riverCross.glb","nature:ground_riverEnd":"./assets/catalog/nature_ground_riverEnd.glb","nature:ground_riverEndClosed":"./assets/catalog/nature_ground_riverEndClosed.glb","nature:ground_riverOpen":"./assets/catalog/nature_ground_riverOpen.glb","nature:ground_riverRocks":"./assets/catalog/nature_ground_riverRocks.glb","nature:ground_riverSide":"./assets/catalog/nature_ground_riverSide.glb","nature:ground_riverSideOpen":"./assets/catalog/nature_ground_riverSideOpen.glb","nature:ground_riverSplit":"./assets/catalog/nature_ground_riverSplit.glb","nature:ground_riverStraight":"./assets/catalog/nature_ground_riverStraight.glb","nature:ground_riverTile":"./assets/catalog/nature_ground_riverTile.glb","nature:hanging_moss":"./assets/catalog/nature_hanging_moss.glb","nature:lily_large":"./assets/catalog/nature_lily_large.glb","nature:lily_small":"./assets/catalog/nature_lily_small.glb","nature:log":"./assets/catalog/nature_log.glb","nature:log_large":"./assets/catalog/nature_log_large.glb","nature:log_stack":"./assets/catalog/nature_log_stack.glb","nature:log_stackLarge":"./assets/catalog/nature_log_stackLarge.glb","nature:mushroom_red":"./assets/catalog/nature_mushroom_red.glb","nature:mushroom_redGroup":"./assets/catalog/nature_mushroom_redGroup.glb","nature:mushroom_redTall":"./assets/catalog/nature_mushroom_redTall.glb","nature:mushroom_tan":"./assets/catalog/nature_mushroom_tan.glb","nature:mushroom_tanGroup":"./assets/catalog/nature_mushroom_tanGroup.glb","nature:mushroom_tanTall":"./assets/catalog/nature_mushroom_tanTall.glb","nature:path_stone":"./assets/catalog/nature_path_stone.glb","nature:path_stoneCircle":"./assets/catalog/nature_path_stoneCircle.glb","nature:path_stoneCorner":"./assets/catalog/nature_path_stoneCorner.glb","nature:path_stoneEnd":"./assets/catalog/nature_path_stoneEnd.glb","nature:path_wood":"./assets/catalog/nature_path_wood.glb","nature:path_woodCorner":"./assets/catalog/nature_path_woodCorner.glb","nature:path_woodEnd":"./assets/catalog/nature_path_woodEnd.glb","nature:plant_bush":"./assets/outdoor/nature_plant_bush.glb","nature:plant_bushDetailed":"./assets/outdoor/nature_plant_bushDetailed.glb","nature:plant_bushLarge":"./assets/outdoor/nature_plant_bushLarge.glb","nature:plant_bushLargeTriangle":"./assets/catalog/nature_plant_bushLargeTriangle.glb","nature:plant_bushSmall":"./assets/outdoor/nature_plant_bushSmall.glb","nature:plant_bushTriangle":"./assets/catalog/nature_plant_bushTriangle.glb","nature:plant_flatShort":"./assets/catalog/nature_plant_flatShort.glb","nature:plant_flatTall":"./assets/outdoor/nature_plant_flatTall.glb","nature:platform_beach":"./assets/catalog/nature_platform_beach.glb","nature:platform_grass":"./assets/catalog/nature_platform_grass.glb","nature:platform_stone":"./assets/catalog/nature_platform_stone.glb","nature:pot_large":"./assets/catalog/nature_pot_large.glb","nature:pot_small":"./assets/catalog/nature_pot_small.glb","nature:rock_largeA":"./assets/outdoor/nature_rock_largeA.glb","nature:rock_largeB":"./assets/catalog/nature_rock_largeB.glb","nature:rock_largeC":"./assets/catalog/nature_rock_largeC.glb","nature:rock_largeD":"./assets/catalog/nature_rock_largeD.glb","nature:rock_largeE":"./assets/catalog/nature_rock_largeE.glb","nature:rock_largeF":"./assets/catalog/nature_rock_largeF.glb","nature:rock_smallA":"./assets/outdoor/nature_rock_smallA.glb","nature:rock_smallB":"./assets/catalog/nature_rock_smallB.glb","nature:rock_smallC":"./assets/catalog/nature_rock_smallC.glb","nature:rock_smallD":"./assets/catalog/nature_rock_smallD.glb","nature:rock_smallE":"./assets/catalog/nature_rock_smallE.glb","nature:rock_smallF":"./assets/catalog/nature_rock_smallF.glb","nature:rock_smallFlatA":"./assets/catalog/nature_rock_smallFlatA.glb","nature:rock_smallFlatB":"./assets/catalog/nature_rock_smallFlatB.glb","nature:rock_smallFlatC":"./assets/catalog/nature_rock_smallFlatC.glb","nature:rock_smallG":"./assets/catalog/nature_rock_smallG.glb","nature:rock_smallH":"./assets/catalog/nature_rock_smallH.glb","nature:rock_smallI":"./assets/catalog/nature_rock_smallI.glb","nature:rock_smallTopA":"./assets/catalog/nature_rock_smallTopA.glb","nature:rock_smallTopB":"./assets/catalog/nature_rock_smallTopB.glb","nature:rock_tallA":"./assets/catalog/nature_rock_tallA.glb","nature:rock_tallB":"./assets/catalog/nature_rock_tallB.glb","nature:rock_tallC":"./assets/catalog/nature_rock_tallC.glb","nature:rock_tallD":"./assets/catalog/nature_rock_tallD.glb","nature:rock_tallE":"./assets/catalog/nature_rock_tallE.glb","nature:rock_tallF":"./assets/catalog/nature_rock_tallF.glb","nature:rock_tallG":"./assets/catalog/nature_rock_tallG.glb","nature:rock_tallH":"./assets/catalog/nature_rock_tallH.glb","nature:rock_tallI":"./assets/catalog/nature_rock_tallI.glb","nature:rock_tallJ":"./assets/catalog/nature_rock_tallJ.glb","nature:sign":"./assets/catalog/nature_sign.glb","nature:statue_block":"./assets/catalog/nature_statue_block.glb","nature:statue_column":"./assets/catalog/nature_statue_column.glb","nature:statue_columnDamaged":"./assets/catalog/nature_statue_columnDamaged.glb","nature:statue_head":"./assets/catalog/nature_statue_head.glb","nature:statue_obelisk":"./assets/catalog/nature_statue_obelisk.glb","nature:statue_ring":"./assets/catalog/nature_statue_ring.glb","nature:stone_largeA":"./assets/catalog/nature_stone_largeA.glb","nature:stone_largeB":"./assets/catalog/nature_stone_largeB.glb","nature:stone_largeC":"./assets/catalog/nature_stone_largeC.glb","nature:stone_largeD":"./assets/catalog/nature_stone_largeD.glb","nature:stone_largeE":"./assets/catalog/nature_stone_largeE.glb","nature:stone_largeF":"./assets/catalog/nature_stone_largeF.glb","nature:stone_smallA":"./assets/catalog/nature_stone_smallA.glb","nature:stone_smallB":"./assets/catalog/nature_stone_smallB.glb","nature:stone_smallC":"./assets/catalog/nature_stone_smallC.glb","nature:stone_smallD":"./assets/catalog/nature_stone_smallD.glb","nature:stone_smallE":"./assets/catalog/nature_stone_smallE.glb","nature:stone_smallF":"./assets/catalog/nature_stone_smallF.glb","nature:stone_smallFlatA":"./assets/catalog/nature_stone_smallFlatA.glb","nature:stone_smallFlatB":"./assets/catalog/nature_stone_smallFlatB.glb","nature:stone_smallFlatC":"./assets/catalog/nature_stone_smallFlatC.glb","nature:stone_smallG":"./assets/catalog/nature_stone_smallG.glb","nature:stone_smallH":"./assets/catalog/nature_stone_smallH.glb","nature:stone_smallI":"./assets/catalog/nature_stone_smallI.glb","nature:stone_smallTopA":"./assets/catalog/nature_stone_smallTopA.glb","nature:stone_smallTopB":"./assets/catalog/nature_stone_smallTopB.glb","nature:stone_tallA":"./assets/catalog/nature_stone_tallA.glb","nature:stone_tallB":"./assets/catalog/nature_stone_tallB.glb","nature:stone_tallC":"./assets/catalog/nature_stone_tallC.glb","nature:stone_tallD":"./assets/catalog/nature_stone_tallD.glb","nature:stone_tallE":"./assets/catalog/nature_stone_tallE.glb","nature:stone_tallF":"./assets/catalog/nature_stone_tallF.glb","nature:stone_tallG":"./assets/catalog/nature_stone_tallG.glb","nature:stone_tallH":"./assets/catalog/nature_stone_tallH.glb","nature:stone_tallI":"./assets/catalog/nature_stone_tallI.glb","nature:stone_tallJ":"./assets/catalog/nature_stone_tallJ.glb","nature:stump_old":"./assets/catalog/nature_stump_old.glb","nature:stump_oldTall":"./assets/catalog/nature_stump_oldTall.glb","nature:stump_round":"./assets/catalog/nature_stump_round.glb","nature:stump_roundDetailed":"./assets/catalog/nature_stump_roundDetailed.glb","nature:stump_square":"./assets/catalog/nature_stump_square.glb","nature:stump_squareDetailed":"./assets/catalog/nature_stump_squareDetailed.glb","nature:stump_squareDetailedWide":"./assets/catalog/nature_stump_squareDetailedWide.glb","nature:tent_detailedClosed":"./assets/catalog/nature_tent_detailedClosed.glb","nature:tent_detailedOpen":"./assets/catalog/nature_tent_detailedOpen.glb","nature:tent_smallClosed":"./assets/catalog/nature_tent_smallClosed.glb","nature:tent_smallOpen":"./assets/catalog/nature_tent_smallOpen.glb","nature:tree_blocks":"./assets/catalog/nature_tree_blocks.glb","nature:tree_blocks_dark":"./assets/catalog/nature_tree_blocks_dark.glb","nature:tree_blocks_fall":"./assets/catalog/nature_tree_blocks_fall.glb","nature:tree_cone":"./assets/catalog/nature_tree_cone.glb","nature:tree_cone_dark":"./assets/catalog/nature_tree_cone_dark.glb","nature:tree_cone_fall":"./assets/catalog/nature_tree_cone_fall.glb","nature:tree_default":"./assets/outdoor/nature_tree_default.glb","nature:tree_default_dark":"./assets/catalog/nature_tree_default_dark.glb","nature:tree_default_fall":"./assets/catalog/nature_tree_default_fall.glb","nature:tree_detailed":"./assets/catalog/nature_tree_detailed.glb","nature:tree_detailed_dark":"./assets/catalog/nature_tree_detailed_dark.glb","nature:tree_detailed_fall":"./assets/catalog/nature_tree_detailed_fall.glb","nature:tree_fat":"./assets/catalog/nature_tree_fat.glb","nature:tree_fat_darkh":"./assets/catalog/nature_tree_fat_darkh.glb","nature:tree_fat_fall":"./assets/catalog/nature_tree_fat_fall.glb","nature:tree_oak":"./assets/outdoor/nature_tree_oak.glb","nature:tree_oak_dark":"./assets/catalog/nature_tree_oak_dark.glb","nature:tree_oak_fall":"./assets/catalog/nature_tree_oak_fall.glb","nature:tree_palm":"./assets/catalog/nature_tree_palm.glb","nature:tree_palmBend":"./assets/catalog/nature_tree_palmBend.glb","nature:tree_palmDetailedShort":"./assets/catalog/nature_tree_palmDetailedShort.glb","nature:tree_palmDetailedTall":"./assets/catalog/nature_tree_palmDetailedTall.glb","nature:tree_palmShort":"./assets/catalog/nature_tree_palmShort.glb","nature:tree_palmTall":"./assets/catalog/nature_tree_palmTall.glb","nature:tree_pineDefaultA":"./assets/catalog/nature_tree_pineDefaultA.glb","nature:tree_pineDefaultB":"./assets/catalog/nature_tree_pineDefaultB.glb","nature:tree_pineGroundA":"./assets/catalog/nature_tree_pineGroundA.glb","nature:tree_pineGroundB":"./assets/catalog/nature_tree_pineGroundB.glb","nature:tree_pineRoundA":"./assets/outdoor/nature_tree_pineRoundA.glb","nature:tree_pineRoundB":"./assets/catalog/nature_tree_pineRoundB.glb","nature:tree_pineRoundC":"./assets/catalog/nature_tree_pineRoundC.glb","nature:tree_pineRoundD":"./assets/catalog/nature_tree_pineRoundD.glb","nature:tree_pineRoundE":"./assets/catalog/nature_tree_pineRoundE.glb","nature:tree_pineRoundF":"./assets/catalog/nature_tree_pineRoundF.glb","nature:tree_pineSmallA":"./assets/catalog/nature_tree_pineSmallA.glb","nature:tree_pineSmallB":"./assets/catalog/nature_tree_pineSmallB.glb","nature:tree_pineSmallC":"./assets/outdoor/nature_tree_pineSmallC.glb","nature:tree_pineSmallD":"./assets/catalog/nature_tree_pineSmallD.glb","nature:tree_pineTallA":"./assets/catalog/nature_tree_pineTallA.glb","nature:tree_pineTallA_detailed":"./assets/catalog/nature_tree_pineTallA_detailed.glb","nature:tree_pineTallB":"./assets/catalog/nature_tree_pineTallB.glb","nature:tree_pineTallB_detailed":"./assets/catalog/nature_tree_pineTallB_detailed.glb","nature:tree_pineTallC":"./assets/catalog/nature_tree_pineTallC.glb","nature:tree_pineTallC_detailed":"./assets/catalog/nature_tree_pineTallC_detailed.glb","nature:tree_pineTallD":"./assets/catalog/nature_tree_pineTallD.glb","nature:tree_pineTallD_detailed":"./assets/catalog/nature_tree_pineTallD_detailed.glb","nature:tree_plateau":"./assets/catalog/nature_tree_plateau.glb","nature:tree_plateau_dark":"./assets/catalog/nature_tree_plateau_dark.glb","nature:tree_plateau_fall":"./assets/catalog/nature_tree_plateau_fall.glb","nature:tree_simple":"./assets/outdoor/nature_tree_simple.glb","nature:tree_simple_dark":"./assets/catalog/nature_tree_simple_dark.glb","nature:tree_simple_fall":"./assets/catalog/nature_tree_simple_fall.glb","nature:tree_small":"./assets/outdoor/nature_tree_small.glb","nature:tree_small_dark":"./assets/catalog/nature_tree_small_dark.glb","nature:tree_small_fall":"./assets/catalog/nature_tree_small_fall.glb","nature:tree_tall":"./assets/catalog/nature_tree_tall.glb","nature:tree_tall_dark":"./assets/catalog/nature_tree_tall_dark.glb","nature:tree_tall_fall":"./assets/catalog/nature_tree_tall_fall.glb","nature:tree_thin":"./assets/catalog/nature_tree_thin.glb","nature:tree_thin_dark":"./assets/catalog/nature_tree_thin_dark.glb","nature:tree_thin_fall":"./assets/catalog/nature_tree_thin_fall.glb","market:07_Terracotta_Pot":"./assets/outdoor/market_07_Terracotta_Pot.glb","patio:pergola":"./assets/outdoor/patio_pergola.glb","market:18_Wood_Barrel":"./assets/outdoor/market_18_Wood_Barrel.glb","patio:fire_pit":"./assets/outdoor/patio_fire_pit.glb","patio:patio_sofa":"./assets/outdoor/patio_patio_sofa.glb","market:20_Garden_Lantern":"./assets/outdoor/market_20_Garden_Lantern.glb","patio:side_table_stool":"./assets/outdoor/patio_side_table_stool.glb","patio:raised_bed":"./assets/outdoor/patio_raised_bed.glb","patio:adirondack_chair":"./assets/outdoor/patio_adirondack_chair.glb","market:19_Seedling_Tray":"./assets/outdoor/market_19_Seedling_Tray.glb","patio:picnic_table":"./assets/outdoor/patio_picnic_table.glb","patio:gazebo":"./assets/outdoor/patio_gazebo.glb","patio:terracotta_pot":"./assets/outdoor/patio_terracotta_pot.glb","market:12_Watering_Can":"./assets/outdoor/market_12_Watering_Can.glb","patio:planter_box":"./assets/outdoor/patio_planter_box.glb","market:11_Apple_Crate":"./assets/outdoor/market_11_Apple_Crate.glb","patio:bird_bath":"./assets/outdoor/patio_bird_bath.glb","market:13_Shovel":"./assets/outdoor/market_13_Shovel.glb","patio:hammock_stand":"./assets/outdoor/patio_hammock_stand.glb","patio:wicker_armchair":"./assets/outdoor/patio_wicker_armchair.glb","market:10_Empty_Crate":"./assets/outdoor/market_10_Empty_Crate.glb","patio:mailbox_post":"./assets/outdoor/patio_mailbox_post.glb","patio:trellis_arch":"./assets/outdoor/patio_trellis_arch.glb","patio:park_bench":"./assets/outdoor/patio_park_bench.glb","patio:hanging_basket":"./assets/outdoor/patio_hanging_basket.glb","market:15_Wheelbarrow":"./assets/outdoor/market_15_Wheelbarrow.glb","patio:garden_gnome":"./assets/outdoor/patio_garden_gnome.glb","patio:bbq_grill":"./assets/outdoor/patio_bbq_grill.glb","market:09_Flower_Pot":"./assets/outdoor/market_09_Flower_Pot.glb","patio:porch_swing":"./assets/outdoor/patio_porch_swing.glb","market:16_Herb_Planter":"./assets/outdoor/market_16_Herb_Planter.glb","patio:garden_lantern":"./assets/outdoor/patio_garden_lantern.glb","market:14_Rake":"./assets/outdoor/market_14_Rake.glb","market:08_Herb_Pot":"./assets/outdoor/market_08_Herb_Pot.glb","patio:dining_table_6":"./assets/outdoor/patio_dining_table_6.glb","patio:patio_umbrella":"./assets/outdoor/patio_patio_umbrella.glb","market:03_Plant_Shelf":"./assets/outdoor/market_03_Plant_Shelf.glb","patio:garden_bench":"./assets/outdoor/patio_garden_bench.glb","patio:lounge_chair":"./assets/outdoor/patio_lounge_chair.glb","patio:coffee_table_wicker":"./assets/outdoor/patio_coffee_table_wicker.glb","patio:round_patio_table":"./assets/outdoor/patio_round_patio_table.glb","tiny:TinyLiving_BotanicalBookends_5":"./assets/tinylivingpack.glb","tiny:TinyLiving_CompactLavatory_45":"./assets/tinylivingpack.glb","tiny:TinyLiving_ContemporaryCarpet_40":"./assets/tinylivingpack.glb","tiny:TinyLiving_DonTrippLightFixture_19":"./assets/tinylivingpack.glb","tiny:TinyLiving_JustALittlePeek_18":"./assets/tinylivingpack.glb","tiny:TinyLiving_LampWithoutStorage_20":"./assets/tinylivingpack.glb","tiny:TinyLiving_LovelyArmchair_33":"./assets/tinylivingpack.glb","tiny:TinyLiving_LovelyDiningChair_42":"./assets/tinylivingpack.glb","tiny:TinyLiving_LovelyLoveseat_12":"./assets/tinylivingpack.glb","tiny:TinyLiving_MediaMarathoner_8":"./assets/tinylivingpack.glb","tiny:TinyLiving_MediaMarathoner_AllontheWall_10":"./assets/tinylivingpack.glb","tiny:TinyLiving_ModernPouffe_36":"./assets/tinylivingpack.glb","tiny:TinyLiving_MurphyBed_2":"./assets/tinylivingpack.glb","tiny:TinyLiving_MurphyLoveSeat_4":"./assets/tinylivingpack.glb","tiny:TinyLiving_MyKindaZen_22":"./assets/tinylivingpack.glb","tiny:TinyLiving_NotATableEnd_43":"./assets/tinylivingpack.glb","tiny:TinyLiving_NotQuiteOrbitalSitting_41":"./assets/tinylivingpack.glb","tiny:TinyLiving_OpenShelf_31":"./assets/tinylivingpack.glb","tiny:TinyLiving_OrbitalHighDining_35":"./assets/tinylivingpack.glb","tiny:TinyLiving_PowerTowerBookcase_47":"./assets/tinylivingpack.glb","tiny:TinyLiving_PowerTowerDresser_24":"./assets/tinylivingpack.glb","tiny:TinyLiving_SimpleandCleanArt_39":"./assets/tinylivingpack.glb","tiny:TinyLiving_SirCumferenceCoffeeTable_11":"./assets/tinylivingpack.glb","tiny:TinyLiving_Space-SavingSingle_13":"./assets/tinylivingpack.glb","tiny:TinyLiving_StubbyCubbyDresser_38":"./assets/tinylivingpack.glb","tiny:TinyLiving_TheModernDeskLamp_23":"./assets/tinylivingpack.glb","tiny:TinyLiving_TheSinkzBathroomVanity_32":"./assets/tinylivingpack.glb","tiny:TinyLiving_TieredShelf_29":"./assets/tinylivingpack.glb","tiny:TinyLiving_TinyConsole_44":"./assets/tinylivingpack.glb","tiny:TinyLiving_TinyDeskForTinyLiving_37":"./assets/tinylivingpack.glb","tiny:TinyLiving_VerticalMiniGarden_27":"./assets/tinylivingpack.glb","tiny:TinytLiving_MiracleMirror_26":"./assets/tinylivingpack.glb"};

const CATALOG_META={};
const packLabels={all:'Все наборы',tiny:'Tiny Living',kenney:'Мебель Kenney',nature:'Природа Kenney',patio:'Садовая мебель',market:'Садовый рынок',roads:'Тропинки',nature2:'Новая природа',hydro:'Теплица и огород',garage:'Гараж',garden2:'Садовые предметы',factory:'Мастерская'};
const categories=['Все предметы','Гостиная','Спальня','Кухня и столовая','Ванная','Кабинет','Мебель и хранение','Освещение и декор','Гараж и инструменты','Сарай и мастерская','Теплица и огород','Тропинки и дороги','Деревья и растения','Сад и участок','Разное'];
const RU_MODEL_NAMES={
 kitchenFridgeLarge:'Большой холодильник',kitchenFridge:'Холодильник',kitchenFridgeSmall:'Маленький холодильник',kitchenFridgeBuiltIn:'Встроенный холодильник',
 kitchenStove:'Плита',kitchenStoveElectric:'Электроплита',kitchenSink:'Кухонная мойка',kitchenMicrowave:'Микроволновка',
 kitchenCoffeeMachine:'Кофемашина',kitchenCabinet:'Кухонный шкаф',kitchenBar:'Барная стойка',
 loungeSofa:'Диван',loungeSofaLong:'Большой диван',loungeChair:'Кресло',tableCoffee:'Журнальный столик',tableCoffeeSquare:'Квадратный столик',
 bedDouble:'Двуспальная кровать',bedSingle:'Односпальная кровать',bedBunk:'Двухъярусная кровать',
 bathroomSink:'Раковина',bathroomMirror:'Зеркало',bathtub:'Ванна',toilet:'Унитаз',
 chair:'Стул',chairDesk:'Офисный стул',chairRounded:'Круглый стул',bookcaseOpen:'Книжный шкаф',bookcaseClosed:'Закрытый шкаф',
 desk:'Письменный стол',deskCorner:'Угловой стол',computerScreen:'Монитор',computerKeyboard:'Клавиатура',
 cabinetTelevision:'ТВ-тумба',pottedPlant:'Комнатное растение',rugRectangle:'Прямоугольный ковёр',rugRound:'Круглый ковёр',
 trashcan:'Мусорное ведро',coatRackStanding:'Вешалка',
 TinyLiving_LovelyLoveseat_12:'Небольшой диван',TinyLiving_LovelyArmchair_33:'Мягкое кресло',
 TinyLiving_MurphyBed_2:'Кровать-трансформер', 'TinyLiving_Space-SavingSingle_13':'Компактная кровать',
 TinyLiving_MurphyLoveSeat_4:'Диван-трансформер',TinyLiving_SirCumferenceCoffeeTable_11:'Круглый кофейный столик',
 TinyLiving_PowerTowerDresser_24:'Комод',TinyLiving_PowerTowerBookcase_47:'Книжный стеллаж',
 TinyLiving_OpenShelf_31:'Открытая полка',TinyLiving_TieredShelf_29:'Стеллаж-лесенка',
 TinyLiving_TinyDeskForTinyLiving_37:'Компактный письменный стол',TinyLiving_TheSinkzBathroomVanity_32:'Тумба с раковиной',
 TinyLiving_CompactLavatory_45:'Компактный туалет',TinyLiving_LovelyDiningChair_42:'Обеденный стул',
 TinyLiving_OrbitalHighDining_35:'Высокий обеденный стол',TinyLiving_ModernPouffe_36:'Пуфик',
 TinyLiving_LampWithoutStorage_20:'Напольная лампа',TinyLiving_VerticalMiniGarden_27:'Вертикальный мини-сад',
 TinyLiving_MediaMarathoner_8:'Тумба под телевизор',TinyLiving_NotQuiteOrbitalSitting_41:'Рабочее кресло',
 TinytLiving_MiracleMirror_26:'Зеркало',TinyLiving_TheModernDeskLamp_23:'Настольная лампа'
};
const RU_WORDS={kitchen:'кухонный',bathroom:'ванная',chair:'стул',sofa:'диван',bed:'кровать',table:'стол',shelf:'полка',bookcase:'стеллаж',desk:'письменный стол',lamp:'лампа',fridge:'холодильник',large:'большой',small:'маленький',double:'двойной',single:'одинарный',modern:'современный',round:'круглый',open:'открытый',closed:'закрытый',upper:'верхний',floor:'напольный',wall:'настенный',corner:'угловой',plant:'растение',tree:'дерево',bush:'куст',grass:'трава',flower:'цветок',stone:'камень',rock:'камень',wood:'дерево',path:'тропинка',road:'дорога',garden:'садовый',cabinet:'шкаф',door:'дверь',rug:'ковёр',box:'коробка',pillow:'подушка',pot:'горшок',water:'вода',bottle:'бутылка',bin:'контейнер',light:'светильник',tool:'инструмент',bench:'скамейка',storage:'хранение',crate:'ящик',metal:'металл',window:'окно',toilet:'унитаз',bath:'ванна',sink:'раковина',stove:'плита',coffee:'кофе',machine:'машина',computer:'компьютер',screen:'экран',mirror:'зеркало',tv:'телевизор',trashcan:'мусорное ведро',books:'книги',fan:'вентилятор',decor:'декор',barrel:'бочка',bar:'стойка',bamboo:'бамбук',pine:'сосна',oak:'дуб'};
function catalogLabel(key){
 if(CATALOG_META[key]?.label)return CATALOG_META[key].label;
 const name=key.split(':')[1]||key;if(RU_MODEL_NAMES[name])return RU_MODEL_NAMES[name];
 const text=name.replace(/^(TinyLiving_|TinytLiving_)/,'').replace(/_\d+$/,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]/g,' ');
 return text.split(/\s+/).map(w=>RU_WORDS[w.toLowerCase()]||w).join(' ').replace(/^./,ch=>ch.toUpperCase());
}
function catalogCategory(key){
 if(CATALOG_META[key]?.category)return CATALOG_META[key].category;
 const [pack,name]=key.split(':'),n=name.toLowerCase();
 if(pack==='roads'||/path|road|bridge_/.test(n))return 'Тропинки и дороги';
 if(pack==='garage')return 'Гараж и инструменты';
 if(pack==='factory')return 'Сарай и мастерская';
 if(pack==='hydro'||/crops_|vegetable|watering|planter|raised_bed/.test(n))return 'Теплица и огород';
 if(/tree|bush|flower|fern|grass|pine|mushroom|cactus|shrub/.test(n))return 'Деревья и растения';
 if(['market','patio','garden2','nature'].includes(pack))return 'Сад и участок';
 if(/fridge|kitchen|stove|microwave|coffee|dining|blender/.test(n))return 'Кухня и столовая';
 if(/bathroom|toilet|bathtub|shower|lavatory|sinkz|mirror/.test(n))return 'Ванная';
 if(/bed|dresser|pillow/.test(n))return 'Спальня';
 if(/office|desk|computer|keyboard|mouse|laptop/.test(n))return 'Кабинет';
 if(/sofa|lounge|loveseat|armchair|media|television|coffeetable/.test(n))return 'Гостиная';
 if(/lamp|light|carpet|rug|art|decor/.test(n))return 'Освещение и декор';
 if(/chair|cabinet|bookcase|shelf|table|bench|rack|wardrobe/.test(n))return 'Мебель и хранение';
 return 'Разное';
}
const catalog=document.getElementById('edCatalog'),packSelect=document.getElementById('edPack'),categorySelect=document.getElementById('edCategory');
for(const c of categories){const el=document.createElement('option');el.value=c;el.textContent=c;categorySelect.appendChild(el)}
for(const p of Object.keys(packLabels)){const el=document.createElement('option');el.value=p;el.textContent=packLabels[p];packSelect.appendChild(el)}
function refreshCatalog(){
 const pack=packSelect.value,query=document.getElementById('edSearch').value.trim().toLowerCase(),category=categorySelect.value,previous=catalog.value;
 catalog.replaceChildren();
 for(const key of Object.keys(ALL_CATALOG).filter(k=>(pack==='all'||k.startsWith(pack+':'))&&(category==='Все предметы'||catalogCategory(k)===category)&&catalogLabel(k).toLowerCase().includes(query))){
 const op=document.createElement('option');op.value=key;op.textContent=catalogLabel(key);catalog.appendChild(op);}
 if([...catalog.options].some(o=>o.value===previous))catalog.value=previous;else if(catalog.options.length)catalog.selectedIndex=0;
 previewCatalog();
}
packSelect.onchange=refreshCatalog;categorySelect.onchange=refreshCatalog;document.getElementById('edSearch').oninput=refreshCatalog;catalog.onchange=previewCatalog;
// Diagnose a common missing external colormap without producing extra repeated HTTP requests.
fetch('./assets/extra/Textures/colormap.png',{method:'HEAD',cache:'no-store'})
 .then(response=>{if(!response.ok)console.warn('Bad Cat 3D: missing original model texture assets/extra/Textures/colormap.png (HTTP '+response.status+'). Restore it from your installed model pack to keep the intended colors.');})
 .catch(()=>console.warn('Bad Cat 3D: cannot check assets/extra/Textures/colormap.png'));
const extraCatalogReady=fetch('./assets/extra_catalog.json',{cache:'no-store'}).then(async res=>{
 if(!res.ok)throw Error('Additional packs not installed');
 const manifest=await res.json();
 for(const [key,item] of Object.entries(manifest)){
  if(!item||typeof item.url!=='string'||!item.url.startsWith('./assets/extra/'))continue;
  ALL_CATALOG[key]=item.url;CATALOG_META[key]={label:String(item.label||'Модель'),category:String(item.category||'Разное')};
 }
 refreshCatalog();return true;
}).catch(()=>{console.info('Дополнительные модели доступны после распаковки ZIP в проект');return false});
const previewScene=new THREE.Scene();previewScene.background=new THREE.Color('#dce9eb');previewScene.add(new THREE.HemisphereLight(0xffffff,0x8699a8,2.5));const pl=new THREE.DirectionalLight(0xffffff,2.1);pl.position.set(3,7,5);previewScene.add(pl);
const previewCamera=new THREE.PerspectiveCamera(42,1.5,.01,200);const previewRenderer=new THREE.WebGLRenderer({canvas:document.getElementById('edPreview'),antialias:true});previewRenderer.setPixelRatio(Math.min(devicePixelRatio,1.5));previewRenderer.setSize(300,200,false);previewRenderer.outputColorSpace=THREE.SRGBColorSpace;
let previewObject=null,previewToken=0;
async function catalogModel(key){const [pack,name]=key.split(':');if(pack==='tiny'){const lookup=await tinyLookupPromise;const src=lookup.get(name);if(!src)throw Error('No tiny '+name);return src.clone(true)}const result=await loader.loadAsync(ALL_CATALOG[key]);return result.scene.clone(true)}
async function previewCatalog(){const key=catalog.value,token=++previewToken;if(previewObject){previewScene.remove(previewObject);previewObject=null}if(!key)return;document.getElementById('edPreviewStatus').textContent='⏳ Загружаем '+catalogLabel(key);try{const obj=await catalogModel(key);if(token!==previewToken)return;obj.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(obj),s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());if(s.length()<.001)throw Error('Empty model');obj.position.sub(c);const scale=2.5/Math.max(s.x,s.y,s.z);obj.scale.setScalar(scale);previewObject=obj;previewScene.add(obj);previewCamera.position.set(3.3,2.4,4.3);previewCamera.lookAt(0,0,0);document.getElementById('edPreviewStatus').textContent=packLabels[key.split(':')[0]]+' · '+catalogLabel(key)}catch(e){console.warn(e);document.getElementById('edPreviewStatus').textContent='⚠️ Не удалось открыть модель'}}
refreshCatalog();
let editCamTarget=new THREE.Vector3(0,1.4,0),editCamYaw=.6,editCamPitch=.55,editCamDistance=14,editCameraMode=false,editDragMode=null,editLastX=0,editLastY=0;
let editorOn=false,editSelected=null,editHelper=null,editPointer=null,editPlane=new THREE.Plane(),editOffset=new THREE.Vector3(),editHits=new THREE.Raycaster();
// Architectural editor stores modifications separately: furniture JSON is untouched.
const WALL_SAVE_KEY='badcat3d-walls-v1';
const wallEdits=new Map(),wallRecords=new Map();
let wallMode=false,selectedWall=null,wallHelper=null;
let wallStored={};try{wallStored=JSON.parse(localStorage.getItem(WALL_SAVE_KEY)||'{}')||{}}catch(e){wallStored={}}
const wallMat=material('#efe1c8');
const wallField=(id)=>document.getElementById('edWall'+id);
function saveEditedWalls(){
 const changes={};for(const [id,record] of wallEdits)changes[id]=record;
 const old=localStorage.getItem(WALL_SAVE_KEY);
 if(old)localStorage.setItem(WALL_SAVE_KEY+'-last-backup',old);
 localStorage.setItem(WALL_SAVE_KEY,JSON.stringify(changes));
}
function wallRemoveParts(record){
 for(const mesh of record.parts||[]){
  const ix=wallMeshes.indexOf(mesh);if(ix>=0)wallMeshes.splice(ix,1);
  house.remove(mesh);mesh.geometry.dispose();
 }
 for(const collider of record.boxes||[]){
  const ix=colliders.indexOf(collider);if(ix>=0)colliders.splice(ix,1);
 }
 record.parts=[];record.boxes=[];
}
function wallRebuild(record){
 wallRemoveParts(record);
 const id=record.id,base=architecturalWallRecords.find(x=>x.id===id);
 if(base){
  if(base.originalMesh.parent)base.originalMesh.parent.remove(base.originalMesh);
  const m=wallMeshes.indexOf(base.originalMesh);if(m>=0)wallMeshes.splice(m,1);
  const c=colliders.indexOf(base.originalCollider);if(c>=0)colliders.splice(c,1);
 }
 const d=record.data;
 if(record.deleted)return;
 const length=Math.max(.4,Math.min(30,d.length)),height=Math.max(.4,Math.min(9,d.height)),thick=Math.max(.08,Math.min(1.2,d.thickness));
 // Build actual empty door/window openings from up to four solid wall segments.
 const segments=[],cutW=Math.min(length-.12,Math.max(.4,d.openingWidth||1.2));
 let low=0,high=0;
 if(d.opening==='door'){low=0;high=Math.min(height-.08,Math.max(.3,d.openingHeight||2.2));}
 if(d.opening==='window'){low=Math.min(height-.35,Math.max(.15,d.sill||1));high=Math.min(height-.08,low+Math.max(.3,d.openingHeight||1.2));}
 if(d.opening==='none')segments.push([0,length,0,height]);
 else{
  const side=(length-cutW)/2;
  if(side>.001){segments.push([-length/2+side/2,side,0,height],[length/2-side/2,side,0,height]);}
  if(low>.02)segments.push([0,cutW,0,low]);
  if(high<height-.02)segments.push([0,cutW,high,height]);
 }
 const rot=((Math.round(d.rotation/(Math.PI/2))%4)+4)%4*Math.PI/2;
 for(const [localX,segW,y0,y1] of segments){
  if(segW<=.005||y1-y0<=.005)continue;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(segW,y1-y0,thick),base?.originalMesh.material||wallMat);
  mesh.position.set(d.x+Math.cos(rot)*localX,d.y+(y0+y1)/2,d.z-Math.sin(rot)*localX);
  mesh.rotation.y=rot;
  mesh.userData.wallEditId=id;house.add(mesh);wallMeshes.push(mesh);record.parts.push(mesh);
  mesh.updateMatrixWorld(true);
  const bb=new THREE.Box3().setFromObject(mesh);
  const box={x1:bb.min.x,x2:bb.max.x,y1:bb.min.y,y2:bb.max.y,z1:bb.min.z,z2:bb.max.z,source:'wall'};
  colliders.push(box);record.boxes.push(box);
 }
 if(wallHelper&&selectedWall===record)wallUpdateOutline(record);
}
function wallRegister(id,data){
 const base=architecturalWallRecords.find(x=>x.id===id);
 const record={id,data:{...(base?base.base:{}),...data},parts:[],boxes:[],deleted:false};
 wallRecords.set(id,record);
 wallEdits.set(id,record.data);
 wallRebuild(record);
 return record;
}
function wallEnsureBase(id){
 if(wallRecords.has(id))return wallRecords.get(id);
 const base=architecturalWallRecords.find(x=>x.id===id);if(!base)return null;
 return wallRegister(id,{...base.base});
}
function wallRestoreAll(){
 for(const [id,data] of Object.entries(wallStored)){
  if(!data||typeof data!=='object')continue;
  if(id.startsWith('original-')&&!architecturalWallRecords.some(x=>x.id===id))continue;
  const record=wallRegister(id,{x:Number(data.x)||0,z:Number(data.z)||0,y:Number(data.y)||0,length:Number(data.length)||3,height:Number(data.height)||2.7,thickness:Number(data.thickness)||.2,rotation:Number(data.rotation)||0,opening:['door','window'].includes(data.opening)?data.opening:'none',openingWidth:Number(data.openingWidth)||1.2,openingHeight:Number(data.openingHeight)||2.2,sill:Number(data.sill)||1});
  if(data.deleted){record.deleted=true;wallRebuild(record)}
 }
}
function wallUpdateOutline(record){
 if(!wallHelper||!record)return;
 const bounds=new THREE.Box3();
 for(const part of record.parts)bounds.expandByObject(part);
 if(bounds.isEmpty()){
  const d=record.data;
  bounds.set(new THREE.Vector3(d.x-.2,d.y,d.z-.2),new THREE.Vector3(d.x+.2,d.y+.1,d.z+.2));
 }
 wallHelper.box.copy(bounds);
 wallHelper.updateMatrixWorld(true);
}
function wallPick(record){
 selectedWall=record;
 if(wallHelper){scene.remove(wallHelper);wallHelper.geometry.dispose();wallHelper.material.dispose();wallHelper=null}
 const label=wallField('Selected');
 if(!record){label.textContent='Выбери стену или добавь новую';return}
 label.textContent=(record.id.startsWith('original-')?'🏠 Стена здания':'🧱 Новая стена')+' · '+record.id;
 for(const [key,field] of [['length','Length'],['height','Height'],['thickness','Thickness'],['opening','Opening'],['openingWidth','OpeningWidth'],['openingHeight','OpeningHeight'],['sill','Sill']]){
  wallField(field).value=record.data[key];
  if(['Length','Height','Thickness'].includes(field)){
   wallField(field+'Slider').value=record.data[key];
   wallField(field+'Value').textContent=Number(record.data[key]).toFixed(field==='Thickness'?2:1);
  }
 }
 if(record.parts.length){
  wallHelper=new THREE.Box3Helper(new THREE.Box3(),0xffc538);
  scene.add(wallHelper);wallUpdateOutline(record);
 }
}
function wallSelectFromPointer(event){
 editRay(event);
 const objects=wallMeshes.slice();
 const hit=editHits.intersectObjects(objects,false)[0];
 if(!hit){wallPick(null);return}
 const id=hit.object.userData.wallEditId;
 wallPick(id?wallEnsureBase(id):null);
}
function wallApplyChanges(update){
 if(!selectedWall)return toast('🧱 Сначала выбери стену');
 const d=selectedWall.data;
 Object.assign(d,update);
 wallRebuild(selectedWall);
 wallEdits.set(selectedWall.id,{...d,deleted:selectedWall.deleted});
 saveEditedWalls(); // Selection remains active; no form reset while dragging a slider.
 const label=wallField('Selected');label.textContent=(selectedWall.id.startsWith('original-')?'🏠 Стена здания':'🧱 Новая стена')+' · '+selectedWall.id;
}
function switchEditorMode(isWalls){
 wallMode=isWalls;
 wallField('Tools').style.display=isWalls?'block':'none';
 document.getElementById('edFurnitureTools').style.display=isWalls?'none':'block';
 if(isWalls)pickEdit(null);else wallPick(null);
}
document.getElementById('edModeFurniture').onclick=()=>switchEditorMode(false);
document.getElementById('edModeWalls').onclick=()=>switchEditorMode(true);
wallField('Add').onclick=()=>{
 camera.updateMatrixWorld(true);
 const dir=new THREE.Vector3();camera.getWorldDirection(dir);dir.y=0;
 if(dir.lengthSq()<.001)dir.set(0,0,1);dir.normalize();
 const x=camera.position.x+dir.x*3,z=camera.position.z+dir.z*3;
 let y=0;for(const surface of walkableSurfaces)if(surface.architecture&&x>=surface.x1&&x<=surface.x2&&z>=surface.z1&&z<=surface.z2&&surface.y<=camera.position.y+.15)y=Math.max(y,surface.y);
 const id='built-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*10000);
 const data={x,z,y,length:3,height:2.7,thickness:.2,rotation:Math.abs(dir.x)>Math.abs(dir.z)?Math.PI/2:0,opening:'none',openingWidth:1.2,openingHeight:2.2,sill:1};
 const record=wallRegister(id,data);saveEditedWalls();wallPick(record);toast('🧱 Стена добавлена! Настрой размер и проём.');
};
wallField('Apply').onclick=()=>{
 if(!selectedWall)return toast('🧱 Сначала выбери стену');
 const value=(field,min,max)=>THREE.MathUtils.clamp(Number(wallField(field).value)||min,min,max);
 wallApplyChanges({length:value('Length',.4,30),height:value('Height',.4,9),thickness:value('Thickness',.08,1.2),opening:wallField('Opening').value,openingWidth:value('OpeningWidth',.4,12),openingHeight:value('OpeningHeight',.3,6),sill:value('Sill',0,6)});
};

 // Live wall resizing: slider and numeric fields stay synchronized.
 for(const [key,field,min,max] of [['length','Length',.4,30],['height','Height',.4,9],['thickness','Thickness',.08,1.2]]){
  const slider=wallField(field+'Slider'),number=wallField(field),value=wallField(field+'Value');
  function applyDimension(v){
   const n=Number(v);
   if(!Number.isFinite(n))return;
   const next=THREE.MathUtils.clamp(n,min,max);
   slider.value=String(next);number.value=String(next);
   value.textContent=next.toFixed(field==='Thickness'?2:1);
   if(selectedWall)wallApplyChanges({[key]:next});
  }
  slider.addEventListener('input',()=>applyDimension(slider.value));
  number.addEventListener('change',()=>applyDimension(number.value));
 }
wallField('Rotate').onclick=()=>{if(selectedWall)wallApplyChanges({rotation:selectedWall.data.rotation+Math.PI/2})};
for(const [button,dx,dz,dy] of [['Left',-.2,0,0],['Right',.2,0,0],['Forward',0,.2,0],['Back',0,-.2,0],['Up',0,0,.05],['Down',0,0,-.05]]){
 wallField(button).onclick=()=>{
  if(!selectedWall)return;
  const right=new THREE.Vector3(-Math.cos(editCamYaw),0,Math.sin(editCamYaw)),forward=new THREE.Vector3(Math.sin(editCamYaw),0,Math.cos(editCamYaw));
  wallApplyChanges({x:selectedWall.data.x+dx*right.x+dz*forward.x,z:selectedWall.data.z+dx*right.z+dz*forward.z,y:Math.max(0,selectedWall.data.y+dy)});
 };
}
wallField('Reset').onclick=()=>{
 if(!selectedWall)return;
 const id=selectedWall.id,base=architecturalWallRecords.find(x=>x.id===id);
 if(!confirm(base?'Вернуть исходную стену и убрать созданные проёмы?':'Удалить добавленную стену?'))return;
 wallRemoveParts(selectedWall);
 if(base){base.originalMesh.parent||house.add(base.originalMesh);if(!wallMeshes.includes(base.originalMesh))wallMeshes.push(base.originalMesh);if(!colliders.includes(base.originalCollider))colliders.push(base.originalCollider);}
 wallEdits.delete(id);wallRecords.delete(id);wallPick(null);saveEditedWalls();
};
wallField('Save').onclick=()=>{saveEditedWalls();toast('💾 Стены сохранены. Для переноса на телефон экспортируй JSON участка')};
wallField('Export').onclick=()=>{
 saveEditedWalls();
 const payload={version:1,walls:JSON.parse(localStorage.getItem(WALL_SAVE_KEY)||'{}')};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='badcat_walls.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
 toast('🧱 Скачан файл стен. Экспорт всего участка также содержит стены.');
};

wallRestoreAll();
function syncEditorLabel(){document.getElementById('edSelected').textContent=editSelected?`${editSelected.description} · X ${editSelected.holder.position.x.toFixed(1)} · Z ${editSelected.holder.position.z.toFixed(1)} · Y ${editSelected.holder.position.y.toFixed(2)} · Размер ${Math.round(editSelected.holder.scale.x*100)}%`:'Нажми на любую мебель в сцене';}
function pickEdit(item){editSelected=item;if(editHelper){scene.remove(editHelper);editHelper.geometry.dispose();editHelper.material.dispose();editHelper=null;}if(item){editHelper=new THREE.BoxHelper(item.holder,0xffd543);scene.add(editHelper)}syncEditorLabel();}
function toggleEditor(force){editorOn=typeof force==='boolean'?force:!editorOn;editorPanel.style.display=editorOn?'block':'none';editorButton.textContent=editorOn?'✅ Закончить':'🛠️ Мебель';if(!editorOn){pickEdit(null);wallPick(null);editPointer=null;saveFurniture();saveEditedWalls();}else{// Free camera starts at its current independent world pose, never attached to the cat.
editCamTarget.copy(camera.position).add(new THREE.Vector3(Math.sin(editCamYaw)*8,0,Math.cos(editCamYaw)*8));editCamDistance=8;for(const k in keys)keys[k]=false;stick.x=stick.y=0;toast('🛠️ Выбери предмет мышью / пальцем');}}
document.getElementById('edCameraMode').onclick=()=>{editCameraMode=!editCameraMode;document.getElementById('edCameraMode').textContent=editCameraMode?'✋ Перемещение камеры':'📷 Камера';};
document.getElementById('edFocus').onclick=()=>{if(editSelected)editCamTarget.copy(editSelected.holder.position).add(new THREE.Vector3(0,1,0));else editCamTarget.set(0,1.8,0);};
document.getElementById('edTop').onclick=()=>{editCamPitch=1.43;editCamDistance=17;};
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('wheel',e=>{if(editorOn){e.preventDefault();editCamDistance=THREE.MathUtils.clamp(editCamDistance*Math.exp(e.deltaY*.001),1.8,90)}},{passive:false});
editorButton.onclick=()=>toggleEditor();document.getElementById('edToggle').onclick=()=>toggleEditor(false);
function moveEdit(dx,dz,dy=0,rot=0){
 if(!editSelected)return;
 // View-right vector follows actual lookAt camera orientation (not the reversed world X axis).
 const rightX=-Math.cos(editCamYaw),rightZ=Math.sin(editCamYaw);
 const forwardX=Math.sin(editCamYaw),forwardZ=Math.cos(editCamYaw);
 moveEditedSafely(editSelected,()=>{
  const p=editSelected.holder.position;
  p.x+=dx*rightX+dz*forwardX;
  p.z+=dx*rightZ+dz*forwardZ;
  p.y=Math.max(0,p.y+dy);
  editSelected.holder.rotation.y+=rot;
 });
}
for(const [id,dx,dz,dy,rot] of [['edLeft',-.25,0,0,0],['edRight',.25,0,0,0],['edForward',0,-.25,0,0],['edBack',0,.25,0,0],['edFineUp',0,0,.05,0],['edFineDown',0,0,-.05,0],['edUp',0,0,F,0],['edDown',0,0,-F,0],['edRotL',0,0,0,-Math.PI/12],['edRotR',0,0,0,Math.PI/12]])document.getElementById(id).onclick=()=>moveEdit(dx,dz,dy,rot);
// Uniform sizing keeps original proportions and uses the same architectural collision guard.
function resizeEdited(factor,reset=false){
 if(!editSelected)return;
 const piece=editSelected;
 moveEditedSafely(piece,()=>{
  const next=reset?1:THREE.MathUtils.clamp(piece.holder.scale.x*factor,.2,4);
  piece.holder.scale.setScalar(next);
 });
}
document.getElementById('edScaleUp').onclick=()=>resizeEdited(1.05);
document.getElementById('edScaleDown').onclick=()=>resizeEdited(.95);
document.getElementById('edScaleReset').onclick=()=>resizeEdited(1,true);
document.getElementById('edSave').onclick=()=>{saveFurniture();toast('💾 Расстановка сохранена в браузере!')};
document.getElementById('edRemove').onclick=()=>{if(!editSelected)return;editSelected.removed=true;editSelected.holder.visible=false;refreshEditBounds(editSelected);pickEdit(null);saveFurniture()};
let customIndex=0;
async function addCatalogItem(key,restore=null,id=null){
 if(!key.includes(':'))key='tiny:'+key;
 const [pack,name]=key.split(':');const match=name.toLowerCase(),decor=/art|mirror|carpet|rug|flower|grass|road|path|paving|tile/.test(match),small=/lamp|bookends|flower|grass|rock_small|wrench|shovel|hammer|toolbox/.test(match),seat=/chair|pouffe|loveseat|sitting|sofa/.test(match),bed=/bed/.test(match),tree=/tree|birch|pine|palm/.test(match),road=pack==='roads'||/path|road|paving/.test(match);
 const w=road?4:tree?3.7:small?.65:bed?2.7:seat?1.9:decor?1.2:/fridge|cabinet|bookcase|shelf|chest|dresser|rack/.test(match)?1.35:1.8,d=road?4:tree?3.6:small?.65:bed?2.65:seat?1.3:decor?.9:1.2,h=road?.38:tree?4.8:small?.8:bed?1.5:decor?.95:1.65;
 // New additions spawn ahead of the actual camera, not at the distant orbit target.
 // Restore and starter positions remain completely unchanged.
 // Architectural floors only: avoid spawning on top of existing furniture.
 function editorFloorAt(x,z,cameraHeight){
  let floor=0;
  for(const surface of walkableSurfaces){
   if(!surface.architecture)continue;
   if(x<surface.x1||x>surface.x2||z<surface.z1||z>surface.z2)continue;
   if(surface.y<=cameraHeight+.15&&surface.y>floor)floor=surface.y;
  }
  return floor;
 }
 const cameraSpawn=!restore&&editorOn;
 let spawnX=cat.position.x+2,spawnY=cat.position.y>F-1.1?F:0,spawnZ=cat.position.z+2;
 if(cameraSpawn){
  camera.updateMatrixWorld(true);
  const look=new THREE.Vector3();camera.getWorldDirection(look);
  const horizontal=new THREE.Vector3(look.x,0,look.z);
  if(horizontal.lengthSq()<.0001)horizontal.set(Math.sin(editCamYaw),0,Math.cos(editCamYaw));
  horizontal.normalize();
  const toward=new THREE.Raycaster(camera.position,horizontal,0,4.5);
  const wall=editorWallDistance(toward);
  const distance=THREE.MathUtils.clamp(wall-.85,1.2,2.8);
  spawnX=camera.position.x+horizontal.x*distance;
  spawnZ=camera.position.z+horizontal.z*distance;
  spawnY=editorFloorAt(spawnX,spawnZ,camera.position.y);
 }
 const floor=restore?.pos?.[1]??spawnY,x=restore?.pos?.[0]??spawnX,z=restore?.pos?.[2]??spawnZ;
 const editId=id||'custom-'+(++customIndex);let piece;
 if(pack==='tiny')piece=await placeTiny([name,x,z,floor,w,d,h,restore?.rot||0,seat?'chair':bed?'bed':'solid','scratch',!decor],editId);
 else if(pack==='kenney')piece=await place([name,x,z,floor,w,d,h,restore?.rot||0,seat?'chair':bed?'bed':decor?'decor':'solid',decor?'knock':'scratch'],editId);
 else {piece=await placeGarden([pack,name,catalogLabel(key),x,z,w,d,h,restore?.rot||0,tree?'':'knock',!decor&&!tree],editId);piece.holder.position.y=floor;refreshEditBounds(piece)}
 if(restore?.hidden){piece.removed=true;piece.holder.visible=false;refreshEditBounds(piece)}return piece;
}
function exportFurniture(){saveFurniture();saveEditedWalls();const data={version:2,layout:JSON.parse(localStorage.getItem(EDIT_SAVE_KEY)),custom:customEntries,walls:JSON.parse(localStorage.getItem(WALL_SAVE_KEY)||'{}')};const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='badcat_estate_layout_with_walls.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
document.getElementById('edExport').onclick=exportFurniture;
let customEntries=[];
const originalAdd=addCatalogItem;
// Track chosen models so custom furniture can be restored on reload and imported elsewhere.
document.getElementById('edAdd').onclick=async()=>{try{if(!catalog.value){toast('🔎 Сначала выбери предмет');return}const id='custom-'+(++customIndex),name=catalog.value;const piece=await addCatalogItem(name,null,id);
 // Try nearby positions towards the camera if the initial model would overlap a wall.
 if(!canPlaceEdited(piece)&&editorOn){
  const forward=new THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;forward.normalize();
  const at=piece.holder.position.clone();
  let placed=false;
  for(const back of [.4,.8,1.2,1.6,2]){
   piece.holder.position.set(at.x-forward.x*back,at.y,at.z-forward.z*back);
   if(canPlaceEdited(piece)){placed=true;break}
  }
  if(!placed){piece.holder.position.copy(at);toast('⚠️ Предмет близко к стене — подвинь его')}
  refreshEditBounds(piece);
 }
 customEntries.push({id,name});pickEdit(piece);saveFurniture();persistExtras();toast('🪑 Предмет добавлен — перетащи его') }catch(e){
  console.error('Furniture creation failed:',catalog.value,ALL_CATALOG[catalog.value],e);
  toast('⚠️ Модель не загрузилась: '+(catalog.value||'неизвестная')+' — смотри F12');
 }};
function persistExtras(){localStorage.setItem(EDIT_SAVE_KEY+'-extras',JSON.stringify(customEntries));}

// Furniture clipboard: duplicates are regular editor objects and survive JSON export/reload.
let furnitureClipboard=null,pastingFurniture=false;
function floorBelowFurniture(x,z,y){
 let floor=0;
 for(const surface of walkableSurfaces){
  if(!surface.architecture||x<surface.x1||x>surface.x2||z<surface.z1||z>surface.z2)continue;
  if(surface.y<=y+.15&&surface.y>floor)floor=surface.y;
 }
 return floor;
}
function copyEditedPiece(){
 if(!editSelected||editSelected.removed){toast('📋 Сначала выбери предмет');return}
 const source=customEntries.find(entry=>entry.id===editSelected.editId);
 if(!source){toast('📋 Этот предмет нельзя копировать');return}
 const pos=editSelected.holder.position;
 furnitureClipboard={
  name:source.name,rot:editSelected.holder.rotation.y,
  scale:editSelected.holder.scale.x,
  aboveFloor:pos.y-floorBelowFurniture(pos.x,pos.z,pos.y)
 };
 toast('📋 Скопировано: '+editSelected.description);
}
async function pasteEditedPiece(){
 if(!furnitureClipboard){toast('📋 Сначала выбери предмет и нажми Ctrl+C');return}
 if(pastingFurniture)return;
 pastingFurniture=true;
 const source={...furnitureClipboard};
 try{
  const id='custom-'+(++customIndex);
  const piece=await addCatalogItem(source.name,null,id);
  const pos=piece.holder.position;
  // Keep the copied elevation relative to the destination's floor.
  pos.y+=source.aboveFloor;
  piece.holder.rotation.y=source.rot;
  piece.holder.scale.setScalar(source.scale);
  refreshEditBounds(piece);
  // Shift closer to the camera when the first spawn candidate clips a wall.
  if(!canPlaceEdited(piece)){
   const forward=new THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;forward.normalize();
   const start=pos.clone(),steps=[.35,.7,1.05,1.4,1.75,2.1];
   for(const back of steps){
    pos.set(start.x-forward.x*back,start.y,start.z-forward.z*back);
    // If backing up crosses a floor edge, preserve the pasted vertical offset.
    pos.y=floorBelowFurniture(pos.x,pos.z,camera.position.y)+source.aboveFloor;
    if(canPlaceEdited(piece))break;
   }
   refreshEditBounds(piece);
  }
  customEntries.push({id,name:source.name});
  pickEdit(piece);saveFurniture();persistExtras();
  toast('📋 Копия создана перед камерой');
 }catch(error){console.error('Paste furniture:',error);toast('⚠️ Не удалось вставить предмет')}
 finally{pastingFurniture=false}
}

// Starter layout is stored as ordinary editable custom entries, not fixed 3D geometry.
// All the objects can be moved, removed, exported and re-imported later.
const starterLayout=[
 // Living room
 ['tiny:TinyLiving_LovelyLoveseat_12',-7.2,0,6.1,3.14],
 ['tiny:TinyLiving_LovelyArmchair_33',-3.5,0,6.7,-.4],
 ['kenney:tableCoffee',-6.4,0,3.8,0],
 ['kenney:cabinetTelevision',-6.0,0,8.1,0],
 ['kenney:bookcaseOpen',-9.6,0,3.1,1.57],
 ['kenney:lampRoundFloor',-9.5,0,7.4,0],
 ['kenney:rugRectangle',-6.4,0,5.15,0],
 ['tiny:TinyLiving_ModernPouffe_36',-3.15,0,4.5,0],
 // Kitchen
 ['kenney:kitchenFridgeLarge',-9.45,0,-7.15,0],
 ['kenney:kitchenSink',-9.45,0,-5.20,0],
 ['kenney:kitchenStove',-9.45,0,-3.05,0],
 ['kenney:kitchenCabinet',-7.5,0,-7.6,0],
 ['kenney:kitchenCoffeeMachine',-6.3,0,-7.9,0],
 ['kenney:table',-5.0,0,-5.25,0],
 ['kenney:chairRounded',-5.0,0,-3.65,0],
 ['kenney:chairRounded',-5.0,0,-6.7,3.14],
 ['kenney:trashcan',-2.1,0,-7.7,0],
 // Hall and dining
 ['kenney:tableCloth',4.8,0,-5.6,0],
 ['kenney:chairCushion',3.3,0,-5.6,1.57],
 ['kenney:chairCushion',6.3,0,-5.6,-1.57],
 ['kenney:chairCushion',4.8,0,-3.95,0],
 ['kenney:bookcaseClosed',9.8,0,-7.2,1.57],
 ['tiny:TinyLiving_ModernPouffe_36',4.1,0,7.4,0],
 ['kenney:coatRackStanding',1.8,0,7.5,0],
 // Upstairs
 ['kenney:bedDouble',-6.4,3.55,5.6,0],
 ['kenney:sideTableDrawers',-9.4,3.55,7.0,1.57],
 ['tiny:TinyLiving_PowerTowerDresser_24',-9.3,3.55,2.9,1.57],
 ['kenney:lampRoundTable',-9.4,3.55,6.1,0],
 ['kenney:bathtub',-7.7,3.55,-7.5,0],
 ['kenney:toilet',-3.1,3.55,-7.7,0],
 ['kenney:bathroomSink',-9.5,3.55,-3.5,0],
 ['kenney:desk',4.8,3.55,-7.15,0],
 ['kenney:chairDesk',4.8,3.55,-5.1,3.14],
 ['kenney:bookcaseOpen',9.7,3.55,-7.2,1.57],
 ['kenney:loungeSofa',3.1,3.55,6.2,3.14],
 ['kenney:tableCoffeeSquare',3.1,3.55,4.4,0],
 // Garden near the house and patio
 ['patio:garden_bench',-9.5,0,16,0],
 ['patio:picnic_table',9.0,0,18,0],
 ['patio:bbq_grill',11.5,0,14,0],
 ['patio:planter_box',-7.0,0,15.7,0],
 ['patio:mailbox_post',4.7,0,18.7,0],
 ['nature:tree_default',-21,0,22,0],
 ['nature:tree_oak',-25,0,-17,0],
 ['nature:tree_default',23,0,24,0],
 ['nature:tree_pineRoundA',-52,0,7,0],
 ['nature:tree_simple',50,0,-50,0],
 ['nature:plant_bushLarge',-16,0,15,0],
 ['nature:plant_bush',15,0,17,0],
 ['patio:gazebo',-20,0,27,0],
 ['patio:hammock_stand',-29,0,23,0],
 // Garage / shed, only existing models
 ['kenney:desk',35.0,0,-37.0,0],
 ['kenney:bookcaseOpen',31.5,0,-35.7,1.57],
 ['market:18_Wood_Barrel',42.0,0,-36.0,0],
 ['market:10_Empty_Crate',-43.2,0,-33.5,0],
 ['market:15_Wheelbarrow',-38.5,0,-31.6,0],
 ['market:13_Shovel',-45.0,0,-34.4,0],
 ['market:14_Rake',-45.5,0,-33.0,0],
 // Sauna / greenhouse
 ['tiny:TinyLiving_LovelyLoveseat_12',38.1,0,32.0,0],
 ['kenney:sideTable',43.0,0,31.8,0],
 ['patio:raised_bed',-42.8,0,33.0,0],
 ['patio:raised_bed',-38.0,0,33.0,0],
 ['market:03_Plant_Shelf',-45.0,0,37.5,1.57],
 ['nature:plant_bushDetailed',-32,0,39,0],
 // Additional outdoor packs: included only after the ZIP is installed.
 ['roads:straightRoad',2.7,0,24,0],
 ['roads:straightRoad',2.7,0,28,0],
 ['roads:straightRoad',2.7,0,32,0],
 ['roads:curvedRoad',12,0,30,0],
 ['garage:workbench',39.5,0,-36.1,0],
 ['garage:tool_chest',43.2,0,-34.2,0],
 ['garage:parts_shelf',31.8,0,-32.1,1.57],
 ['garage:tire_stack',35.2,0,-30.9,0],
 ['garden2:garden_path',-12,0,22,0],
 ['garden2:garden_path',-15.5,0,22,0],
 ['garden2:compost_bin',-51,0,29,0],
 ['hydro:potting_bench',-42.3,0,35.3,0],
 ['hydro:tomato_plant',-37.5,0,35.3,0],
 ['hydro:seedling_tray',-36.8,0,38.0,0],
 ['nature2:birch_tree',-48,0,50,0],
 ['factory:box-large',-39.0,0,-33.2,0]
];
const STARTER_KEY='badcat3d-estate-v22-starter-installed';
async function applyStarter({automatic=false}={}){
 await extraCatalogReady;
 if(!automatic && customEntries.length && !confirm('Добавить примерную расстановку к уже размещённым предметам? Существующая мебель останется.'))return;
 let count=0;
 for(const [name,x,y,z,rot] of starterLayout){
  if(!ALL_CATALOG[name])continue;
  const id='custom-'+(++customIndex);
  const pose={pos:[x,y,z],rot,hidden:false};
  storedLayout[id]=pose;
  customEntries.push({id,name});
  try{await addCatalogItem(name,pose,id);count++}catch(e){console.warn('Preset furniture failed:',name,e)}
 }
 localStorage.setItem(EDIT_SAVE_KEY,JSON.stringify(storedLayout));
 persistExtras();localStorage.setItem(STARTER_KEY,'1');
 toast('🏡 Расставлено '+count+' объектов. Можешь двигать и сохранять их!');
}
document.getElementById('edStarter').onclick=()=>applyStarter();
// This is the player's complete approved estate layout committed with the project.
// Model files themselves remain in their respective asset packs.
const BUILTIN_LAYOUT_KEY='badcat3d-builtin-layout-2026-10-25-v1';
async function loadCommittedFurniture(){
 const paths=Array.from({length:6},(_,i)=>'./layouts/builtin_furniture_part_'+(i+1)+'.json');
 const responses=await Promise.all(paths.map(path=>fetch(path,{cache:'no-store'})));
 for(let i=0;i<responses.length;i++)if(!responses[i].ok)throw Error('Missing bundled layout '+paths[i]+' ('+responses[i].status+')');
 const parts=await Promise.all(responses.map(response=>response.json()));
 const rows=parts.flat();
 if(rows.length!==416)throw Error('Incomplete bundled layout: '+rows.length+' instead of 416');
 const layout={},custom=[];
 for(const row of rows){
  if(!Array.isArray(row)||row.length!==8||!Number.isInteger(row[0])||typeof row[1]!=='string'||row[1].indexOf(':')<1||
     !row.slice(2,7).every(Number.isFinite)||![0,1].includes(row[7]))throw Error('Invalid bundled furniture row');
  const id='custom-'+row[0];
  if(layout[id])throw Error('Duplicate bundled furniture '+id);
  custom.push({id,name:row[1]});
  layout[id]={pos:[row[2],row[3],row[4]],rot:row[5],scale:row[6],hidden:Boolean(row[7])};
 }
 return {layout,custom};
}
async function initializeCommittedFurniture(){
 const builtin=await loadCommittedFurniture();
 const existingLayout=localStorage.getItem(EDIT_SAVE_KEY);
 const existingExtras=localStorage.getItem(EDIT_SAVE_KEY+'-extras');
 // Import the committed layout once, then let the editor retain later local changes.
 // First import saves the older setup separately, never silently destroys it.
 if(localStorage.getItem(BUILTIN_LAYOUT_KEY)!=='1'||!existingLayout||!existingExtras){
  if(existingLayout&&localStorage.getItem(BUILTIN_LAYOUT_KEY)!=='1')localStorage.setItem(EDIT_SAVE_KEY+'-before-builtin',existingLayout);
  if(existingExtras&&localStorage.getItem(BUILTIN_LAYOUT_KEY)!=='1')localStorage.setItem(EDIT_SAVE_KEY+'-extras-before-builtin',existingExtras);
  localStorage.setItem(EDIT_SAVE_KEY,JSON.stringify(builtin.layout));
  localStorage.setItem(EDIT_SAVE_KEY+'-extras',JSON.stringify(builtin.custom));
  localStorage.setItem(BUILTIN_LAYOUT_KEY,'1');
  storedLayout=builtin.layout;
  console.info('Bad Cat 3D: restored permanent project furniture layout ('+builtin.custom.length+' objects)');
 }else{
  // Existing positions are user edits to the committed layout and win.
  storedLayout=JSON.parse(existingLayout);
 }
}
const missingFurnitureModels=[];
async function loadExtras(){
 await initializeCommittedFurniture();
 customEntries=JSON.parse(localStorage.getItem(EDIT_SAVE_KEY+'-extras')||'[]');
  if(!Array.isArray(customEntries))customEntries=[];
  if(!Array.isArray(customEntries)||!customEntries.length)throw Error('Расстановка отсутствует');
  loadingTotal=customEntries.length;
  updateLoading(14,'Расставляем мебель и предметы…','0 из '+loadingTotal);
  const extraReady=await extraCatalogReady;
  if(!extraReady&&customEntries.some(c=>c.name&&!c.name.startsWith('tiny:')&&!c.name.startsWith('kenney:'))){
   throw Error('Не загружен assets/extra_catalog.json: недоступны дополнительные модели');
  }
  // Process model instances in a bounded parallel queue instead of waiting
  // for 416 separate requests one by one. The GLTF loaders already cache
  // promises for repeated model names; all original IDs/poses stay unchanged.
  const workers=Math.min(customEntries.length,
   /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)?6:12);
  let nextIndex=0;
  async function furnitureWorker(){
   while(nextIndex<customEntries.length){
    const c=customEntries[nextIndex++];
    const number=Number(c.id.split('-')[1]);if(number>customIndex)customIndex=number;
    try{
     await addCatalogItem(c.name,storedLayout[c.id],c.id);
    }catch(e){
     console.warn('Could not load custom item',c.name,e);
     console.error('Model load failed:',c.name,'url:',ALL_CATALOG[c.name]||'(not in catalog)',e);
     missingFurnitureModels.push(c.name);
    }
    loadingCount++;
    updateFurnitureLoading();
    // Let the browser paint progress and keep phone touch/animation responsive.
    if(loadingCount%24===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
  await Promise.all(Array.from({length:workers},()=>furnitureWorker()));
 if(missingFurnitureModels.length){
  console.warn('Missing furniture models:',missingFurnitureModels);
  throw Error('Не загрузились '+missingFurnitureModels.length+' предметов: '+missingFurnitureModels.slice(0,3).join(', '));
 }
}
document.getElementById('edImportFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!parsed.layout||typeof parsed.layout!=='object'||!Array.isArray(parsed.custom))throw Error('Invalid format');
 const previous=localStorage.getItem(WALL_SAVE_KEY);
 if(previous)localStorage.setItem(WALL_SAVE_KEY+'-backup-before-import',previous);
 localStorage.setItem(EDIT_SAVE_KEY,JSON.stringify(parsed.layout));localStorage.setItem(EDIT_SAVE_KEY+'-extras',JSON.stringify(parsed.custom));
 if(parsed.walls&&typeof parsed.walls==='object'&&!Array.isArray(parsed.walls))localStorage.setItem(WALL_SAVE_KEY,JSON.stringify(parsed.walls));
 location.reload()}catch(err){toast('⚠️ Неверный файл JSON');console.error(err)}};
document.getElementById('edReset').onclick=()=>{
 if(!confirm('Восстановить твою сохранённую в проекте расстановку (416 объектов)? Текущие перемещения заменятся, прогресс квестов останется.'))return;
 const before=localStorage.getItem(EDIT_SAVE_KEY),extras=localStorage.getItem(EDIT_SAVE_KEY+'-extras');
 if(before)localStorage.setItem(EDIT_SAVE_KEY+'-before-reset',before);
 if(extras)localStorage.setItem(EDIT_SAVE_KEY+'-extras-before-reset',extras);
 localStorage.removeItem(BUILTIN_LAYOUT_KEY);
 localStorage.removeItem(EDIT_SAVE_KEY);
 localStorage.removeItem(EDIT_SAVE_KEY+'-extras');
 location.reload();
};
const rayPos=new THREE.Vector2();
function editRay(event){const rect=renderer.domElement.getBoundingClientRect();rayPos.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);editHits.setFromCamera(rayPos,camera)}
// Only objects in front of the first solid wall along the pointer ray are selectable.
function editorWallDistance(raycaster){
 const walls=raycaster.intersectObjects(wallMeshes,false);
 return walls.length?walls[0].distance:Infinity;
}
function selectFromPointer(event){
 if(wallMode){wallSelectFromPointer(event);return}
 editRay(event);
 const pieces=[...editablePieces.values()].filter(p=>!p.removed&&p.holder.visible);
 const holders=pieces.map(p=>p.holder);
 const wallDistance=editorWallDistance(editHits);
 const visibleHit=editHits.intersectObjects(holders,true).find(hit=>hit.distance<wallDistance-.015);
 if(!visibleHit){pickEdit(null);return}
 let obj=visibleHit.object;
 while(obj&&!holders.includes(obj))obj=obj.parent;
 pickEdit(pieces.find(p=>p.holder===obj)||null);
}
const furnitureExtrasReady=()=>loadExtras();

const furnitureJob=(async()=>{
 try{
  updateLoading(3,'Строим карту…','Готовим здания, дороги и двор');
  const [catLoaded,tinyLookup]=await Promise.all([catReady,tinyLookupPromise]);
  if(catLoaded===false||!catModel)throw Error('Не загрузилась 3D-модель котика');
  if(!tinyLookup.size)throw Error('Пустой набор Tiny Living');
  updateLoading(12,'Карта готова','Читаем сохранённую расстановку');
  await furnitureExtrasReady();
  if(loadingCount!==loadingTotal)throw Error('Не все предметы обработаны');
  // Ensure all successfully placed instances actually exist in the scene.
  const missing=customEntries.filter(c=>!editablePieces.has(c.id));
  if(missing.length)throw Error('Не появились объекты: '+missing.slice(0,3).map(c=>c.name).join(', '));
  updateLoading(100,'Всё готово! 🐾',customEntries.length+' предметов загружено. Приятной игры!');
  furnitureReady=true;
  loadingUI.play.disabled=false;
  loadingUI.play.hidden=false;
  if(isBlocked(owner.position.x,owner.position.z,0,HUMAN_RADIUS,1.8))owner.position.set(3.4,0,5.2);
 }catch(error){
  console.error('Game loading failed:',error);
  furnitureReady=false;
  loadingUI.play.hidden=true;loadingUI.play.disabled=true;
  loadingUI.retry.hidden=false;
  loadingUI.status.textContent='⚠️ Не удалось полностью загрузить игру';
  loadingUI.details.textContent=(error?.message||String(error))+' · Проверь файлы и попробуй снова.';
 }
})();
function nearest(kind,range=1.7){let result=null,dist=range;
 for(const it of interactables){if(it.used||it.removed||it.action!==kind)continue;
  const d=Math.hypot(cat.position.x-it.holder.position.x,cat.position.z-it.holder.position.z);
  if(d<dist&&Math.abs(cat.position.y-it.level)<1.6){dist=d;result=it}
 }return result;
}
function sparks(x,y,z,type){const color=type==='scratch'?0xffd470:type==='tear'?0xfff1de:0xffc18e;
 for(let i=0;i<8;i++){const m=ball(.035,new THREE.MeshBasicMaterial({color}),x,y,z,scene);
  fx.push({mesh:m,vx:(Math.random()-.5)*2.8,vy:1.4+Math.random()*2,vz:(Math.random()-.5)*2.8,time:.5});
 }
}
function chaosAction(type){if(!playing)return;
 const item=nearest(type,type==='scratch'?1.75:1.85);
 if(!item){toast(type==='scratch'?'🐾 Подойди к дивану, креслу или шкафу':type==='tear'?'🧻 Найди подушку, коробку или книги':'💥 Подойди к предмету');return}
 item.used=true;chaos++;score+=type==='scratch'?3:type==='tear'?2:1;alertness=Math.min(100,alertness+17);mood=Math.min(100,mood+5);
 if(type==='scratch'){scratched=true;if(item.model==='Садовая лавка')parkScratched=true;}
 if(type==='knock'&&item.kind==='street')streetKnocks++;
 const p=item.holder.position;sparks(p.x,cat.position.y+.5,p.z,type);
 if(type==='scratch'){
  // Tint ONLY this instance's materials, not all copies of the same model.
  item.holder.traverse(n=>{if(n.isMesh){n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();const materials=Array.isArray(n.material)?n.material:[n.material];for(const m of materials)if(m.color)m.color.multiplyScalar(.81)}});
 }else if(type==='tear'){item.holder.scale.set(.84,.9,.84);item.holder.rotation.z+=.13}
 else {if(item.collider){const ci=colliders.indexOf(item.collider);if(ci>=0)colliders.splice(ci,1);item.collider=null;for(const child of [...collisionVisuals.children]){collisionVisuals.remove(child);child.geometry.dispose();child.material.dispose()}for(const c of colliders)addDebugBox(c)}const vx=p.x-cat.position.x,vz=p.z-cat.position.z,l=Math.hypot(vx,vz)||1;item.vx=vx/l*2.25;item.vz=vz/l*2.25;item.vy=3.0}
 sound(type==='knock'?'hit':type);toast((type==='scratch'?'🐾 Поцарапал ':type==='tear'?'🧻 Разодрал ':'💥 Сбил ')+item.model+'!');updateQuest();setProgress();
}
function autoKnock(){for(const it of interactables){if(it.action!=='knock'||it.used||it.removed)continue;
 if(Math.abs(cat.position.y-it.level)>1.7)continue;
 if(Math.hypot(cat.position.x-it.holder.position.x,cat.position.z-it.holder.position.z)<.52){
  // Don't knock over the whole sofa or bookcase: only marked props/plants.
  chaosAction('knock');break;
 }
}}
let lastMeal=-100;
function stealFood(){if(!playing)return;
 const fridge=nearestFridge();
 if(!fridge){toast('🐟 Холодильник не найден в расстановке');return}
 if(cat.position.y>fridge.holder.position.y+1.3||Math.hypot(cat.position.x-fridge.holder.position.x,cat.position.z-fridge.holder.position.z)>2.6){
  toast('🐟 Подойди к своему холодильнику на кухне');return;
 }
 if(elapsed-lastMeal<12){toast('🐟 Котик сыт, попробуй чуть позже');return}
 lastMeal=elapsed;hunger=Math.min(100,hunger+38);mood=Math.min(100,mood+8);
 ate=true;score+=4;alertness=Math.min(100,alertness+9);sound('eat');
 toast('🐟 Нашёл еду в холодильнике! +4 🐟');updateQuest();setProgress();
}
function goSleep(){if(!playing)return;
 const beds=[...editablePieces.values()].filter(p=>!p.removed&&p.holder.visible&&/bed|кровать/i.test(p.model+' '+p.description));
 const nearby=beds.some(p=>Math.abs(cat.position.y-p.holder.position.y)<1.4&&Math.hypot(cat.position.x-p.holder.position.x,cat.position.z-p.holder.position.z)<3.0);
 if(!nearby){toast('💤 Подойди к одной из своих кроватей');return}
 sleeping=4;energy=100;mood=Math.min(100,mood+12);slept=true;sound('sleep');toast('💤 Мурр... котик отдыхает');updateQuest();
}
function questInteract(){
 if(!playing)return;
 const q=quests[questIndex];
 if(!q){toast('🏆 Тайна сада раскрыта! Исследуй усадьбу дальше.');return}
 if(q.id==='eat'){stealFood();return}
 const targets={bench:4.3,tracks:6,map:6,shed:7,garage:8,greenhouse:8,treasure:5,gnome:5,
  evidence:5,sauna:8,fountain:8,bone:6,bury:6};
 if(!targets[q.id]){
  toast('🐾 Для этого задания следуй подсказке: '+q.text);return;
 }
 if(!nearQuest(q.at[0],q.at[1],targets[q.id])){
  toast('🧭 Подойди ближе к метке текущего задания');return;
 }
 switch(q.id){
 case 'bench': gardenBench=true;toast('🪑 Под лавкой записка: «Следы ведут к деревьям…»');break;
 case 'tracks':gardenTrail=true;toast('🐾 У деревьев найдены загадочные следы');break;
 case 'map':gardenClue=true;toast('🗺️ У беседки карта: сарай → гараж → теплица → клад!');break;
 case 'shed':shedSearched=true;toast('🧰 В сарае нашлась лопатка для раскопок');break;
 case 'garage':garageSearched=true;toast('🔧 В гараже найден шифр к тайнику');break;
 case 'greenhouse':greenhouseSearched=true;toast('🌱 В теплице обнаружена отметка клада');break;
 case 'treasure':dugTreasure=true;score+=8;sparks(cat.position.x,.3,cat.position.z,'hit');sound('hit');toast('⛏️ Нашёл клад! +8 🐟');break;
 case 'gnome':gnomeSaved=true;score+=2;toast('🧙 Садовый гном спасён!');break;
 case 'evidence':if(!ate){toast('Сперва укради вкусняшки из холодильника');return}
  buriedFish=true;sparks(cat.position.x,.3,cat.position.z,'tear');toast('🕳️ Рыбные улики спрятаны');break;
 case 'sauna':saunaVisited=true;energy=Math.min(100,energy+20);toast('♨️ Отдохнул у бани: +20 энергии');break;
 case 'fountain':bathed=true;mood=100;toast('⛲ Освежился у фонтана!');break;
 case 'bone':dugBone=true;sparks(cat.position.x,.3,cat.position.z,'hit');toast('🦴 Нашёл древнюю косточку');break;
 case 'bury':if(!dugBone){toast('Сначала найди косточку');return}buriedBone=true;toast('🦴 Секрет надёжно закопан!');break;
 default:return;
 }
 updateQuest();setProgress();
}
function groom(){if(!playing)return;mood=Math.min(100,mood+3);toast('🧼 Умывание пока без анимации — скелет нового котика не поддерживает её')}
function meow(){if(!playing)return;sound('meow');toast('МЯЯУ! 🐈');if(questIndex===quests.length-1&&nearQuest(3,13,5)){storyFinished=true;updateQuest();}if(Math.hypot(cat.position.x-owner.position.x,cat.position.z-owner.position.z)<6)alertness=Math.min(100,alertness+18)}
function jump(){if(!playing||!grounded||sleeping>0)return;velY=6.7;grounded=false;sound('jump')}
function toggleView(){viewFirstPerson=!viewFirstPerson;document.getElementById('view').textContent=viewFirstPerson?'🐈 3D-КАМЕРА':'👁️ КАМЕРА';toast(viewFirstPerson?'👁️ Вид от первого лица':'🎥 Камера от третьего лица')}
function saveGame(notify=false){try{localStorage.setItem('badcat3d-house-v21',JSON.stringify({score,chaos,hunger,energy,mood,questIndex,ate,scratched,slept,escaped,streetKnocks,dugTreasure,buriedFish,boughtMilk,bathed,gnomeSaved,dugBone,buriedBone,neighborSlept,parkScratched,marketFood,storyVersion:2,gardenBench,gardenTrail,gardenClue,garageSearched,shedSearched,greenhouseSearched,saunaVisited,storyFinished,cat:[cat.position.x,cat.position.y,cat.position.z]}));if(notify)toast('💾 Прогресс сохранён')}catch(e){if(notify)toast('⚠️ Не удалось сохранить')}}
function loadGame(){try{const current=localStorage.getItem('badcat3d-house-v21');const s=JSON.parse(current||localStorage.getItem('badcat3d-estate-v20')||localStorage.getItem('badcat3d-v16')||localStorage.getItem('badcat3d-v15')||localStorage.getItem('badcat3d-v04')||'null');if(!s)return;
 score=s.score||0;chaos=s.chaos??s.count??0;hunger=s.hunger??85;energy=s.energy??90;mood=s.mood??85;questIndex=s.storyVersion===2?(s.questIndex||0):0; // Old eight-step quest index belongs to a different storyline.
 ate=!!s.ate;scratched=!!s.scratched;slept=!!s.slept;escaped=!!s.escaped;
 streetKnocks=current?(s.streetKnocks||0):0;dugTreasure=!!current&&!!s.dugTreasure;buriedFish=!!current&&!!s.buriedFish;boughtMilk=false;bathed=!!current&&!!s.bathed;gnomeSaved=!!current&&!!s.gnomeSaved;dugBone=!!current&&!!s.dugBone;buriedBone=!!current&&!!s.buriedBone;neighborSlept=false;parkScratched=!!current&&!!s.parkScratched;marketFood=false;
 gardenBench=!!s.gardenBench;gardenTrail=!!s.gardenTrail;gardenClue=!!s.gardenClue;
 garageSearched=!!s.garageSearched;shedSearched=!!s.shedSearched;greenhouseSearched=!!s.greenhouseSearched;
 saunaVisited=!!s.saunaVisited;storyFinished=!!s.storyFinished;
 // Avoid stale positions landing inside furniture; validate after load.
 if(current&&Array.isArray(s.cat)&&s.cat.length===3&&s.cat.every(Number.isFinite)&&Math.abs(s.cat[0])<67&&Math.abs(s.cat[2])<67)cat.position.set(...s.cat);
 updateQuest();setProgress();
 }catch(e){console.warn('Ошибка чтения сохранения',e)}}
loadGame();

for(const [id,action] of [['jump',jump],['swat',()=>chaosAction('knock')],['scratch',()=>chaosAction('scratch')],['tear',()=>chaosAction('tear')],['eat',stealFood],['sleep',goSleep],['meow',meow],['groom',groom],['view',toggleView],['use',questInteract],['unstuck',manualUnstuck]]){
 document.getElementById(id).addEventListener('pointerdown',e=>{e.preventDefault();action()});
}
// Physical keyboard positions work regardless of RU/EN keyboard layout.
function gameInputKey(e){
 const physical={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',KeyQ:'q',KeyE:'e',KeyF:'f',KeyR:'r',KeyG:'g',KeyC:'c',KeyO:'o',KeyX:'x',KeyH:'h',KeyM:'m',KeyU:'u',KeyV:'v',KeyP:'p',KeyB:'b',Space:' ',ShiftLeft:'shift',ShiftRight:'shift',ArrowUp:'arrowup',ArrowDown:'arrowdown',ArrowLeft:'arrowleft',ArrowRight:'arrowright'};
 return physical[e.code]??e.key.toLowerCase();
}
function isTextEditing(e){const el=e.target;return el?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(el?.tagName)}
addEventListener('keydown',e=>{
 if(isTextEditing(e))return;
 // Editor copy/paste uses its own clipboard, not the system text clipboard.
 if(editorOn&&(e.ctrlKey||e.metaKey)&&(e.code==='KeyC'||e.code==='KeyV')){
  e.preventDefault();
  if(e.repeat)return;
  if(e.code==='KeyC')copyEditedPiece();
  else pasteEditedPiece();
  return;
 }
 const key=gameInputKey(e);
 if(editorOn){
  if(e.code==='Escape'){toggleEditor(false);return}
  if(['w','a','s','d','q','e',' ','shift','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){keys[key]=true;e.preventDefault()}
  return;
 }
 if([' ','w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
 if(!keys[key]){
  if(key===' ')jump();
  if(key==='e')chaosAction('knock');if(key==='f')chaosAction('scratch');if(key==='r')chaosAction('tear');
  if(['g','c'].includes(key))stealFood();if(key==='x')questInteract();if(key==='h')goSleep();
  if(key==='m')meow();if(key==='u')groom();if(key==='v')toggleView();
  if(key==='q'){camOrbit=0;camPitch=.15}
  if(key==='p')saveGame(true);
  if(key==='b'){collisionVisuals.visible=!collisionVisuals.visible;toast(collisionVisuals.visible?'🟩 Показаны реальные хитбоксы':'🐾 Хитбоксы скрыты')}
 }
 keys[key]=true;
});
addEventListener('keyup',e=>{keys[gameInputKey(e)]=false});addEventListener('blur',()=>{for(const key in keys)keys[key]=false;stick.x=stick.y=0});
for(const event of ['contextmenu','selectstart','dragstart'])document.addEventListener(event,e=>e.preventDefault());
document.addEventListener('touchmove',e=>{if(e.cancelable)e.preventDefault()},{passive:false});
// * ANDROID-BUILD TODO: review/remove these temporary mobile browser controls on native packaging.
const mobileOrientationBtn=document.getElementById('mobileOrientation');
const mobileFullscreenBtn=document.getElementById('mobileFullscreen');
const mobileInstallBtn=document.getElementById('mobileInstall');
const mobileInstallHint=document.getElementById('mobileInstallHint');
let deferredInstallPrompt=null,orientationTarget='landscape';
function mobileHint(message){
 mobileInstallHint.textContent=message;mobileInstallHint.style.display='block';
}
function syncMobileButtons(){
 const full=!!document.fullscreenElement;
 mobileFullscreenBtn.textContent=full?'↙ Свернуть':'⛶ Экран';
 mobileOrientationBtn.textContent=orientationTarget==='landscape'?'📱 Горизонт.':'📱 Вертикал.';
 if(matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)mobileInstallBtn.style.display='none';
}
async function requestGameFullscreen(){
 if(document.fullscreenElement){await document.exitFullscreen();syncMobileButtons();return false}
 if(!document.documentElement.requestFullscreen){mobileHint('Этот браузер не поддерживает полноэкранный режим. Добавь игру на главный экран.');return false}
 try{await document.documentElement.requestFullscreen({navigationUI:'hide'});syncMobileButtons();return true}
 catch(error){console.info('Fullscreen unavailable:',error);mobileHint('Браузер не разрешил полный экран. Добавь игру на главный экран.');return false}
}
mobileFullscreenBtn.addEventListener('click',()=>{requestGameFullscreen()});
mobileOrientationBtn.addEventListener('click',async()=>{
 orientationTarget=orientationTarget==='landscape'?'portrait':'landscape';
 syncMobileButtons();
 try{
  if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
  if(!screen.orientation?.lock)throw Error('orientation lock unsupported');
  await screen.orientation.lock(orientationTarget);
  mobileInstallHint.style.display='none';
 }catch(error){
  console.info('Screen orientation lock unavailable:',error);
  mobileHint('Поверни телефон '+(orientationTarget==='landscape'?'горизонтально':'вертикально')+'. На этом браузере поворот экрана вручную.');
 }
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;mobileInstallBtn.style.display='';});
mobileInstallBtn.addEventListener('click',async()=>{
 if(deferredInstallPrompt){
  const prompt=deferredInstallPrompt;deferredInstallPrompt=null;
  try{await prompt.prompt();await prompt.userChoice;syncMobileButtons();}catch(e){console.info('Install prompt failed',e);}
 }else if(/iPad|iPhone|iPod/.test(navigator.userAgent)){
  mobileHint('iPhone: открой меню «Поделиться» → «На экран Домой».');
 }else mobileHint('В Chrome открой меню ⋮ → «Добавить на главный экран» или «Установить приложение».');
});
document.addEventListener('fullscreenchange',syncMobileButtons);
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;mobileInstallBtn.style.display='none';mobileHint('Игра добавлена на главный экран!')});
syncMobileButtons();
const joy=document.getElementById('joy'),nub=document.getElementById('nub');let joyPointer=null;
function setJoystick(e){const box=joy.getBoundingClientRect(),dx=e.clientX-(box.left+box.width/2),dy=e.clientY-(box.top+box.height/2),length=Math.hypot(dx,dy)||1;
 const radius=(Math.min(box.width,box.height)-nub.getBoundingClientRect().width)/2-7;
 const travel=Math.max(16,radius),mag=Math.min(1,length/travel);
 stick.x=dx/length*mag;stick.y=-dy/length*mag;
 nub.style.transform=`translate(${stick.x*travel}px,${-stick.y*travel}px)`}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(joyPointer);setJoystick(e)});
joy.addEventListener('pointermove',e=>{e.preventDefault();if(e.pointerId===joyPointer)setJoystick(e)});
for(const name of ['pointerup','pointercancel'])joy.addEventListener(name,e=>{if(e.pointerId===joyPointer){joyPointer=null;stick.x=stick.y=0;nub.style.transform=''}});
let dragging=null,oldX=0,oldY=0;
renderer.domElement.addEventListener('pointerdown',e=>{e.preventDefault();if(editorOn){editLastX=e.clientX;editLastY=e.clientY;editPointer=e.pointerId;editDragMode=(e.button===2||editCameraMode)?'orbit':e.button===1?'pan':'object';if(editDragMode==='object'){selectFromPointer(e);if(wallMode){editDragMode='orbit';}else if(editSelected){editPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,1,0),editSelected.holder.position);editRay(e);const hit=new THREE.Vector3();if(editHits.ray.intersectPlane(editPlane,hit))editOffset.copy(editSelected.holder.position).sub(hit)}else editDragMode='orbit';}renderer.domElement.setPointerCapture(e.pointerId);return;}dragging=e.pointerId;oldX=e.clientX;oldY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)});
renderer.domElement.addEventListener('pointermove',e=>{if(editorOn){if(e.pointerId!==editPointer)return;const dx=e.clientX-editLastX,dy=e.clientY-editLastY;editLastX=e.clientX;editLastY=e.clientY;if(editDragMode==='orbit'){editCamYaw-=dx*.006;editCamPitch=THREE.MathUtils.clamp(editCamPitch+dy*.006,-.1,1.49)}else if(editDragMode==='pan'){const speed=editCamDistance*.002;editCamTarget.x-=Math.cos(editCamYaw)*dx*speed;editCamTarget.z+=Math.sin(editCamYaw)*dx*speed;editCamTarget.y+=dy*speed;}else if(editDragMode==='object'&&editSelected){editRay(e);const hit=new THREE.Vector3();if(editHits.ray.intersectPlane(editPlane,hit)){
   // A wall before the drag plane blocks movement through that wall.
   const wallAt=editorWallDistance(editHits);
   if(wallAt<hit.distanceTo(editHits.ray.origin)-.015)return;
   moveEditedSafely(editSelected,()=>{editSelected.holder.position.x=hit.x+editOffset.x;editSelected.holder.position.z=hit.z+editOffset.z;});
  }}return;}if(e.pointerId!==dragging)return;e.preventDefault();camOrbit-=(e.clientX-oldX)*.005;camPitch=THREE.MathUtils.clamp(camPitch+(e.clientY-oldY)*.003,-.25,.33);oldX=e.clientX;oldY=e.clientY});
for(const name of ['pointerup','pointercancel'])renderer.domElement.addEventListener(name,e=>{if(dragging===e.pointerId)dragging=null;if(editPointer===e.pointerId){editPointer=null;editDragMode=null;saveFurniture()}});
document.getElementById('play').onclick=()=>{if(!furnitureReady)return;try{audio=new (window.AudioContext||window.webkitAudioContext)();audio.resume()}catch(e){}playing=true;document.body.classList.add('game-started');document.getElementById('start').style.display='none';toast('🐾 Добро пожаловать! Следуй к метке на миникарте')};
document.getElementById('reset').onclick=()=>{localStorage.removeItem('badcat3d-v16');localStorage.removeItem('badcat3d-v15');localStorage.removeItem('badcat3d-v13');localStorage.removeItem('badcat3d-v04');location.reload()};
const fps=document.createElement('div');fps.style.cssText='position:fixed;right:12px;bottom:8px;z-index:4;background:#263344c4;color:#fff;padding:5px 10px;border-radius:9px;font:700 12px system-ui;pointer-events:none';fps.textContent='⚡ FPS';document.body.append(fps);
let fpsFrames=0,fpsSum=0;const clock=new THREE.Clock(),ray=new THREE.Raycaster();
function updatePhysics(dt){
 const dx=stick.x+Number(!!(keys.d||keys.arrowright))-Number(!!(keys.a||keys.arrowleft));
 const dz=stick.y+Number(!!(keys.w||keys.arrowup))-Number(!!(keys.s||keys.arrowdown));
 let moving=Math.hypot(dx,dz)>.12;
 if(moving){const len=Math.max(1,Math.hypot(dx,dz)),strafe=dx/len,forward=dz/len;
  const wx=-strafe*Math.cos(camOrbit)+forward*Math.sin(camOrbit),wz=forward*Math.cos(camOrbit)+strafe*Math.sin(camOrbit);
  const speed=(keys.shift?5.3:3.6)*(energy<15?.7:1)*(sleeping>0?.17:1);
  const px=cat.position.x+wx*speed*dt,pz=cat.position.z+wz*speed*dt;
  if(!isBlocked(px,cat.position.z,cat.position.y,CAT_RADIUS,.7))cat.position.x=px;
  if(!isBlocked(cat.position.x,pz,cat.position.y,CAT_RADIUS,.7))cat.position.z=pz;
  cat.rotation.y=Math.atan2(wx,wz);
 }
 const stair=stairLevel(cat.position.x,cat.position.z);
 if(stair!=null&&velY<=0&&Math.abs(cat.position.y-stair)<.75){cat.position.y=stair;velY=0;grounded=true}
 const prev=cat.position.y;
 velY-=16*dt;cat.position.y+=velY*dt;
 // Floor support uses previous feet position, so swept descents never tunnel
 // through furniture tops or the second-floor slabs.
 let level=groundSupport(cat.position.x,cat.position.z,cat.position.y,prev);
 if(stair!=null&&Math.abs(prev-stair)<.75)level=Math.max(level,stair);
 if(velY<=0&&level>-100&&cat.position.y<=level+.08&&prev>=level-.18){
  cat.position.y=level;velY=0;grounded=true;
 }else grounded=false;
 // The terrain is a permanent safety floor: never fall under ground or teleport home.
 if(cat.position.y<=0){cat.position.y=0;velY=0;grounded=true;}
 animateCat(dt,moving,!!keys.shift);
 return moving;
}
function updatePhysicsProps(dt){for(const it of interactables){if(!it.used||it.action!=='knock')continue;
 it.vy-=12*dt;it.holder.position.x+=it.vx*dt;it.holder.position.z+=it.vz*dt;it.holder.position.y+=it.vy*dt;
 const minY=it.level;if(it.holder.position.y<=minY){it.holder.position.y=minY;it.vy=0;it.vx*=.86;it.vz*=.86;it.holder.rotation.z=THREE.MathUtils.lerp(it.holder.rotation.z,.55,dt*5)}
}}
function updateVisualFx(dt){for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.time-=dt;f.vy-=8*dt;f.mesh.position.x+=f.vx*dt;f.mesh.position.y+=f.vy*dt;f.mesh.position.z+=f.vz*dt;f.mesh.scale.setScalar(Math.max(.01,f.time*2));if(f.time<=0){scene.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();fx.splice(i,1)}}}
function updateCamera(dt){if(editorOn){
 const speed=dt*(keys.shift?25:9),right=new THREE.Vector3(-Math.cos(editCamYaw),0,Math.sin(editCamYaw)),forward=new THREE.Vector3(Math.sin(editCamYaw),0,Math.cos(editCamYaw));
 if(keys.w||keys.arrowup)editCamTarget.addScaledVector(forward,speed);
 if(keys.s||keys.arrowdown)editCamTarget.addScaledVector(forward,-speed);
 if(keys.a||keys.arrowleft)editCamTarget.addScaledVector(right,-speed);
 if(keys.d||keys.arrowright)editCamTarget.addScaledVector(right,speed);
 if(keys.q)editCamTarget.y-=speed;if(keys.e||keys[' '])editCamTarget.y+=speed;
 editCamTarget.y=THREE.MathUtils.clamp(editCamTarget.y,.3,30);
 camera.position.set(editCamTarget.x-Math.sin(editCamYaw)*Math.cos(editCamPitch)*editCamDistance,editCamTarget.y+Math.sin(editCamPitch)*editCamDistance,editCamTarget.z-Math.cos(editCamYaw)*Math.cos(editCamPitch)*editCamDistance);camera.lookAt(editCamTarget);
 if(catModel)catModel.visible=true;fallback.visible=!catModel;return;
 }const distance=viewFirstPerson?.15:4.0,first=cat.position.y<F-1;
 const maxY=first?F-.47:F+3.0,target=new THREE.Vector3(cat.position.x,cat.position.y+(viewFirstPerson?.53:.58),cat.position.z);
 const desired=new THREE.Vector3(cat.position.x-Math.sin(camOrbit)*distance,Math.min(maxY,cat.position.y+(viewFirstPerson?.54:1.4)+distance*Math.sin(camPitch)*.35),cat.position.z-Math.cos(camOrbit)*distance);
 if(!viewFirstPerson){let vector=desired.clone().sub(target),length=vector.length();if(length>.001){ray.set(target,vector.normalize());const hit=ray.intersectObjects(wallMeshes,false).find(h=>h.distance<length);if(hit)desired.copy(target).add(vector.multiplyScalar(Math.max(.65,hit.distance-.17)))}
 }
 camera.position.lerp(desired,Math.min(1,dt*(viewFirstPerson?18:13)));camera.position.y=Math.min(maxY,camera.position.y);
 if(!viewFirstPerson){const vector=camera.position.clone().sub(target),length=vector.length();if(length>.05){ray.set(target,vector.normalize());const hit=ray.intersectObjects(wallMeshes,false).find(h=>h.distance<length);if(hit)camera.position.copy(target).add(vector.multiplyScalar(Math.max(.65,hit.distance-.17)))}}
 if(catModel)catModel.visible=!viewFirstPerson;fallback.visible=!viewFirstPerson&&!catModel;
 if(viewFirstPerson)camera.lookAt(target.x+Math.sin(camOrbit)*4,target.y-.25-camPitch*2,target.z+Math.cos(camOrbit)*4);
 else camera.lookAt(target);
}
function updateRoom(){const upstairs=cat.position.y>F-1.1,left=cat.position.x<0,back=cat.position.z<0;
 const names=upstairs?(left?(back?'Ванная':'Спальня'):(back?'Кабинет':'Игровая')):(left?(back?'Кухня':'Гостиная'):(back?'Столовая':'Холл'));
 HUD.room.textContent=(Math.abs(cat.position.x)>19||cat.position.z>19||cat.position.z<-19)?'🌳 Большая усадьба · '+(Math.round(cat.position.x))+', '+Math.round(cat.position.z):(cat.position.x<-11||cat.position.x>11||cat.position.z<-9||cat.position.z>9)?'🌳 Домашний двор':'🏠 '+(upstairs?'2 этаж · ':'1 этаж · ')+names;
}
const mapCanvas=document.getElementById('mapCanvas'),mapCtx=mapCanvas.getContext('2d');let mapBig=false;
function drawMap(){
 const c=mapCtx,S=c.canvas.width,scale=mapBig?1.9:2.65,px=cat.position.x,pz=cat.position.z;
 c.clearRect(0,0,S,S);c.fillStyle='#9cc780';c.fillRect(0,0,S,S);
 const xx=x=>S/2+(x-px)*scale,zz=z=>S/2+(z-pz)*scale;
 c.fillStyle='#79ac70';c.fillRect(xx(-68),zz(-68),136*scale,136*scale);
 c.strokeStyle='#886d50';c.lineWidth=2;c.strokeRect(xx(-68),zz(-68),136*scale,136*scale);
 c.fillStyle='#cdb99e';for(const b of estateBuildings)c.fillRect(xx(b.x-b.w/2),zz(b.z-b.d/2),b.w*scale,b.d*scale);
 c.fillStyle='#f0d2b9';c.fillRect(xx(-11),zz(-9),22*scale,18*scale);
 const q=quests[questIndex];if(q){const at=questTarget(q),x=xx(at[0]),z=zz(at[1]);c.strokeStyle='#fff';c.lineWidth=2;c.fillStyle='#e15b43';c.beginPath();c.arc(x,z,7,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#fff';c.font='bold 11px system-ui';c.textAlign='center';c.fillText('!',x,z+4)}
 c.save();c.translate(S/2,S/2);c.rotate(-cat.rotation.y);c.fillStyle='#222';c.beginPath();c.moveTo(0,9);c.lineTo(-7,-6);c.lineTo(7,-6);c.closePath();c.fill();c.strokeStyle='white';c.lineWidth=2;c.stroke();c.restore();
}
mapCanvas.parentElement.addEventListener('pointerdown',e=>{e.stopPropagation();mapBig=!mapBig;mapCanvas.parentElement.classList.toggle('large',mapBig)});
function render(){requestAnimationFrame(render);const dt=Math.min(clock.getDelta(),.038);elapsed+=dt;
 if(playing&&furnitureReady&&!editorOn){saveTimer+=dt;if(saveTimer>12){saveTimer=0;saveGame()}
  ownerAI(dt);updatePhysics(dt);updatePhysicsProps(dt);updateVisualFx(dt);
  if(sleeping>0){sleeping-=dt;energy=Math.min(100,energy+dt*10)}else{hunger=Math.max(0,hunger-dt*.18);energy=Math.max(0,energy-dt*.10)}
  mood=THREE.MathUtils.clamp(mood+dt*(hunger>25&&energy>20?.12:-.45),0,100);
  updateQuest();setProgress();updateRoom();
 }
 if(elapsed>messageUntil)HUD.message.style.opacity='0';
 for(const roof of roofPieces){
  const focus=editorOn?editCamTarget:cat.position;
  const distance=Math.hypot(focus.x-roof.x,focus.z-roof.z);
  roof.mesh.visible=distance>(editorOn?12:10)||(!editorOn&&cat.position.y>2.5);
 }
 if(Math.floor(elapsed*7)!==Math.floor((elapsed-dt)*7))drawMap();
 if(editHelper&&editSelected)editHelper.update();updateCamera(dt);renderer.render(scene,camera);if(editorOn&&previewObject){previewObject.rotation.y+=dt*.42;previewRenderer.render(previewScene,previewCamera)}
 fpsFrames++;fpsSum+=dt;if(fpsSum>.8){fps.textContent='⚡ '+Math.round(fpsFrames/fpsSum)+' FPS';fpsSum=0;fpsFrames=0}
}
render();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
