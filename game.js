import * as THREE from 'three';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/loaders/GLTFLoader.js';

// BAD CAT 3D v1.7: the only collision sources are architectural walls and the
// furniture models actually loaded into the scene. Old invisible furniture is gone.
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
const editablePieces=new Map();
const EDIT_SAVE_KEY='badcat3d-furniture-layout-v18';
let storedLayout={};try{storedLayout=JSON.parse(localStorage.getItem(EDIT_SAVE_KEY)||'{}')||{}}catch(e){storedLayout={}}
function registerEditable(id,piece,description){
 piece.editId=id;piece.description=description;editablePieces.set(id,piece);
 const saved=storedLayout[id];if(saved&&Array.isArray(saved.pos)&&saved.pos.length===3){
  piece.holder.position.set(...saved.pos);piece.holder.rotation.y=saved.rot||0;
  if(saved.hidden){piece.holder.visible=false;piece.removed=true;}
  refreshEditBounds(piece);
 }
}
function refreshEditBounds(piece){
 piece.holder.updateMatrixWorld(true);
 const bb=new THREE.Box3().setFromObject(piece.holder);piece.bounds=bb;
 if(piece.collider){const b=piece.collider;const inset=Math.min(.06,(bb.max.x-bb.min.x)*.12,(bb.max.z-bb.min.z)*.12);
  b.x1=bb.min.x+inset;b.x2=bb.max.x-inset;b.z1=bb.min.z+inset;b.z2=bb.max.z-inset;
  b.y1=bb.min.y;b.y2=Math.min(bb.max.y,Math.max(bb.min.y+.1,piece.holder.position.y+1.8));
  if(piece.removed){b.y1=999;b.y2=1000;}
 }
 if(piece.surface){piece.surface.x1=bb.min.x;piece.surface.x2=bb.max.x;piece.surface.z1=bb.min.z;piece.surface.z2=bb.max.z;piece.surface.y=Math.min(bb.max.y,piece.holder.position.y+piece.seatHeight);}
}
function saveFurniture(){const all={};for(const [id,p] of editablePieces){all[id]={pos:[p.holder.position.x,p.holder.position.y,p.holder.position.z],rot:p.holder.rotation.y,hidden:!!p.removed};}localStorage.setItem(EDIT_SAVE_KEY,JSON.stringify(all));}

const F=3.55, CAT_RADIUS=.30, HUMAN_RADIUS=.35;
function addBox(w,h,d,mat,x,y,z,{wall=false,top=false}={}){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);house.add(mesh);
 if(wall){colliders.push({x1:x-w/2,x2:x+w/2,z1:z-d/2,z2:z+d/2,y1:y-h/2,y2:y+h/2,source:'wall'});wallMeshes.push(mesh)}
 if(top)walkableSurfaces.push({x1:x-w/2,x2:x+w/2,z1:z-d/2,z2:z+d/2,y:y+h/2});
 return mesh;
}
function ball(r,mat,x,y,z,parent,sx=1,sy=1,sz=1){const m=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m}
function column(a,b,h,mat,x,y,z,parent){const m=new THREE.Mesh(new THREE.CylinderGeometry(a,b,h,10),mat);m.position.set(x,y,z);parent.add(m);return m}
// Architectural floor plan: x<0 is kitchen/living, x>0 dining/hall.
// Doorway gaps deliberately remain at x=0 around z=0 and z=0 around x=-.4 and x=7.
addBox(22,.28,18,mats.floor,0,-.14,0,{top:true});
addBox(16,.25,18,mats.floor,-3,F-.125,0,{top:true});
addBox(6,.25,10,mats.floor,8,F-.125,-4,{top:true}); // open stairwell upstairs
for(const h0 of [0,F]){
 addBox(22,2.7,.24,mats.wall,0,h0+1.35,-9,{wall:true});
 addBox(.24,2.7,18,mats.wall,-11,h0+1.35,0,{wall:true});
 addBox(.24,2.7,18,mats.wall,11,h0+1.35,0,{wall:true});
 if(h0===0){
   addBox(12.2,2.7,.22,mats.wall,-5.05,1.35,9,{wall:true});
   addBox(5.1,2.7,.22,mats.wall,8.45,1.35,9,{wall:true});
   addBox(3.05,.24,.22,mats.wall,2.45,2.58,9,{wall:true});
   addBox(1.42,2.22,.07,glassMat,-7.1,1.62,9.12);
   addBox(1.42,2.22,.07,glassMat,7.55,1.62,9.12);
 } else {
   addBox(22,2.7,.22,mats.wall,0,h0+1.35,9,{wall:true});
   addBox(2.2,1.4,.07,glassMat,-6.8,h0+1.55,9.12);
   addBox(2.2,1.4,.07,glassMat,6.8,h0+1.55,9.12);
 }
 function wallX(z1,z2){addBox(.18,2.7,z2-z1,mats.divider,0,h0+1.35,(z1+z2)/2,{wall:true})}
 function wallZ(x1,x2){addBox(x2-x1,2.7,.18,mats.divider,(x1+x2)/2,h0+1.35,0,{wall:true})}
 wallX(-9,-1.4);wallX(1.2,9);wallZ(-11,-2.2);wallZ(1.5,5.8);wallZ(8.2,11);
}
// Finalise the player's house: glazed entrance, extra side windows and a proper roof.
for(const side of [-1,1]){
 addBox(1.08,1.42,.07,glassMat,side*10.88,1.62,5.6);
 addBox(1.08,1.42,.07,glassMat,side*10.88,1.62,-4.8);
 addBox(1.08,1.30,.07,glassMat,side*10.88,F+1.55,5.8);
}
for(const sx of [1.73,3.17]){addBox(1.28,2.15,.05,glassMat,sx,1.46,9.11);addBox(.08,2.25,.09,mats.trim,sx-.64,1.47,9.10);addBox(.08,2.25,.09,mats.trim,sx+.64,1.47,9.10)}
addBox(2.7,.10,.20,mats.trim,2.45,2.47,9.08);
for(const sign of [-1,1]){const slab=addBox(23.2,.21,10.8,mats.roof,0,F*2+.22,sign*4.55);slab.rotation.x=sign*.17;roofPieces.push({mesh:slab,x:0,z:0})}
addBox(22.4,.16,.42,mats.trim,0,F*2.08,-.1);
addBox(22.4,.16,.42,mats.trim,0,F*2.08,8.9);
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
addBox(36,.12,34,grass,0,-.19,1,{top:true});
function outdoorsBox(w,h,d,mat,x,y,z,{solid=false,top=false}={}){return addBox(w,h,d,mat,x,y,z,{wall:solid,top})}
// Front porch and entrance: centered at x=2.7, z=9, unobstructed corridor through to lawn.
outdoorsBox(2.9,.035,8.6,pathMat,2.7,-.005,13.4);
for(let z=10.1;z<17.7;z+=1.5)outdoorsBox(.1,.038,2.85,material('#b2a084'),2.7,.019,z);
outdoorsBox(6.4,.032,1.55,pathMat,0,0,16.55);
// Curving-feel paths at both sides, kept well outside the house footprint.
for(let z=-13;z<=13;z+=2.1){outdoorsBox(1.18,.025,1.85,pathMat,-13.3,-.001,z);outdoorsBox(1.18,.025,1.85,pathMat,13.45,-.001,z)}
outdoorsBox(27,.02,1.4,pathMat,0,-.01,-12.6);
// Perimeter fence; front gate at x=2.7. All sections have matching actual colliders.
function fenceX(a,b,z){for(let x=a+.42;x<b;x+=1.4){outdoorsBox(.18,1.35,.2,fenceMat,x,.68,z,{solid:true});}outdoorsBox(b-a,.14,.16,fenceMat,(a+b)/2,.94,z,{solid:true});outdoorsBox(b-a,.14,.16,fenceMat,(a+b)/2,.33,z,{solid:true})}
function fenceZ(a,b,x){for(let z=a+.42;z<b;z+=1.4)outdoorsBox(.2,1.35,.18,fenceMat,x,.68,z,{solid:true});outdoorsBox(.16,.14,b-a,fenceMat,x,.94,(a+b)/2,{solid:true});outdoorsBox(.16,.14,b-a,fenceMat,x,.33,(a+b)/2,{solid:true})}
fenceX(-18,1.4,18);fenceX(4.0,18,18);fenceX(-18,18,-16);fenceZ(-16,18,-18);fenceZ(-16,18,18);
// Keep the entrance to the street visually marked, but the small yard stays bounded.
outdoorsBox(.15,1.2,.55,fenceMat,1.4,.6,18,{solid:true});outdoorsBox(.15,1.2,.55,fenceMat,4,.6,18,{solid:true});
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
const quests=[
 {text:'ВЫРВИСЬ ИЗ ДОМА — пройди через ворота (+Z)',at:[2.7,21],done:()=>cat.position.z>20.0},
 {text:'РАЗГРОМ СОСЕДЕЙ — опрокинь уличный горшок (E)',at:[45.5,48],done:()=>streetKnocks>=1},
 {text:'РЫБНЫЙ НАЛЁТ — укради рыбу с рынка (G)',at:[0,43],done:()=>marketFood},
 {text:'КОШАЧИЙ КЛАД — раскопай тайник под дубом (X)',at:[-40,41],done:()=>dugTreasure},
 {text:'ЗАКОПАЙ УЛИКИ — спрячь рыбу в парке (X)',at:[-1,-42],done:()=>buriedFish},
 {text:'КОГТИ ПРАВОСУДИЯ — поцарапай лавку в парке (F)',at:[3,-45],done:()=>parkScratched},
 {text:'ЗАГЛЯНИ В МАГАЗИН — купи молоко за 5 рыбок (G)',at:[0,79],done:()=>boughtMilk},
 {text:'ТИХИЙ ЧАС — поспи в чужой спальне (H)',at:[36.2,36.2],done:()=>neighborSlept},
 {text:'УЛИЧНЫЙ ХУЛИГАН — опрокинь 3 предмета (E)',at:[78,38],done:()=>streetKnocks>=3},
 {text:'СПАСИ ГНОМА — найди пропавшего гнома (X)',at:[77,-41],done:()=>gnomeSaved},
 {text:'СПА-КОТИК — искупайся в фонтане (X)',at:[0,-73],done:()=>bathed},
 {text:'КОСТЬ ПРИЗРАКА — раскопай древнюю кость (X)',at:[-78,78],done:()=>dugBone},
 {text:'ТАЙНАЯ ОПЕРАЦИЯ — закопай кость (X)',at:[78,78],done:()=>buriedBone}
];
function updateQuest(){while(questIndex<quests.length&&quests[questIndex].done()){questIndex++;score+=7;energy=Math.min(100,energy+5);toast('🏆 Миссия пройдена! +7 рыбок')}
 const q=quests[questIndex];HUD.quest.textContent=q?`${questIndex+1}/${quests.length} · ${q.text}`:'🏆 ВСЕ 13 МИССИЙ ВЫПОЛНЕНЫ!';
 const t=document.getElementById('questDistance');if(t)t.textContent=q?`📍 ${Math.round(Math.hypot(cat.position.x-q.at[0],cat.position.z-q.at[1]))} м до цели`:'🎉 Кошачья легенда района';
}
function floorOf(y){return y>F-1.1?F:0}
function isBlocked(x,z,feet,r=CAT_RADIUS,height=.70,sourceFilter=null){
 if(x<-107+r||x>107-r||z<-107+r||z>107-r)return true;
 for(const b of colliders){if(sourceFilter&&!sourceFilter(b))continue;
  if(feet+.07<b.y2&&feet+height>b.y1 && x+r>b.x1&&x-r<b.x2&&z+r>b.z1&&z-r<b.z2)return true;
 }
 return false;
}
function groundSupport(x,z,feet,prev){let best=-999;
 for(const s of walkableSurfaces){if(x+CAT_RADIUS*.38<=s.x1||x-CAT_RADIUS*.38>=s.x2||z+CAT_RADIUS*.38<=s.z1||z-CAT_RADIUS*.38>=s.z2)continue;
  if(s.y<=prev+.31&&s.y>best)best=s.y;
 }return best;
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
}).catch(e=>{console.error('Ошибка загрузки котика',e);toast('⚠️ Котик не загрузился — проверь папку assets')});
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
 if(chase&&groundCat&&d<.83){score=Math.max(0,score-3);alertness=0;cat.position.set(-1.8,0,5.2);velY=0;toast('😾 Хозяин поймал! −3 🐟');sound('alert');ownerPath=[]}
 if(alertness>25&&d>6)escaped=true;
}
// ------------------------------------------------------------------
// Kenney model placement. All positions are authored for THIS layout;
// small countertop props use the surface height of the piece below them.
const layout=[
 // Keep only the specialised appliances/fixtures from Kenney; all major furniture comes from the Tiny Living pack.
 ['kitchenFridgeLarge',-9.50,-7.30,0,1.18,.92,2.14,0,'solid',''],
 ['kitchenSink',-9.48,-5.05,0,1.00,1.02,1.06,0,'solid',''],
 ['kitchenStove',-9.48,-2.95,0,1.00,1.02,1.06,0,'solid','scratch'],
 ['kitchenCabinet',-7.82,-7.55,0,1.02,1.04,1.06,0,'solid','scratch'],
 ['kitchenCabinet',-6.20,-7.55,0,1.02,1.04,1.06,0,'solid','scratch'],
 ['kitchenMicrowave',-7.82,-7.55,1.06,.64,.54,.40,0,'prop','knock'],
 ['kitchenCoffeeMachine',-6.20,-7.55,1.06,.42,.54,.52,0,'prop','knock'],
 ['bathroomMirror',-10.55,-3.60,F+1.36,.75,.15,1.08,Math.PI/2,'decor',''],
 ['rugDoormat',2.55,10.7,0,2.35,1.45,.03,0,'rug',''],
 ['rugRectangle',-6.55,4.9,0,5.1,3.6,.03,0,'rug',''],
 ['rugRounded',-6.55,4.8,F,4.4,4.0,.03,0,'rug',''],
 ['rugSquare',-5.4,-4.6,F,1.9,1.9,.03,0,'rug',''],
 ['rugRectangle',5.0,-5.25,F,4.2,3.0,.03,0,'rug',''],
 ['rugRound',3.0,5.1,F,3.0,3.0,.03,0,'rug','']
];
;
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
 if(Math.min(size.x,size.y,size.z)<1e-6) throw Error('Tiny zero size: '+name);
 const scale=Math.min(w/size.x,dpt/size.z,h/size.y);
 obj.position.set(-center.x,-raw.min.y,-center.z);
 const align=new THREE.Group(); align.add(obj); align.scale.setScalar(scale);
 const holder=new THREE.Group(); holder.position.set(x,floor,z); holder.rotation.y=yaw; holder.add(align); house.add(holder); holder.updateMatrixWorld(true);
 const bb=new THREE.Box3().setFromObject(holder);
 const piece={model:name.replace(/^TinyLiving_|^TinytLiving_/,'').replace(/_[0-9]+$/,''),holder,kind:'tiny',action,level:floor,floorY:floor,bounds:bb,height:bb.max.y-bb.min.y,used:false,vy:0,vx:0,vz:0,collider:null};
 if(solid){const inset=Math.min(.08,(bb.max.x-bb.min.x)*.12,(bb.max.z-bb.min.z)*.12); const b={x1:bb.min.x+inset,x2:bb.max.x-inset,z1:bb.min.z+inset,z2:bb.max.z-inset,y1:Math.max(floor,bb.min.y),y2:Math.min(bb.max.y,floor+1.8),source:'tiny'}; if(b.x1<b.x2&&b.z1<b.z2){colliders.push(b); addDebugBox(b); piece.collider=b;}}
 if(action)interactables.push(piece); loaded++;registerEditable(id,piece,'Tiny Living · '+piece.model);
 return piece;
}
const tinyMainLayout=[
 ['TinyLiving_ContemporaryCarpet_40',-4.7,4.3,0,2.2,1.6,.03,0,'rug','',false],
 ['TinyLiving_TheModernDeskLamp_23',-9.48,7.03,.53,.35,.35,.48,0,'prop','knock',false],
 ['TinyLiving_BotanicalBookends_5',-6.1,-7.98,1.10,.46,.23,.39,0,'prop','tear',false],
 ['TinyLiving_SimpleandCleanArt_39',-8.2,8.92,0,1.25,.15,.83,0,'decor','',false],
 ['TinyLiving_DonTrippLightFixture_19',-5.1,-4.0,2.25,.75,.75,.48,0,'decor','',false],
 ['TinyLiving_ModernPouffe_36',-3.25,4.8,F,.65,.65,.55,0,'chair','scratch',true],
 ['TinyLiving_JustALittlePeek_18',-6.9,8.95,F,1.25,.20,.9,0,'decor','',false],
 ['TinyLiving_TheModernDeskLamp_23',2.35,-7.65,F+.62,.33,.33,.48,0,'prop','knock',false]
];
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

// ─── OPEN NEIGHBORHOOD ─────────────────────────────────────────────
// Sixteen explorable, furnished bungalow shells in four blocks, with roads,
// alleys, gardens, parks and a market. The original house stays intact.
const oldDistrictColliderCount=colliders.length;
const districtRoad=material('#555f68'),laneLine=material('#f6e8b8'),districtGrass=material('#80b968');
const houseTones=['#e8c9ae','#d1dfec','#f0d6d9','#e7d9b3','#c6e0cf','#e2d3ef'];
const trimMat=material('#fff3df'),windowMat=new THREE.MeshStandardMaterial({color:'#98c8df',metalness:.2,roughness:.2});
const homeCenters=[];
addBox(214,.18,214,districtGrass,0,-.15,0,{top:true});
// Roads start outside the original garden. Width leaves a walkable pavement.
for(const x of [-59,-21,21,59]){outdoorsBox(7,.028,214,districtRoad,x,-.047,0);
 for(let z=-100;z<103;z+=10)outdoorsBox(.13,.031,4.0,laneLine,x,-.025,z);}
for(const z of [-59,-21,21,59]){outdoorsBox(214,.028,7,districtRoad,0,-.046,z);
 for(let x=-100;x<103;x+=10)outdoorsBox(4,.031,.12,laneLine,x,-.024,z);}
// Exit and inviting walkway from front gate across the first road.
outdoorsBox(2.1,.032,5,pathMat,2.7,-.008,20.5);
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
function housePrefab(x,z,id){
 const tint=material(houseTones[id%houseTones.length]),roof=material(id%2?'#9b6268':'#887581'),floor=material('#d7b78b');
 const W=14,D=13,H=3.2,side=W/2,deep=D/2;
 homeCenters.push([x,z]);
 addBox(W,.23,D,floor,x,-.13,z,{top:true});
 // Three exterior walls and a fourth with an actual 2.7m doorway.
 addBox(W,H,.23,tint,x,H/2,z-deep,{wall:true});
 addBox(.23,H,D,tint,x-side,H/2,z,{wall:true});
 addBox(.23,H,D,tint,x+side,H/2,z,{wall:true});
 addBox((W-2.8)/2,H,.23,tint,x-(W+2.8)/4,H/2,z+deep,{wall:true});
 addBox((W-2.8)/2,H,.23,tint,x+(W+2.8)/4,H/2,z+deep,{wall:true});
 addBox(2.8,.55,.23,tint,x,H-.275,z+deep,{wall:true});
 // Windows, glazed door and bright trims.
 addBox(1.7,1.2,.025,windowMat,x-4,1.75,z+deep+.14);
 addBox(1.7,1.2,.025,windowMat,x+4,1.75,z+deep+.14);
 addBox(1.25,1.1,.025,windowMat,x-5.9,1.7,z-deep-.14);
 addBox(1.25,1.1,.025,windowMat,x+5.9,1.7,z-deep-.14);
 addBox(.18,2.55,.20,trimMat,x-1.49,1.27,z+deep+.15);
 addBox(.18,2.55,.20,trimMat,x+1.49,1.27,z+deep+.15);
 addBox(2.7,.10,.18,trimMat,x,2.48,z+deep+.15);
 for(const dx of [-.67,.67]){addBox(1.22,2.05,.05,windowMat,x+dx,1.42,z+deep+.12);}
 // Raised roof made from two sloping slabs, visible but roofs fade near player.
 for(const sign of [-1,1]){const slab=addBox(W+1,.19,D/2+1,roof,x,H+.6,z+sign*3.2);slab.rotation.x=sign*.17;roofPieces.push({mesh:slab,x,z})}
 // Tiny Living furniture is injected later for every neighbour home.
 // Garden behind house, lamp post and flowerpot at a side of the doorway.
 streetThing('Цветочный горшок соседа',x+5.5,z+8.0,'knock',{shape:'plant',solid:true});
 if(id%3===0)streetThing('Коробка у крыльца',x-4.5,z+8.3,'knock',{solid:true,color:'#c5a078'});
 if(id%4===0)streetThing('Соседская лавка',x+9,z,'scratch',{shape:'bench',solid:true});
 // Side tree canopy is light and trunk physically solid.
 const trunk=material('#956745'),leaves=material(id%3===0?'#5caa6d':'#74b86a');
 const tx=x-9,tz=z-8;
 column(.28,.33,2.7,trunk,tx,1.35,tz,house);
 ball(1.95,leaves,tx,3.3,tz,house,1.1,.92,1.0);streetCollider(tx,tz,.65,.65,2.35);
 if(id%2===0){ball(1.20,leaves,x+9,1.1,z+9,house,1,.8,1);streetCollider(x+9,z+9,1.1,1.1,1.6);}
}
let houseId=0;for(const x of [-78,-40,40,78])for(const z of [-78,-40,40,78])housePrefab(x,z,houseId++);
const tinyNeighborhoodLayout=homeCenters.flatMap(([x,z],i)=>neighborTinyLayoutFor(x,z,i));
// Civic places; each is a real landmark on the minimap.
streetThing('Парковая лавка',3,-45,'scratch',{shape:'bench',solid:true});
for(const [x,z] of [[-6,-47],[6,-47],[-5,-35],[6,-34],[12,39],[-10,44],[8,82]])streetThing('Горшок с цветами',x,z,'knock',{shape:'plant',solid:true});
for(const [x,z] of [[-9,-34],[9,-39],[-9,76],[9,76],[-6,42],[8,43]]){
 column(.24,.30,2.7,material('#86603c'),x,1.35,z,house);ball(1.85,material('#56a45c'),x,3.35,z,house);streetCollider(x,z,.6,.6,2.2);
}
// Market + corner shop furniture, but open on all sides.
addBox(5,.20,2.2,material('#a16d47'),0,.65,43);streetCollider(0,43,5,2.2,.7);
for(const x of [-2,0,2])ball(.34,material('#dd9a68'),x,1.05,43,house);
addBox(5,.18,2.4,material('#e3aa69'),0,.67,79);streetCollider(0,79,5,2.4,.7);
addBox(5,.18,3.0,material('#f8e2bd'),0,2.4,79);
// Shallow splashing fountain is a safe interactive swimming spot.
column(2.6,2.6,.32,material('#d7d2cb'),0,.04,-73,house);
column(2.2,2.2,.06,material('#70bfd9'),0,.23,-73,house);
column(.20,.32,1.1,material('#e9e5da'),0,.71,-73,house);
streetThing('Заблудившийся гном',77,-41,'none',{shape:'gnome'});
// Buried markers: visual mounds and quest sparkles.
for(const [x,z] of [[-40,41],[-1,-42],[-78,78],[78,78]]){
 const mound=new THREE.Mesh(new THREE.SphereGeometry(.53,12,8),soilMat);mound.position.set(x,.05,z);mound.scale.y=.21;house.add(mound);
}
// Debug overlays must represent the newly built house walls as well.
for(const c of colliders.slice(oldDistrictColliderCount))if(c.source==='wall')addDebugBox(c);
// Boundary hedges: no invisible blocking away from the visible playable rim.
for(let k=-104;k<=104;k+=8){for(const v of [-106,106]){
 ball(1.9,material('#578c58'),k,.8,v,house,1.1,.75,.95);
 ball(1.9,material('#578c58'),v,.8,k,house,.95,.75,1.1);
 }}

const stage=document.createElement('div');stage.style.cssText='position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:10;background:#fff9eedd;color:#47374a;border-radius:12px;padding:7px 12px;font:700 12px system-ui;pointer-events:none';
stage.textContent='🏠 Загружаем Tiny Living мебель, двор и район...' ;document.body.append(stage);
let loaded=0,failed=0;
async function place(d,id){const [model,x,z,floor,w,dpt,h,yaw,kind,action]=d;
 const result=await getModel(model);const obj=result.scene.clone(true);obj.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(obj),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 if(size.x<.00001||size.y<.00001||size.z<.00001)throw Error('Bad dimensions '+model);
 const scale=Math.min(w/size.x,dpt/size.z,h/size.y);
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
  if(seat!=null){blockTop=Math.min(blockTop,seat);furniturePiece.seatHeight=blockTop-floor;furniturePiece.surface={x1:bb.min.x,x2:bb.max.x,z1:bb.min.z,z2:bb.max.z,y:blockTop};walkableSurfaces.push(furniturePiece.surface)}
  const box={x1:bb.min.x+.02,x2:bb.max.x-.02,z1:bb.min.z+.02,z2:bb.max.z-.02,y1:bb.min.y,y2:blockTop,source:'furniture'};
  colliders.push(box);addDebugBox(box);furniturePiece.collider=box;
 }
 if(action)interactables.push(furniturePiece);
 loaded++;registerEditable(id,furniturePiece,'Kenney · '+model);
}
// Imported garden: models are deliberately positioned beyond the house footprint.
// tuple: pack, file, display name, x, z, max width, max depth, max height, angle, action, solid
const gardenLayout=[
 ['patio','gazebo','Беседка',-8.0,13.7,4.0,3.8,3.1,0,'scratch',true],
 ['patio','patio_sofa','Уличный диван',-9.1,14.7,2.1,.9,1.05,Math.PI,'scratch',true],
 ['patio','coffee_table_wicker','Плетёный столик',-7.0,14.0,1.0,.8,.65,0,'knock',true],
 ['patio','wicker_armchair','Плетёное кресло',-6.4,15.55,.85,.85,1.15,-.45,'scratch',true],
 ['patio','patio_umbrella','Садовый зонт',8.5,14.7,2.6,2.6,3.0,0,'knock',false],
 ['patio','dining_table_6','Уличный обеденный стол',8.5,13.6,2.5,1.6,1.45,0,'scratch',true],
 ['patio','adirondack_chair','Садовое кресло',5.9,15.7,.9,1.0,1.2,.3,'scratch',true],
 ['patio','garden_bench','Лавочка',-5.4,-13.4,2.1,.8,1.3,0,'scratch',true],
 ['patio','bbq_grill','Мангал',9.5,-12.1,1.25,1.0,1.45,0,'knock',true],
 ['patio','picnic_table','Стол для пикника',6.6,-13.5,2.45,1.65,1.1,0,'scratch',true],
 ['patio','hammock_stand','Гамак',-8.2,-13.25,3.5,1.5,1.65,.2,'scratch',true],
 ['patio','planter_box','Цветочная клумба',-3.3,15.9,1.4,.7,.8,0,'knock',true],
 ['patio','raised_bed','Грядка',-13.35,-8.9,1.7,1.3,.75,0,'tear',true],
 ['patio','garden_gnome','Садовый гном',-11.2,13.3,.48,.43,.75,0,'knock',false],
 ['patio','mailbox_post','Почтовый ящик',4.8,16.3,.68,.6,1.55,0,'knock',true],
 ['patio','bird_bath','Поилка для птиц',11.7,15.9,.78,.78,1.3,0,'knock',true],
 ['patio','garden_lantern','Фонарь',-4.8,16.3,.46,.46,1.25,0,'knock',false],
 ['market','03_Plant_Shelf','Полка с растениями',-12.7,13.6,1.3,.65,1.75,Math.PI/2,'scratch',true],
 ['market','09_Flower_Pot','Цветочный горшок',-3.45,11.2,.53,.53,.8,0,'knock',false],
 ['market','08_Herb_Pot','Горшок с травами',-5.0,11.3,.46,.46,.65,0,'knock',false],
 ['market','07_Terracotta_Pot','Глиняный горшок',11.3,11.1,.55,.55,.64,0,'knock',false],
 ['market','11_Apple_Crate','Ящик с яблоками',-12.0,11.2,.85,.73,.72,0,'tear',true],
 ['market','10_Empty_Crate','Деревянный ящик',-12.0,10.0,.82,.71,.7,0,'tear',true],
 ['market','12_Watering_Can','Лейка',-11.0,15.2,.5,.36,.5,0,'knock',false],
 ['market','15_Wheelbarrow','Тачка',-13.2,-12.5,1.25,2.0,1.2,.45,'knock',true],
 ['market','16_Herb_Planter','Огородный ящик',-15.1,-7.2,1.4,.8,.75,0,'tear',true],
 ['market','18_Wood_Barrel','Бочка',12.6,-12.0,.85,.85,1.13,0,'knock',true],
 ['market','19_Seedling_Tray','Рассада',-14.1,-5.8,.95,.6,.4,0,'tear',false],
 ['market','20_Garden_Lantern','Фонарик',13.0,15.5,.46,.46,.85,0,'knock',false],
 ['nature','tree_oak','Дуб',-15.5,13.0,3.3,3.3,4.6,0,'',false],
 ['nature','tree_default','Дерево',15.35,12.8,3.0,3.0,4.6,.4,'',false],
 ['nature','tree_simple','Дерево',-15.0,-12.5,2.9,2.9,4.3,0,'',false],
 ['nature','tree_oak','Дуб',15.3,-12.6,3.3,3.3,4.6,.5,'',false],
 ['nature','tree_pineRoundA','Сосна',-15.5,1.0,2.6,2.6,4.4,0,'',false],
 ['nature','tree_default','Дерево',15.3,-3.0,3.1,3.1,4.5,0,'',false],
 ['nature','tree_small','Деревце',-7.1,-13.8,1.4,1.4,2.1,0,'',false],
 ['nature','tree_pineSmallC','Сосна',4.4,-14.2,1.45,1.45,2.2,0,'',false],
 ['nature','plant_bushLarge','Куст',-13.4,4.7,1.5,1.25,1.1,0,'',false],
 ['nature','plant_bush','Куст',13.8,5.1,1.3,1.15,.95,0,'',false],
 ['nature','plant_bushDetailed','Куст',-10.1,-13.5,1.15,1.05,1.1,0,'',false],
 ['nature','plant_bushSmall','Куст',12.8,-14.0,.75,.7,.65,0,'',false],
 ['nature','rock_largeA','Камень',-15.3,7.1,1.1,1.0,.7,0,'',true],
 ['nature','rock_smallA','Камень',13.6,10.1,.6,.6,.45,0,'',false],
 ['nature','flower_yellowA','Цветы',-4.3,12.1,.4,.4,.5,0,'',false],
 ['nature','flower_redB','Цветы',-5.0,12.2,.4,.4,.5,0,'',false],
 ['nature','flower_purpleA','Цветы',-5.7,12.2,.4,.4,.5,0,'',false],
 ['nature','grass_large','Трава',-13.7,7.4,.75,.6,.48,0,'',false],
 ['nature','plant_flatTall','Высокая трава',15.5,8.2,.5,.5,1.0,0,'',false],
];
const gardenCache=new Map();let yardLoaded=0;
function getGardenModel(pack,name){const key=pack+'_'+name;if(!gardenCache.has(key))gardenCache.set(key,loader.loadAsync(ALL_CATALOG[pack+':'+name]||'./assets/outdoor/'+key+'.glb'));return gardenCache.get(key)}
async function placeGarden(entry,id){const [pack,name,label,x,z,w,d,h,yaw,action,solid]=entry;
 const result=await getGardenModel(pack,name),obj=result.scene.clone(true);
 obj.updateMatrixWorld(true);const raw=new THREE.Box3().setFromObject(obj),size=raw.getSize(new THREE.Vector3()),center=raw.getCenter(new THREE.Vector3());
 if(Math.min(size.x,size.y,size.z)<.000001)throw Error('Нулевая модель: '+pack+' '+name);
 const scale=Math.min(w/size.x,d/size.z,h/size.y);obj.position.set(-center.x,-raw.min.y,-center.z);
 const aligned=new THREE.Group();aligned.add(obj);aligned.scale.setScalar(scale);
 const holder=new THREE.Group();holder.position.set(x,0,z);holder.rotation.y=yaw;holder.add(aligned);house.add(holder);holder.updateMatrixWorld(true);
 const bb=new THREE.Box3().setFromObject(holder);
 const piece={model:label,holder,kind:'yard',action,level:0,floorY:0,bounds:bb,height:bb.max.y-bb.min.y,used:false,vy:0,vx:0,vz:0,collider:null};
 if(solid){const inset=Math.min(.09,(bb.max.x-bb.min.x)*.1,(bb.max.z-bb.min.z)*.1);const b={x1:bb.min.x+inset,x2:bb.max.x-inset,z1:bb.min.z+inset,z2:bb.max.z-inset,y1:Math.max(0,bb.min.y),y2:Math.min(bb.max.y,1.4),source:'garden'};if(b.x1<b.x2&&b.z1<b.z2){colliders.push(b);addDebugBox(b);piece.collider=b;}}
 // Nature trees only obstruct close to their trunks, not the entire canopy.
 if(pack==='nature'&&name.startsWith('tree_')){const r=.28;const b={x1:x-r,x2:x+r,z1:z-r,z2:z+r,y1:0,y2:1.8,source:'tree'};colliders.push(b);addDebugBox(b)}
 if(action)interactables.push(piece);yardLoaded++;registerEditable(id,piece,'Сад · '+label);
}

// In-browser layout editor: choose furniture, drag on the floor plane, rotate and save.
const editorPanel=document.createElement('section');editorPanel.id='furnitureEditor';
editorPanel.innerHTML=`<header>🛠️ Редактор мира <button id="edToggle">Закрыть</button></header>
 <div class="edSmall">🖱️ ЛКМ по предмету — выбрать/перетащить. ПКМ — вращать камеру. Средняя кнопка — двигать камеру. Колесо — приближать. WASD — перемещать камеру, Q/E — вниз/вверх, Shift — быстрее. На телефоне: режим «Камера» для свайпа и два пальца для зума.</div>
 <div class="edLine"><button id="edCameraMode">📷 Камера</button><button id="edFocus">🎯 К предмету</button><button id="edTop">⬇ Вид сверху</button></div>
 <div id="edSelected">Предмет не выбран</div>
 <div class="edLine"><button id="edLeft">←</button><button id="edForward">↑</button><button id="edBack">↓</button><button id="edRight">→</button><button id="edRotL">↶</button><button id="edRotR">↷</button></div>
 <div class="edLine"><button id="edUp">Этаж ↑</button><button id="edDown">Этаж ↓</button><button id="edRemove">Убрать</button></div>
 <label for="edPack">Набор:</label><select id="edPack"></select>
 <label for="edCatalog">Модель:</label><input id="edSearch" placeholder="🔎 Найти модель" style="width:100%;padding:9px;margin-top:5px;border-radius:8px"><select id="edCatalog" size="6" style="height:155px"></select>
 <div id="edPreviewStatus" class="edSmall">Выбери модель — увидишь её перед размещением.</div>
 <canvas id="edPreview" width="300" height="200" style="width:100%;height:190px;border-radius:12px;background:#dce9eb;touch-action:none"></canvas>
 <div class="edLine"><button id="edAdd">＋ Добавить выбранное</button><button id="edSave">💾 Сохранить</button></div>
 <div class="edLine"><button id="edExport">⬇ Экспорт JSON</button><label class="edImport">⬆ Импорт JSON<input type="file" id="edImportFile" accept=".json,application/json" hidden></label></div>
 <div class="edLine"><button id="edReset">↺ Сбросить мебель</button></div>
 <div class="edSmall">Все перемещения сохраняются в браузере. Экспортируй JSON и пришли мне: я перенесу твою расстановку в исходный код игры.</div>`;
document.body.append(editorPanel);
const editorButton=document.createElement('button');editorButton.id='editorButton';editorButton.textContent='🛠️ Мебель';document.body.append(editorButton);
const ALL_CATALOG={"kenney:bathroomCabinet":"./assets/kenney/bathroomCabinet.glb","kenney:bathroomCabinetDrawer":"./assets/catalog/kenney_bathroomCabinetDrawer.glb","kenney:bathroomMirror":"./assets/kenney/bathroomMirror.glb","kenney:bathroomSink":"./assets/kenney/bathroomSink.glb","kenney:bathroomSinkSquare":"./assets/catalog/kenney_bathroomSinkSquare.glb","kenney:bathtub":"./assets/kenney/bathtub.glb","kenney:bear":"./assets/kenney/bear.glb","kenney:bedBunk":"./assets/catalog/kenney_bedBunk.glb","kenney:bedDouble":"./assets/kenney/bedDouble.glb","kenney:bedSingle":"./assets/catalog/kenney_bedSingle.glb","kenney:bench":"./assets/catalog/kenney_bench.glb","kenney:benchCushion":"./assets/kenney/benchCushion.glb","kenney:benchCushionLow":"./assets/catalog/kenney_benchCushionLow.glb","kenney:bookcaseClosed":"./assets/kenney/bookcaseClosed.glb","kenney:bookcaseClosedDoors":"./assets/catalog/kenney_bookcaseClosedDoors.glb","kenney:bookcaseClosedWide":"./assets/kenney/bookcaseClosedWide.glb","kenney:bookcaseOpen":"./assets/kenney/bookcaseOpen.glb","kenney:bookcaseOpenLow":"./assets/kenney/bookcaseOpenLow.glb","kenney:books":"./assets/kenney/books.glb","kenney:cabinetBed":"./assets/catalog/kenney_cabinetBed.glb","kenney:cabinetBedDrawer":"./assets/catalog/kenney_cabinetBedDrawer.glb","kenney:cabinetBedDrawerTable":"./assets/catalog/kenney_cabinetBedDrawerTable.glb","kenney:cabinetTelevision":"./assets/kenney/cabinetTelevision.glb","kenney:cabinetTelevisionDoors":"./assets/catalog/kenney_cabinetTelevisionDoors.glb","kenney:cardboardBoxClosed":"./assets/catalog/kenney_cardboardBoxClosed.glb","kenney:cardboardBoxOpen":"./assets/kenney/cardboardBoxOpen.glb","kenney:ceilingFan":"./assets/catalog/kenney_ceilingFan.glb","kenney:chair":"./assets/catalog/kenney_chair.glb","kenney:chairCushion":"./assets/kenney/chairCushion.glb","kenney:chairDesk":"./assets/kenney/chairDesk.glb","kenney:chairModernCushion":"./assets/catalog/kenney_chairModernCushion.glb","kenney:chairModernFrameCushion":"./assets/catalog/kenney_chairModernFrameCushion.glb","kenney:chairRounded":"./assets/kenney/chairRounded.glb","kenney:coatRack":"./assets/catalog/kenney_coatRack.glb","kenney:coatRackStanding":"./assets/kenney/coatRackStanding.glb","kenney:computerKeyboard":"./assets/kenney/computerKeyboard.glb","kenney:computerMouse":"./assets/catalog/kenney_computerMouse.glb","kenney:computerScreen":"./assets/kenney/computerScreen.glb","kenney:desk":"./assets/kenney/desk.glb","kenney:deskCorner":"./assets/catalog/kenney_deskCorner.glb","kenney:doorway":"./assets/catalog/kenney_doorway.glb","kenney:doorwayFront":"./assets/catalog/kenney_doorwayFront.glb","kenney:doorwayOpen":"./assets/catalog/kenney_doorwayOpen.glb","kenney:dryer":"./assets/catalog/kenney_dryer.glb","kenney:floorCorner":"./assets/catalog/kenney_floorCorner.glb","kenney:floorCornerRound":"./assets/catalog/kenney_floorCornerRound.glb","kenney:floorFull":"./assets/catalog/kenney_floorFull.glb","kenney:floorHalf":"./assets/catalog/kenney_floorHalf.glb","kenney:hoodLarge":"./assets/catalog/kenney_hoodLarge.glb","kenney:hoodModern":"./assets/catalog/kenney_hoodModern.glb","kenney:kitchenBar":"./assets/catalog/kenney_kitchenBar.glb","kenney:kitchenBarEnd":"./assets/catalog/kenney_kitchenBarEnd.glb","kenney:kitchenBlender":"./assets/catalog/kenney_kitchenBlender.glb","kenney:kitchenCabinet":"./assets/kenney/kitchenCabinet.glb","kenney:kitchenCabinetCornerInner":"./assets/catalog/kenney_kitchenCabinetCornerInner.glb","kenney:kitchenCabinetCornerRound":"./assets/catalog/kenney_kitchenCabinetCornerRound.glb","kenney:kitchenCabinetDrawer":"./assets/catalog/kenney_kitchenCabinetDrawer.glb","kenney:kitchenCabinetUpper":"./assets/catalog/kenney_kitchenCabinetUpper.glb","kenney:kitchenCabinetUpperCorner":"./assets/catalog/kenney_kitchenCabinetUpperCorner.glb","kenney:kitchenCabinetUpperDouble":"./assets/catalog/kenney_kitchenCabinetUpperDouble.glb","kenney:kitchenCabinetUpperLow":"./assets/catalog/kenney_kitchenCabinetUpperLow.glb","kenney:kitchenCoffeeMachine":"./assets/kenney/kitchenCoffeeMachine.glb","kenney:kitchenFridge":"./assets/catalog/kenney_kitchenFridge.glb","kenney:kitchenFridgeBuiltIn":"./assets/catalog/kenney_kitchenFridgeBuiltIn.glb","kenney:kitchenFridgeLarge":"./assets/kenney/kitchenFridgeLarge.glb","kenney:kitchenFridgeSmall":"./assets/catalog/kenney_kitchenFridgeSmall.glb","kenney:kitchenMicrowave":"./assets/kenney/kitchenMicrowave.glb","kenney:kitchenSink":"./assets/kenney/kitchenSink.glb","kenney:kitchenStove":"./assets/kenney/kitchenStove.glb","kenney:kitchenStoveElectric":"./assets/catalog/kenney_kitchenStoveElectric.glb","kenney:lampRoundFloor":"./assets/kenney/lampRoundFloor.glb","kenney:lampRoundTable":"./assets/kenney/lampRoundTable.glb","kenney:lampSquareCeiling":"./assets/catalog/kenney_lampSquareCeiling.glb","kenney:lampSquareFloor":"./assets/kenney/lampSquareFloor.glb","kenney:lampSquareTable":"./assets/catalog/kenney_lampSquareTable.glb","kenney:lampWall":"./assets/catalog/kenney_lampWall.glb","kenney:laptop":"./assets/kenney/laptop.glb","kenney:loungeChair":"./assets/kenney/loungeChair.glb","kenney:loungeChairRelax":"./assets/catalog/kenney_loungeChairRelax.glb","kenney:loungeDesignChair":"./assets/catalog/kenney_loungeDesignChair.glb","kenney:loungeDesignSofa":"./assets/catalog/kenney_loungeDesignSofa.glb","kenney:loungeDesignSofaCorner":"./assets/catalog/kenney_loungeDesignSofaCorner.glb","kenney:loungeSofa":"./assets/kenney/loungeSofa.glb","kenney:loungeSofaCorner":"./assets/catalog/kenney_loungeSofaCorner.glb","kenney:loungeSofaLong":"./assets/kenney/loungeSofaLong.glb","kenney:loungeSofaOttoman":"./assets/catalog/kenney_loungeSofaOttoman.glb","kenney:paneling":"./assets/catalog/kenney_paneling.glb","kenney:pillow":"./assets/kenney/pillow.glb","kenney:pillowBlue":"./assets/kenney/pillowBlue.glb","kenney:pillowBlueLong":"./assets/catalog/kenney_pillowBlueLong.glb","kenney:pillowLong":"./assets/catalog/kenney_pillowLong.glb","kenney:plantSmall1":"./assets/kenney/plantSmall1.glb","kenney:plantSmall2":"./assets/catalog/kenney_plantSmall2.glb","kenney:plantSmall3":"./assets/kenney/plantSmall3.glb","kenney:pottedPlant":"./assets/kenney/pottedPlant.glb","kenney:radio":"./assets/kenney/radio.glb","kenney:rugDoormat":"./assets/kenney/rugDoormat.glb","kenney:rugRectangle":"./assets/kenney/rugRectangle.glb","kenney:rugRound":"./assets/kenney/rugRound.glb","kenney:rugRounded":"./assets/kenney/rugRounded.glb","kenney:rugSquare":"./assets/kenney/rugSquare.glb","kenney:shower":"./assets/catalog/kenney_shower.glb","kenney:showerRound":"./assets/catalog/kenney_showerRound.glb","kenney:sideTable":"./assets/kenney/sideTable.glb","kenney:sideTableDrawers":"./assets/kenney/sideTableDrawers.glb","kenney:speaker":"./assets/catalog/kenney_speaker.glb","kenney:speakerSmall":"./assets/catalog/kenney_speakerSmall.glb","kenney:stairs":"./assets/catalog/kenney_stairs.glb","kenney:stairsCorner":"./assets/catalog/kenney_stairsCorner.glb","kenney:stairsOpen":"./assets/catalog/kenney_stairsOpen.glb","kenney:stairsOpenSingle":"./assets/catalog/kenney_stairsOpenSingle.glb","kenney:stoolBar":"./assets/catalog/kenney_stoolBar.glb","kenney:stoolBarSquare":"./assets/catalog/kenney_stoolBarSquare.glb","kenney:table":"./assets/kenney/table.glb","kenney:tableCloth":"./assets/kenney/tableCloth.glb","kenney:tableCoffee":"./assets/kenney/tableCoffee.glb","kenney:tableCoffeeGlass":"./assets/catalog/kenney_tableCoffeeGlass.glb","kenney:tableCoffeeGlassSquare":"./assets/catalog/kenney_tableCoffeeGlassSquare.glb","kenney:tableCoffeeSquare":"./assets/kenney/tableCoffeeSquare.glb","kenney:tableCross":"./assets/catalog/kenney_tableCross.glb","kenney:tableCrossCloth":"./assets/catalog/kenney_tableCrossCloth.glb","kenney:tableGlass":"./assets/catalog/kenney_tableGlass.glb","kenney:tableRound":"./assets/catalog/kenney_tableRound.glb","kenney:televisionAntenna":"./assets/catalog/kenney_televisionAntenna.glb","kenney:televisionModern":"./assets/catalog/kenney_televisionModern.glb","kenney:televisionVintage":"./assets/catalog/kenney_televisionVintage.glb","kenney:toaster":"./assets/catalog/kenney_toaster.glb","kenney:toilet":"./assets/kenney/toilet.glb","kenney:toiletSquare":"./assets/catalog/kenney_toiletSquare.glb","kenney:trashcan":"./assets/kenney/trashcan.glb","kenney:wall":"./assets/catalog/kenney_wall.glb","kenney:wallCorner":"./assets/catalog/kenney_wallCorner.glb","kenney:wallCornerRond":"./assets/catalog/kenney_wallCornerRond.glb","kenney:wallDoorway":"./assets/catalog/kenney_wallDoorway.glb","kenney:wallDoorwayWide":"./assets/catalog/kenney_wallDoorwayWide.glb","kenney:wallHalf":"./assets/catalog/kenney_wallHalf.glb","kenney:wallWindow":"./assets/catalog/kenney_wallWindow.glb","kenney:wallWindowSlide":"./assets/catalog/kenney_wallWindowSlide.glb","kenney:washer":"./assets/catalog/kenney_washer.glb","kenney:washerDryerStacked":"./assets/catalog/kenney_washerDryerStacked.glb","nature:bed":"./assets/catalog/nature_bed.glb","nature:bed_floor":"./assets/catalog/nature_bed_floor.glb","nature:bridge_center_stone":"./assets/catalog/nature_bridge_center_stone.glb","nature:bridge_center_stoneRound":"./assets/catalog/nature_bridge_center_stoneRound.glb","nature:bridge_center_wood":"./assets/catalog/nature_bridge_center_wood.glb","nature:bridge_center_woodRound":"./assets/catalog/nature_bridge_center_woodRound.glb","nature:bridge_side_stone":"./assets/catalog/nature_bridge_side_stone.glb","nature:bridge_side_stoneRound":"./assets/catalog/nature_bridge_side_stoneRound.glb","nature:bridge_side_wood":"./assets/catalog/nature_bridge_side_wood.glb","nature:bridge_side_woodRound":"./assets/catalog/nature_bridge_side_woodRound.glb","nature:bridge_stone":"./assets/catalog/nature_bridge_stone.glb","nature:bridge_stoneNarrow":"./assets/catalog/nature_bridge_stoneNarrow.glb","nature:bridge_stoneRound":"./assets/catalog/nature_bridge_stoneRound.glb","nature:bridge_stoneRoundNarrow":"./assets/catalog/nature_bridge_stoneRoundNarrow.glb","nature:bridge_wood":"./assets/catalog/nature_bridge_wood.glb","nature:bridge_woodNarrow":"./assets/catalog/nature_bridge_woodNarrow.glb","nature:bridge_woodRound":"./assets/catalog/nature_bridge_woodRound.glb","nature:bridge_woodRoundNarrow":"./assets/catalog/nature_bridge_woodRoundNarrow.glb","nature:cactus_short":"./assets/catalog/nature_cactus_short.glb","nature:cactus_tall":"./assets/catalog/nature_cactus_tall.glb","nature:campfire_bricks":"./assets/catalog/nature_campfire_bricks.glb","nature:campfire_logs":"./assets/catalog/nature_campfire_logs.glb","nature:campfire_planks":"./assets/catalog/nature_campfire_planks.glb","nature:campfire_stones":"./assets/catalog/nature_campfire_stones.glb","nature:canoe":"./assets/catalog/nature_canoe.glb","nature:canoe_paddle":"./assets/catalog/nature_canoe_paddle.glb","nature:cliff_blockCave_rock":"./assets/catalog/nature_cliff_blockCave_rock.glb","nature:cliff_blockCave_stone":"./assets/catalog/nature_cliff_blockCave_stone.glb","nature:cliff_blockDiagonal_rock":"./assets/catalog/nature_cliff_blockDiagonal_rock.glb","nature:cliff_blockDiagonal_stone":"./assets/catalog/nature_cliff_blockDiagonal_stone.glb","nature:cliff_blockHalf_rock":"./assets/catalog/nature_cliff_blockHalf_rock.glb","nature:cliff_blockHalf_stone":"./assets/catalog/nature_cliff_blockHalf_stone.glb","nature:cliff_blockQuarter_rock":"./assets/catalog/nature_cliff_blockQuarter_rock.glb","nature:cliff_blockQuarter_stone":"./assets/catalog/nature_cliff_blockQuarter_stone.glb","nature:cliff_blockSlopeHalfWalls_rock":"./assets/catalog/nature_cliff_blockSlopeHalfWalls_rock.glb","nature:cliff_blockSlopeHalfWalls_stone":"./assets/catalog/nature_cliff_blockSlopeHalfWalls_stone.glb","nature:cliff_blockSlopeWalls_rock":"./assets/catalog/nature_cliff_blockSlopeWalls_rock.glb","nature:cliff_blockSlopeWalls_stone":"./assets/catalog/nature_cliff_blockSlopeWalls_stone.glb","nature:cliff_blockSlope_rock":"./assets/catalog/nature_cliff_blockSlope_rock.glb","nature:cliff_blockSlope_stone":"./assets/catalog/nature_cliff_blockSlope_stone.glb","nature:cliff_block_rock":"./assets/catalog/nature_cliff_block_rock.glb","nature:cliff_block_stone":"./assets/catalog/nature_cliff_block_stone.glb","nature:cliff_cave_rock":"./assets/catalog/nature_cliff_cave_rock.glb","nature:cliff_cave_stone":"./assets/catalog/nature_cliff_cave_stone.glb","nature:cliff_cornerInnerLarge_rock":"./assets/catalog/nature_cliff_cornerInnerLarge_rock.glb","nature:cliff_cornerInnerLarge_stone":"./assets/catalog/nature_cliff_cornerInnerLarge_stone.glb","nature:cliff_cornerInnerTop_rock":"./assets/catalog/nature_cliff_cornerInnerTop_rock.glb","nature:cliff_cornerInnerTop_stone":"./assets/catalog/nature_cliff_cornerInnerTop_stone.glb","nature:cliff_cornerInner_rock":"./assets/catalog/nature_cliff_cornerInner_rock.glb","nature:cliff_cornerInner_stone":"./assets/catalog/nature_cliff_cornerInner_stone.glb","nature:cliff_cornerLarge_rock":"./assets/catalog/nature_cliff_cornerLarge_rock.glb","nature:cliff_cornerLarge_stone":"./assets/catalog/nature_cliff_cornerLarge_stone.glb","nature:cliff_cornerTop_rock":"./assets/catalog/nature_cliff_cornerTop_rock.glb","nature:cliff_cornerTop_stone":"./assets/catalog/nature_cliff_cornerTop_stone.glb","nature:cliff_corner_rock":"./assets/catalog/nature_cliff_corner_rock.glb","nature:cliff_corner_stone":"./assets/catalog/nature_cliff_corner_stone.glb","nature:cliff_diagonal_rock":"./assets/catalog/nature_cliff_diagonal_rock.glb","nature:cliff_diagonal_stone":"./assets/catalog/nature_cliff_diagonal_stone.glb","nature:cliff_halfCornerInner_rock":"./assets/catalog/nature_cliff_halfCornerInner_rock.glb","nature:cliff_halfCornerInner_stone":"./assets/catalog/nature_cliff_halfCornerInner_stone.glb","nature:cliff_halfCorner_rock":"./assets/catalog/nature_cliff_halfCorner_rock.glb","nature:cliff_halfCorner_stone":"./assets/catalog/nature_cliff_halfCorner_stone.glb","nature:cliff_half_rock":"./assets/catalog/nature_cliff_half_rock.glb","nature:cliff_half_stone":"./assets/catalog/nature_cliff_half_stone.glb","nature:cliff_large_rock":"./assets/catalog/nature_cliff_large_rock.glb","nature:cliff_large_stone":"./assets/catalog/nature_cliff_large_stone.glb","nature:cliff_rock":"./assets/catalog/nature_cliff_rock.glb","nature:cliff_stepsCornerInner_rock":"./assets/catalog/nature_cliff_stepsCornerInner_rock.glb","nature:cliff_stepsCornerInner_stone":"./assets/catalog/nature_cliff_stepsCornerInner_stone.glb","nature:cliff_stepsCorner_rock":"./assets/catalog/nature_cliff_stepsCorner_rock.glb","nature:cliff_stepsCorner_stone":"./assets/catalog/nature_cliff_stepsCorner_stone.glb","nature:cliff_steps_rock":"./assets/catalog/nature_cliff_steps_rock.glb","nature:cliff_steps_stone":"./assets/catalog/nature_cliff_steps_stone.glb","nature:cliff_stone":"./assets/catalog/nature_cliff_stone.glb","nature:cliff_topDiagonal_rock":"./assets/catalog/nature_cliff_topDiagonal_rock.glb","nature:cliff_topDiagonal_stone":"./assets/catalog/nature_cliff_topDiagonal_stone.glb","nature:cliff_top_rock":"./assets/catalog/nature_cliff_top_rock.glb","nature:cliff_top_stone":"./assets/catalog/nature_cliff_top_stone.glb","nature:cliff_waterfallTop_rock":"./assets/catalog/nature_cliff_waterfallTop_rock.glb","nature:cliff_waterfallTop_stone":"./assets/catalog/nature_cliff_waterfallTop_stone.glb","nature:cliff_waterfall_rock":"./assets/catalog/nature_cliff_waterfall_rock.glb","nature:cliff_waterfall_stone":"./assets/catalog/nature_cliff_waterfall_stone.glb","nature:crops_bambooStageA":"./assets/catalog/nature_crops_bambooStageA.glb","nature:crops_bambooStageB":"./assets/catalog/nature_crops_bambooStageB.glb","nature:crops_cornStageA":"./assets/catalog/nature_crops_cornStageA.glb","nature:crops_cornStageB":"./assets/catalog/nature_crops_cornStageB.glb","nature:crops_cornStageC":"./assets/catalog/nature_crops_cornStageC.glb","nature:crops_cornStageD":"./assets/catalog/nature_crops_cornStageD.glb","nature:crops_dirtDoubleRow":"./assets/catalog/nature_crops_dirtDoubleRow.glb","nature:crops_dirtDoubleRowCorner":"./assets/catalog/nature_crops_dirtDoubleRowCorner.glb","nature:crops_dirtDoubleRowEnd":"./assets/catalog/nature_crops_dirtDoubleRowEnd.glb","nature:crops_dirtRow":"./assets/catalog/nature_crops_dirtRow.glb","nature:crops_dirtRowCorner":"./assets/catalog/nature_crops_dirtRowCorner.glb","nature:crops_dirtRowEnd":"./assets/catalog/nature_crops_dirtRowEnd.glb","nature:crops_dirtSingle":"./assets/catalog/nature_crops_dirtSingle.glb","nature:crops_leafsStageA":"./assets/catalog/nature_crops_leafsStageA.glb","nature:crops_leafsStageB":"./assets/catalog/nature_crops_leafsStageB.glb","nature:crops_wheatStageA":"./assets/catalog/nature_crops_wheatStageA.glb","nature:crops_wheatStageB":"./assets/catalog/nature_crops_wheatStageB.glb","nature:crop_carrot":"./assets/catalog/nature_crop_carrot.glb","nature:crop_melon":"./assets/catalog/nature_crop_melon.glb","nature:crop_pumpkin":"./assets/catalog/nature_crop_pumpkin.glb","nature:crop_turnip":"./assets/catalog/nature_crop_turnip.glb","nature:fence_bend":"./assets/catalog/nature_fence_bend.glb","nature:fence_bendCenter":"./assets/catalog/nature_fence_bendCenter.glb","nature:fence_corner":"./assets/catalog/nature_fence_corner.glb","nature:fence_gate":"./assets/catalog/nature_fence_gate.glb","nature:fence_planks":"./assets/catalog/nature_fence_planks.glb","nature:fence_planksDouble":"./assets/catalog/nature_fence_planksDouble.glb","nature:fence_simple":"./assets/catalog/nature_fence_simple.glb","nature:fence_simpleCenter":"./assets/catalog/nature_fence_simpleCenter.glb","nature:fence_simpleDiagonal":"./assets/catalog/nature_fence_simpleDiagonal.glb","nature:fence_simpleDiagonalCenter":"./assets/catalog/nature_fence_simpleDiagonalCenter.glb","nature:fence_simpleHigh":"./assets/catalog/nature_fence_simpleHigh.glb","nature:fence_simpleLow":"./assets/catalog/nature_fence_simpleLow.glb","nature:flower_purpleA":"./assets/outdoor/nature_flower_purpleA.glb","nature:flower_purpleB":"./assets/catalog/nature_flower_purpleB.glb","nature:flower_purpleC":"./assets/catalog/nature_flower_purpleC.glb","nature:flower_redA":"./assets/catalog/nature_flower_redA.glb","nature:flower_redB":"./assets/outdoor/nature_flower_redB.glb","nature:flower_redC":"./assets/catalog/nature_flower_redC.glb","nature:flower_yellowA":"./assets/outdoor/nature_flower_yellowA.glb","nature:flower_yellowB":"./assets/catalog/nature_flower_yellowB.glb","nature:flower_yellowC":"./assets/catalog/nature_flower_yellowC.glb","nature:grass":"./assets/catalog/nature_grass.glb","nature:grass_large":"./assets/outdoor/nature_grass_large.glb","nature:grass_leafs":"./assets/catalog/nature_grass_leafs.glb","nature:grass_leafsLarge":"./assets/catalog/nature_grass_leafsLarge.glb","nature:ground_grass":"./assets/catalog/nature_ground_grass.glb","nature:ground_pathBend":"./assets/catalog/nature_ground_pathBend.glb","nature:ground_pathBendBank":"./assets/catalog/nature_ground_pathBendBank.glb","nature:ground_pathCorner":"./assets/catalog/nature_ground_pathCorner.glb","nature:ground_pathCornerSmall":"./assets/catalog/nature_ground_pathCornerSmall.glb","nature:ground_pathCross":"./assets/catalog/nature_ground_pathCross.glb","nature:ground_pathEnd":"./assets/catalog/nature_ground_pathEnd.glb","nature:ground_pathEndClosed":"./assets/catalog/nature_ground_pathEndClosed.glb","nature:ground_pathOpen":"./assets/catalog/nature_ground_pathOpen.glb","nature:ground_pathRocks":"./assets/catalog/nature_ground_pathRocks.glb","nature:ground_pathSide":"./assets/catalog/nature_ground_pathSide.glb","nature:ground_pathSideOpen":"./assets/catalog/nature_ground_pathSideOpen.glb","nature:ground_pathSplit":"./assets/catalog/nature_ground_pathSplit.glb","nature:ground_pathStraight":"./assets/catalog/nature_ground_pathStraight.glb","nature:ground_pathTile":"./assets/catalog/nature_ground_pathTile.glb","nature:ground_riverBend":"./assets/catalog/nature_ground_riverBend.glb","nature:ground_riverBendBank":"./assets/catalog/nature_ground_riverBendBank.glb","nature:ground_riverCorner":"./assets/catalog/nature_ground_riverCorner.glb","nature:ground_riverCornerSmall":"./assets/catalog/nature_ground_riverCornerSmall.glb","nature:ground_riverCross":"./assets/catalog/nature_ground_riverCross.glb","nature:ground_riverEnd":"./assets/catalog/nature_ground_riverEnd.glb","nature:ground_riverEndClosed":"./assets/catalog/nature_ground_riverEndClosed.glb","nature:ground_riverOpen":"./assets/catalog/nature_ground_riverOpen.glb","nature:ground_riverRocks":"./assets/catalog/nature_ground_riverRocks.glb","nature:ground_riverSide":"./assets/catalog/nature_ground_riverSide.glb","nature:ground_riverSideOpen":"./assets/catalog/nature_ground_riverSideOpen.glb","nature:ground_riverSplit":"./assets/catalog/nature_ground_riverSplit.glb","nature:ground_riverStraight":"./assets/catalog/nature_ground_riverStraight.glb","nature:ground_riverTile":"./assets/catalog/nature_ground_riverTile.glb","nature:hanging_moss":"./assets/catalog/nature_hanging_moss.glb","nature:lily_large":"./assets/catalog/nature_lily_large.glb","nature:lily_small":"./assets/catalog/nature_lily_small.glb","nature:log":"./assets/catalog/nature_log.glb","nature:log_large":"./assets/catalog/nature_log_large.glb","nature:log_stack":"./assets/catalog/nature_log_stack.glb","nature:log_stackLarge":"./assets/catalog/nature_log_stackLarge.glb","nature:mushroom_red":"./assets/catalog/nature_mushroom_red.glb","nature:mushroom_redGroup":"./assets/catalog/nature_mushroom_redGroup.glb","nature:mushroom_redTall":"./assets/catalog/nature_mushroom_redTall.glb","nature:mushroom_tan":"./assets/catalog/nature_mushroom_tan.glb","nature:mushroom_tanGroup":"./assets/catalog/nature_mushroom_tanGroup.glb","nature:mushroom_tanTall":"./assets/catalog/nature_mushroom_tanTall.glb","nature:path_stone":"./assets/catalog/nature_path_stone.glb","nature:path_stoneCircle":"./assets/catalog/nature_path_stoneCircle.glb","nature:path_stoneCorner":"./assets/catalog/nature_path_stoneCorner.glb","nature:path_stoneEnd":"./assets/catalog/nature_path_stoneEnd.glb","nature:path_wood":"./assets/catalog/nature_path_wood.glb","nature:path_woodCorner":"./assets/catalog/nature_path_woodCorner.glb","nature:path_woodEnd":"./assets/catalog/nature_path_woodEnd.glb","nature:plant_bush":"./assets/outdoor/nature_plant_bush.glb","nature:plant_bushDetailed":"./assets/outdoor/nature_plant_bushDetailed.glb","nature:plant_bushLarge":"./assets/outdoor/nature_plant_bushLarge.glb","nature:plant_bushLargeTriangle":"./assets/catalog/nature_plant_bushLargeTriangle.glb","nature:plant_bushSmall":"./assets/outdoor/nature_plant_bushSmall.glb","nature:plant_bushTriangle":"./assets/catalog/nature_plant_bushTriangle.glb","nature:plant_flatShort":"./assets/catalog/nature_plant_flatShort.glb","nature:plant_flatTall":"./assets/outdoor/nature_plant_flatTall.glb","nature:platform_beach":"./assets/catalog/nature_platform_beach.glb","nature:platform_grass":"./assets/catalog/nature_platform_grass.glb","nature:platform_stone":"./assets/catalog/nature_platform_stone.glb","nature:pot_large":"./assets/catalog/nature_pot_large.glb","nature:pot_small":"./assets/catalog/nature_pot_small.glb","nature:rock_largeA":"./assets/outdoor/nature_rock_largeA.glb","nature:rock_largeB":"./assets/catalog/nature_rock_largeB.glb","nature:rock_largeC":"./assets/catalog/nature_rock_largeC.glb","nature:rock_largeD":"./assets/catalog/nature_rock_largeD.glb","nature:rock_largeE":"./assets/catalog/nature_rock_largeE.glb","nature:rock_largeF":"./assets/catalog/nature_rock_largeF.glb","nature:rock_smallA":"./assets/outdoor/nature_rock_smallA.glb","nature:rock_smallB":"./assets/catalog/nature_rock_smallB.glb","nature:rock_smallC":"./assets/catalog/nature_rock_smallC.glb","nature:rock_smallD":"./assets/catalog/nature_rock_smallD.glb","nature:rock_smallE":"./assets/catalog/nature_rock_smallE.glb","nature:rock_smallF":"./assets/catalog/nature_rock_smallF.glb","nature:rock_smallFlatA":"./assets/catalog/nature_rock_smallFlatA.glb","nature:rock_smallFlatB":"./assets/catalog/nature_rock_smallFlatB.glb","nature:rock_smallFlatC":"./assets/catalog/nature_rock_smallFlatC.glb","nature:rock_smallG":"./assets/catalog/nature_rock_smallG.glb","nature:rock_smallH":"./assets/catalog/nature_rock_smallH.glb","nature:rock_smallI":"./assets/catalog/nature_rock_smallI.glb","nature:rock_smallTopA":"./assets/catalog/nature_rock_smallTopA.glb","nature:rock_smallTopB":"./assets/catalog/nature_rock_smallTopB.glb","nature:rock_tallA":"./assets/catalog/nature_rock_tallA.glb","nature:rock_tallB":"./assets/catalog/nature_rock_tallB.glb","nature:rock_tallC":"./assets/catalog/nature_rock_tallC.glb","nature:rock_tallD":"./assets/catalog/nature_rock_tallD.glb","nature:rock_tallE":"./assets/catalog/nature_rock_tallE.glb","nature:rock_tallF":"./assets/catalog/nature_rock_tallF.glb","nature:rock_tallG":"./assets/catalog/nature_rock_tallG.glb","nature:rock_tallH":"./assets/catalog/nature_rock_tallH.glb","nature:rock_tallI":"./assets/catalog/nature_rock_tallI.glb","nature:rock_tallJ":"./assets/catalog/nature_rock_tallJ.glb","nature:sign":"./assets/catalog/nature_sign.glb","nature:statue_block":"./assets/catalog/nature_statue_block.glb","nature:statue_column":"./assets/catalog/nature_statue_column.glb","nature:statue_columnDamaged":"./assets/catalog/nature_statue_columnDamaged.glb","nature:statue_head":"./assets/catalog/nature_statue_head.glb","nature:statue_obelisk":"./assets/catalog/nature_statue_obelisk.glb","nature:statue_ring":"./assets/catalog/nature_statue_ring.glb","nature:stone_largeA":"./assets/catalog/nature_stone_largeA.glb","nature:stone_largeB":"./assets/catalog/nature_stone_largeB.glb","nature:stone_largeC":"./assets/catalog/nature_stone_largeC.glb","nature:stone_largeD":"./assets/catalog/nature_stone_largeD.glb","nature:stone_largeE":"./assets/catalog/nature_stone_largeE.glb","nature:stone_largeF":"./assets/catalog/nature_stone_largeF.glb","nature:stone_smallA":"./assets/catalog/nature_stone_smallA.glb","nature:stone_smallB":"./assets/catalog/nature_stone_smallB.glb","nature:stone_smallC":"./assets/catalog/nature_stone_smallC.glb","nature:stone_smallD":"./assets/catalog/nature_stone_smallD.glb","nature:stone_smallE":"./assets/catalog/nature_stone_smallE.glb","nature:stone_smallF":"./assets/catalog/nature_stone_smallF.glb","nature:stone_smallFlatA":"./assets/catalog/nature_stone_smallFlatA.glb","nature:stone_smallFlatB":"./assets/catalog/nature_stone_smallFlatB.glb","nature:stone_smallFlatC":"./assets/catalog/nature_stone_smallFlatC.glb","nature:stone_smallG":"./assets/catalog/nature_stone_smallG.glb","nature:stone_smallH":"./assets/catalog/nature_stone_smallH.glb","nature:stone_smallI":"./assets/catalog/nature_stone_smallI.glb","nature:stone_smallTopA":"./assets/catalog/nature_stone_smallTopA.glb","nature:stone_smallTopB":"./assets/catalog/nature_stone_smallTopB.glb","nature:stone_tallA":"./assets/catalog/nature_stone_tallA.glb","nature:stone_tallB":"./assets/catalog/nature_stone_tallB.glb","nature:stone_tallC":"./assets/catalog/nature_stone_tallC.glb","nature:stone_tallD":"./assets/catalog/nature_stone_tallD.glb","nature:stone_tallE":"./assets/catalog/nature_stone_tallE.glb","nature:stone_tallF":"./assets/catalog/nature_stone_tallF.glb","nature:stone_tallG":"./assets/catalog/nature_stone_tallG.glb","nature:stone_tallH":"./assets/catalog/nature_stone_tallH.glb","nature:stone_tallI":"./assets/catalog/nature_stone_tallI.glb","nature:stone_tallJ":"./assets/catalog/nature_stone_tallJ.glb","nature:stump_old":"./assets/catalog/nature_stump_old.glb","nature:stump_oldTall":"./assets/catalog/nature_stump_oldTall.glb","nature:stump_round":"./assets/catalog/nature_stump_round.glb","nature:stump_roundDetailed":"./assets/catalog/nature_stump_roundDetailed.glb","nature:stump_square":"./assets/catalog/nature_stump_square.glb","nature:stump_squareDetailed":"./assets/catalog/nature_stump_squareDetailed.glb","nature:stump_squareDetailedWide":"./assets/catalog/nature_stump_squareDetailedWide.glb","nature:tent_detailedClosed":"./assets/catalog/nature_tent_detailedClosed.glb","nature:tent_detailedOpen":"./assets/catalog/nature_tent_detailedOpen.glb","nature:tent_smallClosed":"./assets/catalog/nature_tent_smallClosed.glb","nature:tent_smallOpen":"./assets/catalog/nature_tent_smallOpen.glb","nature:tree_blocks":"./assets/catalog/nature_tree_blocks.glb","nature:tree_blocks_dark":"./assets/catalog/nature_tree_blocks_dark.glb","nature:tree_blocks_fall":"./assets/catalog/nature_tree_blocks_fall.glb","nature:tree_cone":"./assets/catalog/nature_tree_cone.glb","nature:tree_cone_dark":"./assets/catalog/nature_tree_cone_dark.glb","nature:tree_cone_fall":"./assets/catalog/nature_tree_cone_fall.glb","nature:tree_default":"./assets/outdoor/nature_tree_default.glb","nature:tree_default_dark":"./assets/catalog/nature_tree_default_dark.glb","nature:tree_default_fall":"./assets/catalog/nature_tree_default_fall.glb","nature:tree_detailed":"./assets/catalog/nature_tree_detailed.glb","nature:tree_detailed_dark":"./assets/catalog/nature_tree_detailed_dark.glb","nature:tree_detailed_fall":"./assets/catalog/nature_tree_detailed_fall.glb","nature:tree_fat":"./assets/catalog/nature_tree_fat.glb","nature:tree_fat_darkh":"./assets/catalog/nature_tree_fat_darkh.glb","nature:tree_fat_fall":"./assets/catalog/nature_tree_fat_fall.glb","nature:tree_oak":"./assets/outdoor/nature_tree_oak.glb","nature:tree_oak_dark":"./assets/catalog/nature_tree_oak_dark.glb","nature:tree_oak_fall":"./assets/catalog/nature_tree_oak_fall.glb","nature:tree_palm":"./assets/catalog/nature_tree_palm.glb","nature:tree_palmBend":"./assets/catalog/nature_tree_palmBend.glb","nature:tree_palmDetailedShort":"./assets/catalog/nature_tree_palmDetailedShort.glb","nature:tree_palmDetailedTall":"./assets/catalog/nature_tree_palmDetailedTall.glb","nature:tree_palmShort":"./assets/catalog/nature_tree_palmShort.glb","nature:tree_palmTall":"./assets/catalog/nature_tree_palmTall.glb","nature:tree_pineDefaultA":"./assets/catalog/nature_tree_pineDefaultA.glb","nature:tree_pineDefaultB":"./assets/catalog/nature_tree_pineDefaultB.glb","nature:tree_pineGroundA":"./assets/catalog/nature_tree_pineGroundA.glb","nature:tree_pineGroundB":"./assets/catalog/nature_tree_pineGroundB.glb","nature:tree_pineRoundA":"./assets/outdoor/nature_tree_pineRoundA.glb","nature:tree_pineRoundB":"./assets/catalog/nature_tree_pineRoundB.glb","nature:tree_pineRoundC":"./assets/catalog/nature_tree_pineRoundC.glb","nature:tree_pineRoundD":"./assets/catalog/nature_tree_pineRoundD.glb","nature:tree_pineRoundE":"./assets/catalog/nature_tree_pineRoundE.glb","nature:tree_pineRoundF":"./assets/catalog/nature_tree_pineRoundF.glb","nature:tree_pineSmallA":"./assets/catalog/nature_tree_pineSmallA.glb","nature:tree_pineSmallB":"./assets/catalog/nature_tree_pineSmallB.glb","nature:tree_pineSmallC":"./assets/outdoor/nature_tree_pineSmallC.glb","nature:tree_pineSmallD":"./assets/catalog/nature_tree_pineSmallD.glb","nature:tree_pineTallA":"./assets/catalog/nature_tree_pineTallA.glb","nature:tree_pineTallA_detailed":"./assets/catalog/nature_tree_pineTallA_detailed.glb","nature:tree_pineTallB":"./assets/catalog/nature_tree_pineTallB.glb","nature:tree_pineTallB_detailed":"./assets/catalog/nature_tree_pineTallB_detailed.glb","nature:tree_pineTallC":"./assets/catalog/nature_tree_pineTallC.glb","nature:tree_pineTallC_detailed":"./assets/catalog/nature_tree_pineTallC_detailed.glb","nature:tree_pineTallD":"./assets/catalog/nature_tree_pineTallD.glb","nature:tree_pineTallD_detailed":"./assets/catalog/nature_tree_pineTallD_detailed.glb","nature:tree_plateau":"./assets/catalog/nature_tree_plateau.glb","nature:tree_plateau_dark":"./assets/catalog/nature_tree_plateau_dark.glb","nature:tree_plateau_fall":"./assets/catalog/nature_tree_plateau_fall.glb","nature:tree_simple":"./assets/outdoor/nature_tree_simple.glb","nature:tree_simple_dark":"./assets/catalog/nature_tree_simple_dark.glb","nature:tree_simple_fall":"./assets/catalog/nature_tree_simple_fall.glb","nature:tree_small":"./assets/outdoor/nature_tree_small.glb","nature:tree_small_dark":"./assets/catalog/nature_tree_small_dark.glb","nature:tree_small_fall":"./assets/catalog/nature_tree_small_fall.glb","nature:tree_tall":"./assets/catalog/nature_tree_tall.glb","nature:tree_tall_dark":"./assets/catalog/nature_tree_tall_dark.glb","nature:tree_tall_fall":"./assets/catalog/nature_tree_tall_fall.glb","nature:tree_thin":"./assets/catalog/nature_tree_thin.glb","nature:tree_thin_dark":"./assets/catalog/nature_tree_thin_dark.glb","nature:tree_thin_fall":"./assets/catalog/nature_tree_thin_fall.glb","market:07_Terracotta_Pot":"./assets/outdoor/market_07_Terracotta_Pot.glb","patio:pergola":"./assets/outdoor/patio_pergola.glb","market:18_Wood_Barrel":"./assets/outdoor/market_18_Wood_Barrel.glb","patio:fire_pit":"./assets/outdoor/patio_fire_pit.glb","patio:patio_sofa":"./assets/outdoor/patio_patio_sofa.glb","market:20_Garden_Lantern":"./assets/outdoor/market_20_Garden_Lantern.glb","patio:side_table_stool":"./assets/outdoor/patio_side_table_stool.glb","patio:raised_bed":"./assets/outdoor/patio_raised_bed.glb","patio:adirondack_chair":"./assets/outdoor/patio_adirondack_chair.glb","market:19_Seedling_Tray":"./assets/outdoor/market_19_Seedling_Tray.glb","patio:picnic_table":"./assets/outdoor/patio_picnic_table.glb","patio:gazebo":"./assets/outdoor/patio_gazebo.glb","patio:terracotta_pot":"./assets/outdoor/patio_terracotta_pot.glb","market:12_Watering_Can":"./assets/outdoor/market_12_Watering_Can.glb","patio:planter_box":"./assets/outdoor/patio_planter_box.glb","market:11_Apple_Crate":"./assets/outdoor/market_11_Apple_Crate.glb","patio:bird_bath":"./assets/outdoor/patio_bird_bath.glb","market:13_Shovel":"./assets/outdoor/market_13_Shovel.glb","patio:hammock_stand":"./assets/outdoor/patio_hammock_stand.glb","patio:wicker_armchair":"./assets/outdoor/patio_wicker_armchair.glb","market:10_Empty_Crate":"./assets/outdoor/market_10_Empty_Crate.glb","patio:mailbox_post":"./assets/outdoor/patio_mailbox_post.glb","patio:trellis_arch":"./assets/outdoor/patio_trellis_arch.glb","patio:park_bench":"./assets/outdoor/patio_park_bench.glb","patio:hanging_basket":"./assets/outdoor/patio_hanging_basket.glb","market:15_Wheelbarrow":"./assets/outdoor/market_15_Wheelbarrow.glb","patio:garden_gnome":"./assets/outdoor/patio_garden_gnome.glb","patio:bbq_grill":"./assets/outdoor/patio_bbq_grill.glb","market:09_Flower_Pot":"./assets/outdoor/market_09_Flower_Pot.glb","patio:porch_swing":"./assets/outdoor/patio_porch_swing.glb","market:16_Herb_Planter":"./assets/outdoor/market_16_Herb_Planter.glb","patio:garden_lantern":"./assets/outdoor/patio_garden_lantern.glb","market:14_Rake":"./assets/outdoor/market_14_Rake.glb","market:08_Herb_Pot":"./assets/outdoor/market_08_Herb_Pot.glb","patio:dining_table_6":"./assets/outdoor/patio_dining_table_6.glb","patio:patio_umbrella":"./assets/outdoor/patio_patio_umbrella.glb","market:03_Plant_Shelf":"./assets/outdoor/market_03_Plant_Shelf.glb","patio:garden_bench":"./assets/outdoor/patio_garden_bench.glb","patio:lounge_chair":"./assets/outdoor/patio_lounge_chair.glb","patio:coffee_table_wicker":"./assets/outdoor/patio_coffee_table_wicker.glb","patio:round_patio_table":"./assets/outdoor/patio_round_patio_table.glb","tiny:TinyLiving_BotanicalBookends_5":"./assets/tinylivingpack.glb","tiny:TinyLiving_CompactLavatory_45":"./assets/tinylivingpack.glb","tiny:TinyLiving_ContemporaryCarpet_40":"./assets/tinylivingpack.glb","tiny:TinyLiving_DonTrippLightFixture_19":"./assets/tinylivingpack.glb","tiny:TinyLiving_JustALittlePeek_18":"./assets/tinylivingpack.glb","tiny:TinyLiving_LampWithoutStorage_20":"./assets/tinylivingpack.glb","tiny:TinyLiving_LovelyArmchair_33":"./assets/tinylivingpack.glb","tiny:TinyLiving_LovelyDiningChair_42":"./assets/tinylivingpack.glb","tiny:TinyLiving_LovelyLoveseat_12":"./assets/tinylivingpack.glb","tiny:TinyLiving_MediaMarathoner_8":"./assets/tinylivingpack.glb","tiny:TinyLiving_MediaMarathoner_AllontheWall_10":"./assets/tinylivingpack.glb","tiny:TinyLiving_ModernPouffe_36":"./assets/tinylivingpack.glb","tiny:TinyLiving_MurphyBed_2":"./assets/tinylivingpack.glb","tiny:TinyLiving_MurphyLoveSeat_4":"./assets/tinylivingpack.glb","tiny:TinyLiving_MyKindaZen_22":"./assets/tinylivingpack.glb","tiny:TinyLiving_NotATableEnd_43":"./assets/tinylivingpack.glb","tiny:TinyLiving_NotQuiteOrbitalSitting_41":"./assets/tinylivingpack.glb","tiny:TinyLiving_OpenShelf_31":"./assets/tinylivingpack.glb","tiny:TinyLiving_OrbitalHighDining_35":"./assets/tinylivingpack.glb","tiny:TinyLiving_PowerTowerBookcase_47":"./assets/tinylivingpack.glb","tiny:TinyLiving_PowerTowerDresser_24":"./assets/tinylivingpack.glb","tiny:TinyLiving_SimpleandCleanArt_39":"./assets/tinylivingpack.glb","tiny:TinyLiving_SirCumferenceCoffeeTable_11":"./assets/tinylivingpack.glb","tiny:TinyLiving_Space-SavingSingle_13":"./assets/tinylivingpack.glb","tiny:TinyLiving_StubbyCubbyDresser_38":"./assets/tinylivingpack.glb","tiny:TinyLiving_TheModernDeskLamp_23":"./assets/tinylivingpack.glb","tiny:TinyLiving_TheSinkzBathroomVanity_32":"./assets/tinylivingpack.glb","tiny:TinyLiving_TieredShelf_29":"./assets/tinylivingpack.glb","tiny:TinyLiving_TinyConsole_44":"./assets/tinylivingpack.glb","tiny:TinyLiving_TinyDeskForTinyLiving_37":"./assets/tinylivingpack.glb","tiny:TinyLiving_VerticalMiniGarden_27":"./assets/tinylivingpack.glb","tiny:TinytLiving_MiracleMirror_26":"./assets/tinylivingpack.glb"};
const catalog=document.getElementById('edCatalog'),packSelect=document.getElementById('edPack');
const packLabels={tiny:'Tiny Living',kenney:'Kenney Furniture',nature:'Kenney Nature',patio:'Patio Garden',market:'Garden Market'};
for(const p of ['tiny','kenney','nature','patio','market']){const op=document.createElement('option');op.value=p;op.textContent=packLabels[p];packSelect.appendChild(op)}
function catalogLabel(key){return key.split(':')[1].replace(/^(TinyLiving_|TinytLiving_)/,'').replace(/_\d+$/,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')}
function refreshCatalog(){const p=packSelect.value,q=document.getElementById('edSearch').value.trim().toLowerCase();catalog.replaceChildren();for(const key of Object.keys(ALL_CATALOG).filter(k=>k.startsWith(p+':')&&catalogLabel(k).toLowerCase().includes(q))){const op=document.createElement('option');op.value=key;op.textContent=catalogLabel(key);catalog.appendChild(op)}if(catalog.options.length)catalog.selectedIndex=0;previewCatalog()}
packSelect.onchange=refreshCatalog;document.getElementById('edSearch').oninput=refreshCatalog;catalog.onchange=previewCatalog;
const previewScene=new THREE.Scene();previewScene.background=new THREE.Color('#dce9eb');previewScene.add(new THREE.HemisphereLight(0xffffff,0x8699a8,2.5));const pl=new THREE.DirectionalLight(0xffffff,2.1);pl.position.set(3,7,5);previewScene.add(pl);
const previewCamera=new THREE.PerspectiveCamera(42,1.5,.01,200);const previewRenderer=new THREE.WebGLRenderer({canvas:document.getElementById('edPreview'),antialias:true});previewRenderer.setPixelRatio(Math.min(devicePixelRatio,1.5));previewRenderer.setSize(300,200,false);previewRenderer.outputColorSpace=THREE.SRGBColorSpace;
let previewObject=null,previewToken=0;
async function catalogModel(key){const [pack,name]=key.split(':');if(pack==='tiny'){const lookup=await tinyLookupPromise;const src=lookup.get(name);if(!src)throw Error('No tiny '+name);return src.clone(true)}const result=await loader.loadAsync(ALL_CATALOG[key]);return result.scene.clone(true)}
async function previewCatalog(){const key=catalog.value,token=++previewToken;if(previewObject){previewScene.remove(previewObject);previewObject=null}if(!key)return;document.getElementById('edPreviewStatus').textContent='⏳ Загружаем '+catalogLabel(key);try{const obj=await catalogModel(key);if(token!==previewToken)return;obj.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(obj),s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());if(s.length()<.001)throw Error('Empty model');obj.position.sub(c);const scale=2.5/Math.max(s.x,s.y,s.z);obj.scale.setScalar(scale);previewObject=obj;previewScene.add(obj);previewCamera.position.set(3.3,2.4,4.3);previewCamera.lookAt(0,0,0);document.getElementById('edPreviewStatus').textContent=packLabels[key.split(':')[0]]+' · '+catalogLabel(key)}catch(e){console.warn(e);document.getElementById('edPreviewStatus').textContent='⚠️ Не удалось открыть модель'}}
refreshCatalog();
let editCamTarget=new THREE.Vector3(0,1.4,0),editCamYaw=.6,editCamPitch=.55,editCamDistance=14,editCameraMode=false,editDragMode=null,editLastX=0,editLastY=0;
let editorOn=false,editSelected=null,editHelper=null,editPointer=null,editPlane=new THREE.Plane(),editOffset=new THREE.Vector3(),editHits=new THREE.Raycaster();
function syncEditorLabel(){document.getElementById('edSelected').textContent=editSelected?`${editSelected.description} · X ${editSelected.holder.position.x.toFixed(1)} · Z ${editSelected.holder.position.z.toFixed(1)} · Y ${editSelected.holder.position.y.toFixed(1)}`:'Нажми на любую мебель в сцене';}
function pickEdit(item){editSelected=item;if(editHelper){scene.remove(editHelper);editHelper.geometry.dispose();editHelper.material.dispose();editHelper=null;}if(item){editHelper=new THREE.BoxHelper(item.holder,0xffd543);scene.add(editHelper)}syncEditorLabel();}
function toggleEditor(force){editorOn=typeof force==='boolean'?force:!editorOn;editorPanel.style.display=editorOn?'block':'none';editorButton.textContent=editorOn?'✅ Закончить':'🛠️ Мебель';if(!editorOn){pickEdit(null);editPointer=null;saveFurniture();}else{editCamTarget.set(cat.position.x,cat.position.y+1.2,cat.position.z);editCamDistance=11;for(const k in keys)keys[k]=false;stick.x=stick.y=0;toast('🛠️ Выбери предмет мышью / пальцем');}}
document.getElementById('edCameraMode').onclick=()=>{editCameraMode=!editCameraMode;document.getElementById('edCameraMode').textContent=editCameraMode?'✋ Перемещение камеры':'📷 Камера';};
document.getElementById('edFocus').onclick=()=>{if(editSelected)editCamTarget.copy(editSelected.holder.position).add(new THREE.Vector3(0,1,0));else editCamTarget.copy(cat.position).add(new THREE.Vector3(0,1,0));};
document.getElementById('edTop').onclick=()=>{editCamPitch=1.43;editCamDistance=17;};
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('wheel',e=>{if(editorOn){e.preventDefault();editCamDistance=THREE.MathUtils.clamp(editCamDistance*Math.exp(e.deltaY*.001),1.8,90)}},{passive:false});
editorButton.onclick=()=>toggleEditor();document.getElementById('edToggle').onclick=()=>toggleEditor(false);
function moveEdit(dx,dz,dy=0,rot=0){if(!editSelected)return;const p=editSelected.holder.position;p.x+=dx;p.z+=dz;p.y=Math.max(0,p.y+dy);editSelected.holder.rotation.y+=rot;editSelected.level=editSelected.holder.position.y;editSelected.floorY=editSelected.level;refreshEditBounds(editSelected);if(editHelper)editHelper.update();syncEditorLabel();}
for(const [id,dx,dz,dy,rot] of [['edLeft',-.25,0,0,0],['edRight',.25,0,0,0],['edForward',0,-.25,0,0],['edBack',0,.25,0,0],['edUp',0,0,F,0],['edDown',0,0,-F,0],['edRotL',0,0,0,-Math.PI/12],['edRotR',0,0,0,Math.PI/12]])document.getElementById(id).onclick=()=>moveEdit(dx,dz,dy,rot);
document.getElementById('edSave').onclick=()=>{saveFurniture();toast('💾 Расстановка сохранена в браузере!')};
document.getElementById('edRemove').onclick=()=>{if(!editSelected)return;editSelected.removed=true;editSelected.holder.visible=false;refreshEditBounds(editSelected);pickEdit(null);saveFurniture()};
let customIndex=0;
async function addCatalogItem(key,restore=null,id=null){
 if(!key.includes(':'))key='tiny:'+key;
 const [pack,name]=key.split(':');const match=name.toLowerCase(),decor=/art|mirror|carpet|rug|flower|grass/.test(match),small=/lamp|bookends|flower|grass|rock_small/.test(match),seat=/chair|pouffe|loveseat|sitting|sofa/.test(match),bed=/bed/.test(match),tree=/tree/.test(match);
 const w=tree?3.0:small?.55:bed?2.7:seat?1.5:decor?1.1:1.5,d=tree?3.0:small?.55:bed?2.6:seat?1.2:decor?.8:1.0,h=tree?4.2:small?.8:bed?1.6:decor?.9:1.5;
 const floor=restore?.pos?.[1]??(cat.position.y>F-1.1?F:0),x=restore?.pos?.[0]??(editorOn?editCamTarget.x:cat.position.x+2),z=restore?.pos?.[2]??(editorOn?editCamTarget.z:cat.position.z+2);
 const editId=id||'custom-'+(++customIndex);let piece;
 if(pack==='tiny')piece=await placeTiny([name,x,z,floor,w,d,h,restore?.rot||0,seat?'chair':bed?'bed':'solid','scratch',!decor],editId);
 else if(pack==='kenney')piece=await place([name,x,z,floor,w,d,h,restore?.rot||0,seat?'chair':bed?'bed':decor?'decor':'solid',decor?'knock':'scratch'],editId);
 else {piece=await placeGarden([pack,name,catalogLabel(key),x,z,w,d,h,restore?.rot||0,tree?'':'knock',!decor&&!tree],editId);piece.holder.position.y=floor;refreshEditBounds(piece)}
 if(restore?.hidden){piece.removed=true;piece.holder.visible=false;refreshEditBounds(piece)}return piece;
}
function exportFurniture(){saveFurniture();const data={version:1,layout:JSON.parse(localStorage.getItem(EDIT_SAVE_KEY)),custom:customEntries};const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='badcat_furniture_layout.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
document.getElementById('edExport').onclick=exportFurniture;
let customEntries=[];
const originalAdd=addCatalogItem;
// Track chosen models so custom furniture can be restored on reload and imported elsewhere.
document.getElementById('edAdd').onclick=async()=>{try{const id='custom-'+(++customIndex),name=catalog.value;const piece=await addCatalogItem(name,null,id);customEntries.push({id,name});pickEdit(piece);saveFurniture();persistExtras();toast('🪑 Предмет добавлен — перетащи его')}catch(e){console.error(e);toast('Не удалось загрузить модель')}};
function persistExtras(){localStorage.setItem(EDIT_SAVE_KEY+'-extras',JSON.stringify(customEntries));}
async function loadExtras(){try{customEntries=JSON.parse(localStorage.getItem(EDIT_SAVE_KEY+'-extras')||'[]');for(const c of customEntries){const number=Number(c.id.split('-')[1]);if(number>customIndex)customIndex=number;await addCatalogItem(c.name,storedLayout[c.id],c.id)}}catch(e){console.warn('Furniture extras load:',e)}}
document.getElementById('edImportFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!parsed.layout||typeof parsed.layout!=='object'||!Array.isArray(parsed.custom))throw Error('Invalid format');localStorage.setItem(EDIT_SAVE_KEY,JSON.stringify(parsed.layout));localStorage.setItem(EDIT_SAVE_KEY+'-extras',JSON.stringify(parsed.custom));location.reload()}catch(err){toast('⚠️ Неверный файл JSON');console.error(err)}};
document.getElementById('edReset').onclick=()=>{if(confirm('Сбросить только расстановку мебели? Прогресс квестов сохранится.')){localStorage.removeItem(EDIT_SAVE_KEY);localStorage.removeItem(EDIT_SAVE_KEY+'-extras');location.reload()}};
const rayPos=new THREE.Vector2();
function editRay(event){const rect=renderer.domElement.getBoundingClientRect();rayPos.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);editHits.setFromCamera(rayPos,camera)}
function selectFromPointer(event){editRay(event);const targets=[...editablePieces.values()].filter(p=>!p.removed).map(p=>p.holder);const hits=editHits.intersectObjects(targets,true);if(!hits.length){pickEdit(null);return;}let obj=hits[0].object;while(obj&&!targets.includes(obj))obj=obj.parent;const item=[...editablePieces.values()].find(p=>p.holder===obj);pickEdit(item||null)}
const furnitureExtrasReady=()=>loadExtras();

const furnitureJob=Promise.allSettled([...layout.map((d,i)=>place(d,'kenney-'+i)),...tinyMainLayout.map((d,i)=>placeTiny(d,'tinyhome-'+i)),...tinyNeighborhoodLayout.map((d,i)=>placeTiny(d,'neighbor-'+i)),...gardenLayout.map((d,i)=>placeGarden(d,'yard-'+i))]).then(async results=>{
 await furnitureExtrasReady();
 failed=results.filter(r=>r.status==='rejected').length;
 if(failed)console.warn('Не удалось загрузить мебель:',results.filter(r=>r.status==='rejected'));
 furnitureReady=true;stage.textContent=`🏘️ Мебель дома и соседей: ${loaded} предметов · Улица: ${yardLoaded}/${gardenLayout.length}`+(failed?` · ${failed} ошибок`:' · всё на местах!');
 const button=document.getElementById('play');button.disabled=false;button.style.opacity='1';button.textContent='Играть! 🐾';
 // Old saves came from a different furniture layout. Use safe spawn positions on both floors.
 if(isBlocked(cat.position.x,cat.position.z,cat.position.y))cat.position.set(-1.8,0,5.2);
 if(isBlocked(owner.position.x,owner.position.z,0,HUMAN_RADIUS,1.8))owner.position.set(3.4,0,5.2);
 setTimeout(()=>stage.remove(),6000);
});
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
 if(type==='scratch'){scratched=true;if(item.model==='Парковая лавка')parkScratched=true;}
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
function stealFood(){if(!playing)return;
 const x=cat.position.x,z=cat.position.z;
 if(cat.position.y<1.5&&Math.hypot(x,z-43)<4.4){marketFood=true;hunger=Math.min(100,hunger+38);score+=3;toast('🐟 Рыбный налёт! +3 рыбки');sound('eat');updateQuest();return;}
 if(cat.position.y<1.5&&Math.hypot(x,z-79)<4.4){if(!boughtMilk&&score<5){toast('🛒 На молоко нужно 5 рыбок!');return}if(!boughtMilk)score-=5;boughtMilk=true;hunger=Math.min(100,hunger+20);toast('🥛 Купил молоко и вылизал пакет!');sound('eat');updateQuest();return;}

 const d=Math.hypot(cat.position.x+9.53,cat.position.z+7.47);
 if(cat.position.y>1.5||d>2.1){toast('🐟 Ищи вкусняшки возле холодильника на кухне');return}
 hunger=Math.min(100,hunger+30);mood=Math.min(100,mood+6);ate=true;score+=4;alertness=Math.min(100,alertness+10);sound('eat');toast('🐟 Украл еду из холодильника! +4 рыбки');updateQuest();setProgress();
}
function goSleep(){if(!playing)return;
 if(cat.position.y<1.5&&Math.hypot(cat.position.x-36.2,cat.position.z-36.2)<2.7){neighborSlept=true;sleeping=4;energy=100;toast('💤 Уснул в чужом доме!');updateQuest();return;}

 if(cat.position.y<F-1||Math.hypot(cat.position.x+6.65,cat.position.z-5.55)>2.4){toast('💤 Найди кровать на втором этаже');return}
 sleeping=4;energy=100;mood=Math.min(100,mood+12);slept=true;sound('sleep');toast('💤 Мурр... котик отдыхает');updateQuest();
}
function questInteract(){if(!playing)return;
 const x=cat.position.x,z=cat.position.z,near=(a,b,d=2.8)=>Math.hypot(x-a,z-b)<d;
 if(near(-40,41)){if(!dugTreasure){dugTreasure=true;score+=8;sparks(x,.3,z,'hit');sound('hit');toast('⛏️ Откопал старые рыбки! +8 🐟')}else toast('Здесь уже выкопано');}
 else if(near(-1,-42)){if(!buriedFish){if(!marketFood){toast('Сначала укради рыбу на рынке!');return}buriedFish=true;sparks(x,.3,z,'tear');toast('🕳️ Закопал улики в парке!')}else toast('Здесь уже спрятана рыба');}
 else if(near(77,-41,3.2)){gnomeSaved=true;score+=2;toast('🧙 Спас садового гнома!');}
 else if(near(0,-73,4)){bathed=true;mood=100;energy=Math.min(100,energy+10);toast('⛲ Котик искупался в фонтане!');}
 else if(near(-78,78)){dugBone=true;toast('🦴 Откопал древнюю косточку!');sparks(x,.3,z,'hit');}
 else if(near(78,78)){if(!dugBone){toast('Сначала найди кость на северо-западе!');return}buriedBone=true;toast('🦴 Тайна закопана навечно!');sparks(x,.3,z,'hit');}
 else {toast('🧭 Ищи точку задания 📍 на миникарте · X — действие');return}
 updateQuest();setProgress();
}
function groom(){if(!playing)return;mood=Math.min(100,mood+3);toast('🧼 Умывание пока без анимации — скелет нового котика не поддерживает её')}
function meow(){if(!playing)return;sound('meow');toast('МЯЯУ! 🐈');if(Math.hypot(cat.position.x-owner.position.x,cat.position.z-owner.position.z)<6)alertness=Math.min(100,alertness+18)}
function jump(){if(!playing||!grounded||sleeping>0)return;velY=6.7;grounded=false;sound('jump')}
function toggleView(){viewFirstPerson=!viewFirstPerson;document.getElementById('view').textContent=viewFirstPerson?'🐈 3D-КАМЕРА':'👁️ КАМЕРА';toast(viewFirstPerson?'👁️ Вид от первого лица':'🎥 Камера от третьего лица')}
function saveGame(notify=false){try{localStorage.setItem('badcat3d-v16',JSON.stringify({score,chaos,hunger,energy,mood,questIndex,ate,scratched,slept,escaped,streetKnocks,dugTreasure,buriedFish,boughtMilk,bathed,gnomeSaved,dugBone,buriedBone,neighborSlept,parkScratched,marketFood,cat:[cat.position.x,cat.position.y,cat.position.z]}));if(notify)toast('💾 Прогресс сохранён')}catch(e){if(notify)toast('⚠️ Не удалось сохранить')}}
function loadGame(){try{const current=localStorage.getItem('badcat3d-v16');const s=JSON.parse(current||localStorage.getItem('badcat3d-v15')||localStorage.getItem('badcat3d-v04')||'null');if(!s)return;
 score=s.score||0;chaos=s.chaos??s.count??0;hunger=s.hunger??85;energy=s.energy??90;mood=s.mood??85;questIndex=current?(s.questIndex||0):0;
 ate=!!s.ate;scratched=!!s.scratched;slept=!!s.slept;escaped=!!s.escaped;
 streetKnocks=s.streetKnocks||0;dugTreasure=!!s.dugTreasure;buriedFish=!!s.buriedFish;boughtMilk=!!s.boughtMilk;bathed=!!s.bathed;gnomeSaved=!!s.gnomeSaved;dugBone=!!s.dugBone;buriedBone=!!s.buriedBone;neighborSlept=!!s.neighborSlept;parkScratched=!!s.parkScratched;marketFood=!!s.marketFood;
 // Avoid stale positions landing inside furniture; validate after load.
 if(current&&Array.isArray(s.cat)&&s.cat.length===3&&s.cat.every(Number.isFinite))cat.position.set(...s.cat);
 updateQuest();setProgress();
 }catch(e){console.warn('Ошибка чтения сохранения',e)}}
loadGame();

for(const [id,action] of [['jump',jump],['swat',()=>chaosAction('knock')],['scratch',()=>chaosAction('scratch')],['tear',()=>chaosAction('tear')],['eat',stealFood],['sleep',goSleep],['meow',meow],['groom',groom],['view',toggleView],['use',questInteract]]){
 document.getElementById(id).addEventListener('pointerdown',e=>{e.preventDefault();action()});
}
addEventListener('keydown',e=>{if(editorOn){if(e.key==='Escape')toggleEditor(false);return;}const key=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
 if(!keys[key]){if(e.code==='Space')jump();if(key==='e')chaosAction('knock');if(key==='f')chaosAction('scratch');if(key==='r')chaosAction('tear');
  if(key==='g'||key==='c'||key==='o')stealFood();if(key==='x')questInteract();if(key==='h')goSleep();if(key==='m')meow();if(key==='u')groom();if(key==='v')toggleView();
  if(key==='q'){camOrbit=0;camPitch=.15}if(key==='p')saveGame(true);if(key==='b'){collisionVisuals.visible=!collisionVisuals.visible;toast(collisionVisuals.visible?'🟩 Показаны реальные хитбоксы':'🐾 Хитбоксы скрыты')}
 }keys[key]=true;
});
addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false});addEventListener('blur',()=>{for(const key in keys)keys[key]=false;stick.x=stick.y=0});
for(const event of ['contextmenu','selectstart','dragstart'])document.addEventListener(event,e=>e.preventDefault());
document.addEventListener('touchmove',e=>{if(e.cancelable)e.preventDefault()},{passive:false});
const joy=document.getElementById('joy'),nub=document.getElementById('nub');let joyPointer=null;
function setJoystick(e){const box=joy.getBoundingClientRect(),dx=e.clientX-(box.left+box.width/2),dy=e.clientY-(box.top+box.height/2),length=Math.hypot(dx,dy)||1,mag=Math.min(1,length/43);
 stick.x=dx/length*mag;stick.y=-dy/length*mag;nub.style.transform=`translate(${stick.x*43}px,${-stick.y*43}px)`}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(joyPointer);setJoystick(e)});
joy.addEventListener('pointermove',e=>{e.preventDefault();if(e.pointerId===joyPointer)setJoystick(e)});
for(const name of ['pointerup','pointercancel'])joy.addEventListener(name,e=>{if(e.pointerId===joyPointer){joyPointer=null;stick.x=stick.y=0;nub.style.transform=''}});
let dragging=null,oldX=0,oldY=0;
renderer.domElement.addEventListener('pointerdown',e=>{e.preventDefault();if(editorOn){editLastX=e.clientX;editLastY=e.clientY;editPointer=e.pointerId;editDragMode=(e.button===2||editCameraMode)?'orbit':e.button===1?'pan':'object';if(editDragMode==='object'){selectFromPointer(e);if(editSelected){editPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,1,0),editSelected.holder.position);editRay(e);const hit=new THREE.Vector3();if(editHits.ray.intersectPlane(editPlane,hit))editOffset.copy(editSelected.holder.position).sub(hit)}else editDragMode='orbit';}renderer.domElement.setPointerCapture(e.pointerId);return;}dragging=e.pointerId;oldX=e.clientX;oldY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)});
renderer.domElement.addEventListener('pointermove',e=>{if(editorOn){if(e.pointerId!==editPointer)return;const dx=e.clientX-editLastX,dy=e.clientY-editLastY;editLastX=e.clientX;editLastY=e.clientY;if(editDragMode==='orbit'){editCamYaw-=dx*.006;editCamPitch=THREE.MathUtils.clamp(editCamPitch+dy*.006,-.1,1.49)}else if(editDragMode==='pan'){const speed=editCamDistance*.002;editCamTarget.x-=Math.cos(editCamYaw)*dx*speed;editCamTarget.z+=Math.sin(editCamYaw)*dx*speed;editCamTarget.y+=dy*speed;}else if(editDragMode==='object'&&editSelected){editRay(e);const hit=new THREE.Vector3();if(editHits.ray.intersectPlane(editPlane,hit)){editSelected.holder.position.x=hit.x+editOffset.x;editSelected.holder.position.z=hit.z+editOffset.z;refreshEditBounds(editSelected);if(editHelper)editHelper.update();syncEditorLabel()}}return;}if(e.pointerId!==dragging)return;e.preventDefault();camOrbit-=(e.clientX-oldX)*.005;camPitch=THREE.MathUtils.clamp(camPitch+(e.clientY-oldY)*.003,-.25,.33);oldX=e.clientX;oldY=e.clientY});
for(const name of ['pointerup','pointercancel'])renderer.domElement.addEventListener(name,e=>{if(dragging===e.pointerId)dragging=null;if(editPointer===e.pointerId){editPointer=null;editDragMode=null;saveFurniture()}});
document.getElementById('play').onclick=()=>{if(!furnitureReady)return;try{audio=new (window.AudioContext||window.webkitAudioContext)();audio.resume()}catch(e){}playing=true;document.getElementById('start').style.display='none';toast('🏘️ 16 соседских домов! Выход через ворота (+Z), X — задания')};
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
 let level=groundSupport(cat.position.x,cat.position.z,cat.position.y,prev);
 if(stair!=null&&Math.abs(prev-stair)<.75)level=Math.max(level,stair);
 if(velY<=0&&level>-100&&cat.position.y<=level+.08&&prev>=level-.28){cat.position.y=level;velY=0;grounded=true}else grounded=false;
 if(cat.position.y<-.4){cat.position.set(-1.8,0,5.2);velY=0;grounded=true;toast('🐾 Котик вернулся на пол')}
 animateCat(dt,moving,!!keys.shift);
 return moving;
}
function updatePhysicsProps(dt){for(const it of interactables){if(!it.used||it.action!=='knock')continue;
 it.vy-=12*dt;it.holder.position.x+=it.vx*dt;it.holder.position.z+=it.vz*dt;it.holder.position.y+=it.vy*dt;
 const minY=it.level;if(it.holder.position.y<=minY){it.holder.position.y=minY;it.vy=0;it.vx*=.86;it.vz*=.86;it.holder.rotation.z=THREE.MathUtils.lerp(it.holder.rotation.z,.55,dt*5)}
}}
function updateVisualFx(dt){for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.time-=dt;f.vy-=8*dt;f.mesh.position.x+=f.vx*dt;f.mesh.position.y+=f.vy*dt;f.mesh.position.z+=f.vz*dt;f.mesh.scale.setScalar(Math.max(.01,f.time*2));if(f.time<=0){scene.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();fx.splice(i,1)}}}
function updateCamera(dt){if(editorOn){
 const speed=dt*(keys.shift?25:9),right=new THREE.Vector3(Math.cos(editCamYaw),0,-Math.sin(editCamYaw)),forward=new THREE.Vector3(Math.sin(editCamYaw),0,Math.cos(editCamYaw));
 if(keys.w||keys.arrowup)editCamTarget.addScaledVector(forward,speed);
 if(keys.s||keys.arrowdown)editCamTarget.addScaledVector(forward,-speed);
 if(keys.a||keys.arrowleft)editCamTarget.addScaledVector(right,-speed);
 if(keys.d||keys.arrowright)editCamTarget.addScaledVector(right,speed);
 if(keys.q)editCamTarget.y-=speed;if(keys.e)editCamTarget.y+=speed;
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
 HUD.room.textContent=(Math.abs(cat.position.x)>19||cat.position.z>19||cat.position.z<-19)?'🏘️ Кошачий район · '+(Math.round(cat.position.x))+', '+Math.round(cat.position.z):(cat.position.x<-11||cat.position.x>11||cat.position.z<-9||cat.position.z>9)?'🌳 Домашний двор':'🏠 '+(upstairs?'2 этаж · ':'1 этаж · ')+names;
}
const mapCanvas=document.getElementById('mapCanvas'),mapCtx=mapCanvas.getContext('2d');let mapBig=false;
function drawMap(){
 const c=mapCtx,S=c.canvas.width,scale=mapBig?1.9:2.65,px=cat.position.x,pz=cat.position.z;
 c.clearRect(0,0,S,S);c.fillStyle='#9cc780';c.fillRect(0,0,S,S);
 const xx=x=>S/2+(x-px)*scale,zz=z=>S/2+(z-pz)*scale;
 c.fillStyle='#75818b';for(const r of [-59,-21,21,59]){c.fillRect(xx(r-3.5),0,7*scale,S);c.fillRect(0,zz(r-3.5),S,7*scale)}
 c.fillStyle='#deb58d';for(const [x,z] of homeCenters)c.fillRect(xx(x-7),zz(z-6.5),14*scale,13*scale);
 c.fillStyle='#efe4d2';c.fillRect(xx(-11),zz(-9),22*scale,18*scale);
 c.fillStyle='#5e895a';c.fillRect(xx(-18),zz(-16),36*scale,34*scale);
 c.fillStyle='#f0d2b9';c.fillRect(xx(-11),zz(-9),22*scale,18*scale);
 for(const [x,z] of [[0,-73],[0,43],[0,79]]){c.fillStyle='#55a7c5';c.beginPath();c.arc(xx(x),zz(z),3.5,0,Math.PI*2);c.fill()}
 const q=quests[questIndex];if(q){const x=xx(q.at[0]),z=zz(q.at[1]);c.strokeStyle='#fff';c.lineWidth=2;c.fillStyle='#e15b43';c.beginPath();c.arc(x,z,7,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#fff';c.font='bold 11px system-ui';c.textAlign='center';c.fillText('!',x,z+4)}
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
 for(const roof of roofPieces){const distance=Math.hypot(cat.position.x-roof.x,cat.position.z-roof.z);
  roof.mesh.visible=distance>10||cat.position.y>2.5;}
 if(Math.floor(elapsed*7)!==Math.floor((elapsed-dt)*7))drawMap();
 if(editHelper&&editSelected)editHelper.update();updateCamera(dt);renderer.render(scene,camera);if(editorOn&&previewObject){previewObject.rotation.y+=dt*.42;previewRenderer.render(previewScene,previewCamera)}
 fpsFrames++;fpsSum+=dt;if(fpsSum>.8){fps.textContent='⚡ '+Math.round(fpsFrames/fpsSum)+' FPS';fpsSum=0;fpsFrames=0}
}
render();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
