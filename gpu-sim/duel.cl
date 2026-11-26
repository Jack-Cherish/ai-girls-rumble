// Fixed-step stock-roster Balance Lab backend. One work item owns one whole match.
// Compile the same functions as C99 for the engine-parity test.
#ifdef CPU_TEST
#include <stdint.h>
#include <math.h>
typedef uint32_t uint;
#define CFG const double *
#else
#pragma OPENCL EXTENSION cl_khr_fp64 : enable
#pragma OPENCL FP_CONTRACT OFF
#define CFG __global const double *
#endif
#define DT (1.0/60.0)
#define SLOTS 4
#define SHOTS 16
#define WORDS 72
enum { NONE, ATT, SK1, SK2, ULT, EVADE, JUMP, SUB };
enum { DASH, PROJECTILE, SHIELD, HEAL, BURST, VOLLEY, RUSH };
enum { LIGHT, FINISH, SKILL, ULTIMATE };
typedef struct { int type,stage,dir,fired,hit,id; double t,wind,duration; } Move;
typedef struct {
  int id,seat,hp,energy,dir,guard,earned,knock,chainStep,comboHits,dx,dz,holding,subArmed;
  double x,y,z,vy,recoil,stun,cd[2],subCd,subWindow,inv,shield,evadeCd,chain,down,getup,guardHp,crush,blockFlash,think;
  double queue[8]; Move move;
} Fighter;
typedef struct {
  int owner,dir,power,ult,slot,labId,missingTrace,role,style,returned,leg,charged;
  double x,y,z,life,delay,speed,radius,width,age,back,stun,push;
} Shot;
typedef struct {
  Fighter f[2]; Shot shots[SHOTS]; int nshot,frame,round,clock,lastHit,roundGap,ending,done,fail,wins[2];
  int strings[2][4],castKey[32],castDamage[32],cursor;
  uint rng,out[WORDS];
  double countdown,left,stop,endingAge;
} World;
// Output words: 0 winner+1, 1 hit hash, 2 rounds, 3 oneShot, 4-8 best string,
// 9 maximum no-damage ticks, 10-17 casts, 18-25 damage, 26-27 blocks,
// 28-29 heals, then six words per round (clock,hp0,hp1,endFrame,gap,timeout).
static inline double bound(double x,double lo,double hi){return fmax(lo,fmin(hi,x));}
static inline double arena(double x){return bound(x,32,928);}
static inline double decay(double x){return fmax(0.,x-DT);}
static inline void mix(World *w,uint n){w->out[1]=(w->out[1]^n)*16777619u;}
static inline double roll(World *w){w->rng=w->rng*1664525u+1013904223u;return (double)w->rng/4294967296.;}
static inline int aligned(Fighter *a,Fighter *b,double range){return fabs(a->z-b->z)<=range;}
static inline void charge(Fighter *f){if(f->energy<4)f->energy++;}
static inline void resetRound(World *w,int a,int b,int e0,int e1){
  for(int i=0;i<2;i++){
    Fighter f={0};f.id=i?b:a;f.seat=i;f.hp=180;f.energy=i?e1:e0;f.dir=i?-1:1;
    f.x=i?646:314;f.y=326;f.guardHp=100;w->f[i]=f;
  }
  w->round++;w->countdown=2.65;w->left=60;w->ending=0;w->endingAge=0;w->stop=0;
  w->nshot=w->roundGap=w->lastHit=w->clock=0;
}
static inline void begin(World *w,int a,int b,uint seed){
  World blank={0};*w=blank;w->rng=seed;w->out[1]=2166136261u;resetRound(w,a,b,2,2);
}
static inline int land(World *w,int i,int power,int dir,int style,int slot,int cast){
  Fighter *a=&w->f[i],*b=&w->f[1-i];
  if(b->hp<=0||b->inv>0||b->down>0||b->getup>0||(b->knock&&b->comboHits>=8))return 0;
  int shield=b->shield>0,block=!shield&&b->guard&&b->dir==-dir,crushed=0;
  if(block){int wear=style==LIGHT?4:style==FINISH?7:style==ULTIMATE?22:9;
    b->guardHp=fmax(0.,b->guardHp-wear);crushed=b->guardHp<=0;}
  int guarded=shield||(block&&!crushed);
  double scale[]={1,1,.85,.72,.6,.5,.42,.36};
  int amount=shield?0:(int)fmax(1.,floor(.5+power*(guarded?.15:crushed?.5:scale[b->comboHits<7?b->comboHits:7])));
  int h=b->hp<amount?b->hp:amount;
  if(shield&&!b->earned){b->earned=1;charge(b);}
  if(slot<ATT||slot>ULT)slot=slot==EVADE?SK1:ATT;
  w->out[18+4*i+slot-1]+=h;w->out[26+(1-i)]+=guarded;
  mix(w,w->frame);mix(w,i);mix(w,h);mix(w,b->hp);mix(w,cast);mix(w,guarded);
  if(h){int gap=w->clock-w->lastHit;if(gap>w->roundGap)w->roundGap=gap;w->lastHit=w->clock;}
  if(cast){int k=0;while(k<32&&w->castKey[k]!=cast)k++;
    if(k==32){k=w->cursor++%32;w->castKey[k]=cast;w->castDamage[k]=0;}
    w->castDamage[k]+=h;if(w->castDamage[k]>=180)w->out[3]=1;}
  if(!guarded&&h){
    int *s=w->strings[i];if(!b->comboHits||s[2]!=w->round||!s[0]){s[0]=0;s[1]=w->frame;s[2]=w->round;s[3]=0;}
    s[0]+=h;s[3]|=slot==ULT;
    if(!s[3]&&s[0]>(int)w->out[4]){
      w->out[4]=s[0];w->out[5]=s[1];w->out[6]=w->frame;w->out[7]=i;w->out[8]=w->round;
    }
  }
  b->hp-=h;
  w->stop=fmax(w->stop,guarded?.04:style==LIGHT?.05:style==FINISH?.1:style==ULTIMATE?.16:.075);
  if(guarded)b->blockFlash=.25;
  if(crushed||!guarded){
    b->subWindow=.53;if(!b->move.fired)b->move.type=NONE;
    b->chain=0;b->chainStep=0;
    if(crushed){b->guard=0;b->crush=.8;b->stun=.75;b->recoil=dir*120;w->stop=fmax(w->stop,.14);}
    else{
      b->comboHits++;b->recoil=dir*(style==LIGHT?55:style==ULTIMATE?410:style==FINISH?245:175);
      if(b->knock)b->vy=fmin(b->vy,-160.);
      else if(style==FINISH||style==ULTIMATE||b->comboHits>=6){b->knock=1;b->vy=fmin(b->vy,style==ULTIMATE?-375.:style==FINISH?-325.:-260.);b->stun=9;b->move.type=NONE;b->guard=0;}
      else{b->stun=style==LIGHT?.31:.38;if(style==SKILL)b->vy=fmin(b->vy,-100.);}
    }
  }
  return amount>0;
}
static inline int subOK(Fighter *f){return f->hp>0&&f->subWindow>0&&!f->inv&&!f->subCd&&f->energy>=1;}
static inline void drive(World *w,int i,CFG kits){
  Fighter *f=&w->f[i],*e=&w->f[1-i];CFG kit=kits+f->id*12;
  double dx=fabs(e->x-f->x),dz=e->z-f->z;int toward=e->x>f->x?1:-1,same=fabs(dz)<26;
  f->dx=f->dz=f->holding=f->subArmed=0;
  if(subOK(f)&&roll(w)<(.22+.2)){f->subArmed=1;f->queue[SUB]=.20;}
  if(!(f->stun||f->knock||f->down||f->getup)){
    int incoming=0;
    for(int j=0;j<w->nshot;j++){Shot *p=&w->shots[j];if(p->owner!=i&&(f->x-p->x)*p->dir>0&&fabs(f->x-p->x)<260&&fabs(f->z-p->z)<=24){incoming=1;break;}}
    int melee=e->move.type&&!e->move.fired&&e->move.type!=EVADE&&dx<(e->move.type==ULT?320:200)&&same;
    if((melee||incoming)&&!f->crush){
      double r=roll(w);
      if(r<.22){f->holding=1;goto wait;}
      if(r<.22+.08){f->dz=fabs(f->z+36)>20?-1:1;f->queue[EVADE]=.2;goto wait;}
      if(incoming&&r<.22+.08+.15){f->queue[JUMP]=.2;goto wait;}
    }
    if(fabs(dz)>8)f->dz=dz<0?-1:1;
    if(dx>130&&roll(w)>.85){if(roll(w)<.4)f->dx=-toward;goto wait;}
    if(dx>75)f->dx=toward;
    if(f->energy==4&&dx<(kit[8]==VOLLEY?495:265)&&same&&roll(w)<.6)f->queue[ULT]=.2;
    else{
      int first=roll(w)<.5?0:1;
      for(int j=0;j<2;j++){
        int s=first^j,k=(int)kit[s*4];int usable=k==HEAL?f->hp<180*.86:k==SHIELD?dx<148:k==PROJECTILE?dx<600&&fabs(dz)<20:k==BURST?dx<145&&fabs(dz)<28:dx<210&&fabs(dz)<22;
        if(!f->cd[s]&&usable&&roll(w)<.65){f->queue[s+SK1]=.2;break;}
      }
      if(dx<106&&fabs(dz)<23&&roll(w)<.85)f->queue[ATT]=.2;
    }
  }
wait:
  f->think=.12+roll(w)*(.22-.12);
}
static inline void advanceFighter(World *w,int i,CFG kits,Move *ready){
  Fighter *f=&w->f[i],*e=&w->f[1-i];CFG kit=kits+f->id*12;
  int crushed=f->crush>0;f->cd[0]=decay(f->cd[0]);f->cd[1]=decay(f->cd[1]);f->subCd=decay(f->subCd);f->subWindow=decay(f->subWindow);
  f->shield=decay(f->shield);f->inv=decay(f->inv);f->evadeCd=decay(f->evadeCd);f->chain=decay(f->chain);f->blockFlash=decay(f->blockFlash);f->crush=decay(f->crush);
  if(crushed&&!f->crush)f->guardHp=fmax(f->guardHp,60.);
  if(!f->knock)f->stun=decay(f->stun);
  if(f->down>0){f->down=decay(f->down);f->stun=fmax(f->stun,f->down+.34);if(!f->down){f->getup=.34;f->inv=.34+.18;}}
  else if(f->getup>0){f->getup=decay(f->getup);f->stun=fmax(f->stun,f->getup);if(!f->getup)f->stun=0;}
  if(!f->stun&&!f->knock&&!f->down&&!f->getup)f->comboHits=0;
  if(!f->crush)f->guardHp=fmin(100.,f->guardHp+(f->guard&&!f->blockFlash?12:f->guard?0:30)*DT);
  if(!f->move.type&&!f->knock&&!f->down&&fabs(e->x-f->x)>1)f->dir=e->x>=f->x?1:-1;
  if(!f->knock&&!f->down&&!f->getup&&(f->queue[SUB]||f->subArmed)&&subOK(f)){
    int side=e->dir;double behind=arena(e->x-side*67);if(fabs(behind-e->x)<52)e->x=behind+side*52;
    f->x=behind;f->z=e->z;f->y=326;f->vy=f->recoil=f->stun=f->subWindow=f->chain=0;
    f->dir=e->x>f->x?1:-1;f->move.type=f->guard=f->chainStep=f->subArmed=0;
    for(int j=0;j<8;j++)f->queue[j]=0;
    f->energy--;f->subCd=12;f->inv=.72;
  }
  int grounded=f->y>=325&&f->vy>=0;
  f->guard=!f->move.type&&!f->stun&&!f->crush&&grounded&&f->holding;
  int dx=f->guard||f->stun?0:f->dx,dz=f->guard||f->stun?0:f->dz;
  int cancel=f->move.type==ATT&&f->move.hit&&f->move.t>f->move.wind+.034;
  if(!f->stun&&(!f->move.type||cancel)){
    if(!f->move.type&&grounded&&f->queue[JUMP]){f->vy=-520;f->queue[JUMP]=0;f->guard=0;}
    int type=f->queue[ULT]&&f->energy==4?ULT:f->queue[SK1]&&!f->cd[0]?SK1:f->queue[SK2]&&!f->cd[1]?SK2:f->queue[ATT]&&(!f->move.type||f->move.stage!=3)?ATT:NONE;
    if(type){
      int stage=type==ATT&&f->chain>0?(f->chainStep>=2?3:f->chainStep+1):1;
      double wind=stage==3?.095:.065,recovery=stage==3?.27:.17;
      if(type!=ATT){wind=(type==ULT?.18:.095)+kit[(type-SK1)*4+3];recovery=type==ULT?.47:.23;}
      Move m={0};m.type=type;m.stage=stage;m.dir=f->dir;m.wind=wind;m.duration=wind+recovery;m.id=w->frame*2+i+1;
      f->move=m;f->queue[type]=0;f->guard=0;f->subWindow=0;w->out[10+i*4+type-1]++;
      if(type==ATT){f->shield=0;f->chainStep=stage;}else{f->chainStep=0;f->chain=0;if(type==ULT)f->energy-=4;else f->cd[type-SK1]=kit[(type-SK1)*4+2];}
    }else if(!f->move.type&&f->queue[EVADE]&&grounded&&!f->evadeCd){
      Move m={0};m.type=EVADE;m.dir=dx?dx:f->dir;m.duration=.26;f->move=m;f->queue[EVADE]=0;f->guard=0;f->evadeCd=.62;
    }
  }
  double rate=f->move.type?(f->move.type==ULT?0.:.16):1.,diagonal=dx&&dz?.7071067811865476:1.;
  double travel=dx*278*rate*diagonal*DT;f->z=bound(f->z+dz*116*rate*diagonal*DT,-36,40);
  if(f->move.type==EVADE){
    double stride=fmin(DT,fmax(0.,.13-f->move.t))*670,gap=(e->x-f->x)*f->move.dir;
    travel=f->move.dir*(gap>=0&&aligned(f,e,16)?fmin(stride,fmax(0.,gap-51)):stride);
  }
  f->x=arena(f->x+travel+f->recoil*DT);f->recoil*=.8187307530779818;
  int airborne=f->y<325;f->vy+=1340*DT;f->y+=f->vy*DT;
  if(f->y>=326){f->y=326;f->vy=0;if(f->knock&&airborne){f->knock=0;f->down=.55;f->stun=.55+.34;f->recoil*=.4;}}
  if(f->knock&&!airborne&&f->vy>=0&&f->y>=326){f->knock=0;f->down=.55;f->stun=.55+.34;}
  if(f->move.type){
    f->move.t+=DT;
    if(f->move.type!=EVADE&&!f->move.fired&&f->move.t>=f->move.wind){f->move.fired=1;*ready=f->move;}
    if(f->move.t>=f->move.duration)f->move.type=NONE;
  }
  for(int j=ATT;j<=SUB;j++)f->queue[j]=decay(f->queue[j]);
}
static inline Shot projectile(Fighter *f,Move m,int power){
  Shot p={0};p.owner=f->seat;p.dir=m.dir;p.power=power;p.ult=m.type==ULT;p.slot=m.type;p.labId=m.id;
  p.role=f->id!=1;p.style=p.ult?ULTIMATE:SKILL;p.x=f->x+m.dir*30;p.y=f->y+f->z-59;p.z=f->z;
  p.life=1.48;p.speed=565;p.radius=37;p.width=21;p.push=-1;return p;
}
static inline void spawnShot(World *w,Shot p){
  if(w->nshot<SHOTS)w->shots[w->nshot++]=p;else w->fail=1;
}
static inline void eraseShot(World *w,int j){for(int k=j+1;k<w->nshot;k++)w->shots[k-1]=w->shots[k];w->nshot--;}
static inline void releaseMove(World *w,int i,Move m,CFG kits){
  Fighter *f=&w->f[i],*e=&w->f[1-i];int dir=m.dir,s=m.type,ult=s==ULT,slot=f->move.type;
  double gap=(e->x-f->x)*dir,dy=fabs(e->y-f->y);int hit=0;
  if(s==ATT){
    int third=m.stage==3;
    if(gap>=-10&&gap<=(third?119:102)&&aligned(f,e,19)&&dy<82)hit=land(w,i,third?9:m.stage==2?6:5,dir,third?FINISH:LIGHT,slot,m.id);
    f->chain=third?0:.67;
  }else{
    int power=(int)kits[f->id*12+(s-SK1)*4+1],side=e->x>=f->x?1:-1;
    Shot p=projectile(f,m,power);
    switch(f->id){
    case 0: // DeepSeek
      if(ult||s==SK1){if(gap>=-12&&gap<=(ult?300:213)&&aligned(f,e,26)&&dy<100)hit=land(w,i,power,dir,ult?ULTIMATE:SKILL,slot,m.id);f->x=arena(f->x+dir*(ult?181:177));}
      else if(fabs(e->x-f->x)<151&&aligned(f,e,30)&&dy<95){hit=land(w,i,power,side,SKILL,slot,m.id);if(hit&&!(e->guard&&e->dir==-side)&&!e->shield)e->recoil=side*310;}
      break;
    case 1: // Claude uses the original engine's generic projectile and dash.
      if(s==SK2){f->x=arena(f->x+dir*177);if(gap>=-9&&gap<=213&&aligned(f,e,22)&&dy<83)hit=land(w,i,power,dir,SKILL,slot,m.id);}
      else{p.slot=0;if(ult){p.x=f->x+dir*22;p.y=f->y+f->z-57;p.width=33;p.speed=830;p.life=.65;}spawnShot(w,p);}
      break;
    case 2: // ChatGPT
      if(ult){if(gap>=-12&&gap<=300&&aligned(f,e,34)&&dy<100)hit=land(w,i,power,dir,ULTIMATE,slot,m.id);f->x=arena(f->x+dir*181);}
      else if(s==SK1){f->shield=1.1;f->earned=0;}
      else{int empowered=f->shield>0&&f->earned;if(fabs(e->x-f->x)<(empowered?175:145)&&aligned(f,e,30)&&dy<95)hit=land(w,i,power+(empowered?6:0),side,SKILL,slot,m.id);if(empowered){f->shield=0;f->earned=0;}}
      break;
    case 3: // Gemini
      if(s==SK2){f->z=bound(f->z+(f->z>0?-24:24),-36,40);if(gap>=-12&&gap<=213&&aligned(f,e,25)&&dy<100)hit=land(w,i,power,dir,SKILL,slot,m.id);f->x=arena(f->x+dir*151);}
      else for(int j=0;j<(ult?4:2);j++){
        p.z=f->z+(ult?(j%2?12:-12):(j?9:-9));p.y=f->y+p.z-59;
        p.power=ult?(j==3?power-3*(power/4):power/4):(j?power/2:(power+1)/2);
        p.life=ult?.9:1.48;p.delay=ult?j*.10:j*.12;p.speed=ult?700:530;p.radius=ult?24:18;
        if(ult){p.push=j==3?410:0;p.style=j==3?ULTIMATE:LIGHT;}spawnShot(w,p);
      }break;
    case 4: // Grok
      if(s==SK1){double travel=aligned(f,e,22)&&dy<83&&gap>=0?fmin(166.,fmax(0.,gap-100)):166.;
        f->x=arena(f->x+dir*travel);if(gap>=-12&&gap<213&&aligned(f,e,22)&&dy<83)hit=land(w,i,power,dir,SKILL,slot,m.id);}
      else for(int j=0;j<2;j++){
        if(ult){p.speed=j?670:760;p.life=j?.5:.48;p.radius=j?36:32;p.power=j?12:20;p.delay=j*.18;}
        else{p.x=f->x+dir*42;p.speed=0;p.life=.08;p.radius=104;p.width=29;p.power=(int)(j?floor(power*.4):ceil(power*.6));p.delay=j*.16;}
        spawnShot(w,p);
      }break;
    case 5: // Kimi
      if(s==SK1){p.speed=430;p.life=1.65;p.radius=22;spawnShot(w,p);}
      else if(s==SK2){int before=w->nshot;for(int j=w->nshot-1;j>=0;j--){Shot q=w->shots[j];if(q.owner!=i&&fabs(q.x-f->x)<132&&fabs(q.z-f->z)<30)eraseShot(w,j);}
        p.missingTrace=before>w->nshot;p.speed=330;p.life=1.4;p.back=.6;p.power=7;p.radius=24;spawnShot(w,p);}
      else for(int j=0;j<3;j++){p.speed=450;p.delay=j*.16;p.life=1.3;p.power=10;p.radius=24;p.z=f->z+(j-1)*18;p.width=16;spawnShot(w,p);}break;
    case 6: // Doubao
      if(s==SK2){f->shield=1.05;f->earned=0;}
      else for(int j=0;j<(ult?3:1);j++){p.speed=ult?330+j*70:350;p.delay=j*.22;p.life=ult?1.5:1.8;p.radius=26;p.power=ult?10:power;spawnShot(w,p);}break;
    case 7: // MiniMax
      if(s==SK2){f->shield=1.05;f->earned=0;}
      else for(int j=0;j<3;j++){
        if(ult){p.delay=j*.14;p.speed=650;p.life=.9;p.power=10;p.style=j<2?LIGHT:ULTIMATE;p.push=j<2?0:410;}
        else{p.x=f->x;p.speed=0;p.delay=j*.12;p.life=.10;p.radius=125;p.width=30;p.power=j==2?7:6;}spawnShot(w,p);
      }break;
    case 8: // GLM
      if(s==SK1){f->shield=1.05;f->earned=0;}
      else for(int j=0;j<(ult?3:1);j++){p.speed=ult?600:465;p.life=ult?1:1.4;p.power=ult?10:14;p.delay=j*.18;p.stun=ult?.42:.38;
        if(ult){p.style=j<2?LIGHT:ULTIMATE;p.push=j<2?0:410;}spawnShot(w,p);}break;
    case 9: // Qwen
      if(s==SK1){f->x=arena(f->x+dir*177);if(gap>=-9&&gap<=213&&aligned(f,e,22)&&dy<83)hit=land(w,i,15,dir,SKILL,slot,m.id);}
      else{p.speed=ult?620:520;p.life=ult?1.15:.82;p.back=ult?.48:.34;p.power=ult?15:8;spawnShot(w,p);}break;
    }
    if(hit&&!ult)charge(f);
  }
  if(f->move.id==m.id)f->move.hit=hit;
}
static inline void projectiles(World *w){
  for(int j=w->nshot-1;j>=0;j--){
    Shot *p=&w->shots[j];Fighter *e=&w->f[1-p->owner],*a=&w->f[p->owner];
    if(p->delay>0){p->delay=decay(p->delay);continue;}
    p->age+=DT;if(p->back&&!p->returned&&p->age>=p->back){p->returned=1;p->dir*=-1;p->leg=0;}
    p->x+=DT*p->speed*p->dir;
    if(p->back&&!p->returned&&(p->x<0||p->x>960)){p->x=bound(p->x,0,960);p->returned=1;p->dir*=-1;p->leg=0;}
    p->life-=DT;double sy=e->y+e->z;
    if(!p->leg&&fabs(e->x-p->x)<p->radius&&fabs(e->z-p->z)<=p->width&&p->y>sy-108&&p->y<sy-9){
      int protectedHit=e->shield>0||(e->guard&&e->dir==-p->dir);
      int hit=land(w,p->owner,p->power,p->dir,p->style,p->slot?p->slot:a->move.type,p->missingTrace?(a->move.type?a->move.id:0):p->labId);
      if(hit&&!p->ult&&!p->charged){
        charge(a);if(p->role)for(int k=0;k<w->nshot;k++)if(w->shots[k].labId==p->labId)w->shots[k].charged=1;
      }
      if(hit&&!protectedHit){if(p->stun)e->stun=fmax(e->stun,p->stun);if(p->push>=0)e->recoil=p->dir*p->push;}
      if(p->back)p->leg=1;else{eraseShot(w,j);continue;}
    }
    int margin=p->role?80:30;if(p->life<=0||p->x< -margin||p->x>960+margin)eraseShot(w,j);
  }
}
static inline void step(World *w,CFG kits){
  w->frame++;
  Fighter *a=&w->f[0],*b=&w->f[1];
  if(w->ending){
    w->endingAge+=DT;
    if(w->endingAge>=2.2){
      if(a->hp!=b->hp)w->wins[a->hp>b->hp?0:1]++;
      if(w->wins[0]>=2||w->wins[1]>=2||w->round>=5){w->done=1;w->out[0]=w->wins[0]==w->wins[1]?0:w->wins[0]>w->wins[1]?1:2;}
      else resetRound(w,a->id,b->id,a->energy>2?a->energy:2,b->energy>2?b->energy:2);
    }return;
  }
  if(w->stop>0&&w->countdown<=0){w->stop=decay(w->stop);return;}
  if(w->countdown>0){w->countdown-=DT;return;}
  for(int i=0;i<2;i++){w->f[i].think-=DT;if(w->f[i].think<=0)drive(w,i,kits);}
  Move ready[2]={{0},{0}};
  for(int i=0;i<2;i++)advanceFighter(w,i,kits,&ready[i]);
  for(int i=0;i<2;i++)if(ready[i].type)releaseMove(w,i,ready[i],kits);
  if(aligned(a,b,14)&&fabs(a->y-b->y)<73){
    double gap=b->x-a->x,overlap=51-fabs(gap);
    if(overlap>0){int side=gap==0?a->dir:gap>0?1:-1;a->x=arena(a->x-side*overlap/2);b->x=arena(a->x+side*51);a->x=arena(b->x-side*51);}
  }
  projectiles(w);w->left=decay(w->left);w->clock++;
  int timeout=w->left<=.0001;
  if(timeout||!a->hp||!b->hp){
    int gap=w->clock-w->lastHit;if(gap>w->roundGap)w->roundGap=gap;
    if(w->roundGap>(int)w->out[9])w->out[9]=w->roundGap;
    int off=30+6*(w->round-1);w->out[off]=w->clock;w->out[off+1]=a->hp;w->out[off+2]=b->hp;w->out[off+3]=w->frame;
    w->out[off+4]=w->roundGap;w->out[off+5]=timeout&&a->hp&&b->hp;w->out[2]=w->round;
    mix(w,w->clock);mix(w,a->hp);mix(w,b->hp);w->ending=1;w->endingAge=0;w->stop=0;w->nshot=0;
  }
}
#if !defined(CPU_TEST) || defined(SLOT_TEST)
__kernel void stateSize(__global uint *bytes){bytes[0]=(uint)sizeof(World);}
// ctrl: next queued match, number of completed records, error flag.
static uint claimJob(volatile __global uint *cursor,uint end){
  uint observed=atomic_add(cursor,0u);
  while(observed<end){
    uint previous=atomic_cmpxchg(cursor,observed,observed+1);
    if(previous==observed)return observed;
    observed=previous;
  }
  return end;
}
__kernel void simulate(__global World *states,__global const uint *tasks,CFG kits,
                       __global uint *records,__global uint *assigned,volatile __global uint *ctrl,int ticks,int end){
  uint slot=(uint)get_global_id(0),current=assigned[slot];
  World w;
  if(current)w=states[slot];
  for(int n=0;n<ticks;n++){
    if(!current){
      uint job=claimJob(ctrl,(uint)end);
      if(job==(uint)end)break;
      current=job+1;
      begin(&w,(int)tasks[3*job],(int)tasks[3*job+1],tasks[3*job+2]);
    }
    step(&w,kits);
    if(w.fail||(!w.done&&w.frame>=65000)){atomic_or(ctrl+2,1u);break;}
    if(w.done){
      uint offset=atomic_inc(ctrl+1)*(WORDS+2);
      records[offset]=current-1;records[offset+1]=slot;
      for(int k=0;k<WORDS;k++)records[offset+2+k]=w.out[k];
      current=0;
    }
  }
  assigned[slot]=current;
  if(current)states[slot]=w;
}
#endif
