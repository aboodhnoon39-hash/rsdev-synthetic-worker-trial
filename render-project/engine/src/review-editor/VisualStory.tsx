import React,{useEffect,useState} from 'react';
import {useCurrentFrame,staticFile,delayRender,continueRender,cancelRender,spring,useVideoConfig} from 'remotion';
import {loadFont} from '@remotion/fonts';
import type {EditManifest} from '../prepared-edit/schema';
const ink='#102c34',paper='#f5eddb',accent='#ffba62';
export const VisualStory:React.FC<{edit:EditManifest}>=({edit})=>{
 const f=useCurrentFrame(),{fps}=useVideoConfig();const [wait]=useState(()=>delayRender('Local Arabic design font'));
 useEffect(()=>{Promise.all(['arabic','latin'].map(sub=>loadFont({family:'Story Cairo',url:staticFile(`fonts/Cairo-${sub}-900.woff2`),weight:'900'}))).then(()=>continueRender(wait)).catch(cancelRender);},[wait]);
 const beat=edit.visualStory?.find(b=>f>=b.fromFrame&&f<b.toFrame);if(!beat)return null;
 const local=f-beat.fromFrame,d=beat.toFrame-beat.fromFrame,p=spring({frame:local,fps,config:{damping:19,stiffness:150,mass:.85}}),exit=Math.max(0,Math.min(1,(d-local)/10)),a=p*exit;
 const side=(right:boolean,w=440):React.CSSProperties=>({position:'absolute',top:220,[right?'right':'left']:70,width:w,color:paper,fontFamily:'Story Cairo',direction:'rtl',opacity:a,transform:`translate(${(1-p)*(right?100:-100)}px,${(1-exit)*30}px)`,filter:`blur(${(1-p)*5}px)`});
 const tag=<div style={{fontSize:22,letterSpacing:1,color:accent,marginBottom:12}}>تصميم تحريري · {beat.label}</div>;
 const card:React.CSSProperties={background:ink,padding:30,borderRadius:6,boxShadow:'12px 12px 0 rgba(245,237,219,.35)'};
 return <div data-visual-story={beat.kind} style={{position:'absolute',inset:0,pointerEvents:'none'}}>
 <div style={{position:'absolute',left:0,top:0,bottom:0,width:620,background:'linear-gradient(90deg,rgba(7,28,34,.75),transparent)',opacity:a*.8}}/>
 <div style={{position:'absolute',right:0,top:0,bottom:0,width:550,background:'linear-gradient(270deg,rgba(7,28,34,.65),transparent)',opacity:a*.7}}/>
 <div style={{position:'absolute',left:70,top:125,width:320,height:5,background:accent,transformOrigin:'left',transform:`scaleX(${Math.min(1,local/15)*exit})`}}/>
 {beat.kind==='greeting'?<>
 <div style={{...side(false),top:260}}>{tag}<div style={{fontSize:112,lineHeight:1.35,transform:`rotate(${(1-p)*-8}deg)`}}>{beat.value}</div><div style={{overflow:'hidden',fontSize:42}}><div style={{transform:`translateY(${(1-Math.min(1,Math.max(0,(local-7)/15)))*100}%)`}}>حكاية في عشر ثوانٍ</div></div></div>
 <div style={{...side(true,350),top:575,...card}}><div style={{color:accent,fontSize:20}}>01 / التعريف</div><div style={{fontSize:66,marginTop:8}}>{beat.label}</div><svg width="270" height="48"><path d="M5 30H260" stroke={accent} strokeWidth="4" strokeDasharray="255" strokeDashoffset={255*(1-Math.min(1,local/25))}/><path d="M230 8L260 30L230 46" fill="none" stroke={accent} strokeWidth="4"/></svg></div>
 </>:null}
 {beat.kind==='age'?<>
 <div style={{...side(true,380),top:240,...card}}>{tag}<div dir="ltr" style={{display:'flex',justifyContent:'center',height:245,overflow:'hidden',color:accent}}>{beat.value.split('').map((n,i)=><div key={i} style={{fontFamily:'Story Cairo',fontSize:190,lineHeight:'245px',transform:`translateY(${-(1-Math.min(1,Math.max(0,(local-i*4)/20)))*245}px)`}}>{n}</div>)}</div><div style={{fontSize:58,textAlign:'center'}}>سنة</div></div>
 <div style={{...side(false,370),top:420}}><div style={{fontSize:78,lineHeight:1.35}}>{beat.label}</div><svg width="350" height="100"><path d="M10 75H330M20 55V90M105 45V90M190 30V90M275 10V90" stroke={paper} strokeWidth="4"/><path d="M10 75H330" stroke={accent} strokeWidth="8" strokeDasharray="320" strokeDashoffset={320*(1-Math.min(1,local/35))}/></svg></div>
 </>:null}
 {beat.kind==='origin'||beat.kind==='residence'?<>
 <div style={{...side(false,410),top:230,...card}}>{tag}<div style={{fontSize:70,lineHeight:1.4}}>{beat.value}</div><svg width="340" height="250" viewBox="0 0 340 250"><path d="M10 220H330M30 220V100H100V220M125 220V25H200V220M225 220V75H300V220" fill="none" stroke={paper} strokeWidth="4" strokeDasharray="1300" strokeDashoffset={1300*(1-Math.min(1,local/30))}/>{[50,145,245].map((x,i)=><g key={x} fill={accent} opacity={Math.min(1,Math.max(0,(local-i*5-12)/10))}>{[110,140,170].map(y=><rect key={y} x={x} y={y} width="18" height="12"/>)}</g>)}</svg></div>
 <div style={{...side(true,390),top:400}}><div style={{fontSize:64,lineHeight:1.4}}>{beat.label}</div><svg width="360" height="160" viewBox="0 0 360 160"><path d="M25 130C90 130 80 25 175 30S250 130 335 45" fill="none" stroke={paper} strokeWidth="5" strokeDasharray="500" strokeDashoffset={500*(1-Math.min(1,local/32))}/><g transform={`translate(${25+310*Math.min(1,local/40)},${130-85*Math.min(1,local/40)})`}><path d="M0 -30C-30 -30 -35 0 0 30C35 0 30 -30 0 -30Z" fill={accent}/><rect x="-5" y="-10" width="10" height="10" fill={ink}/></g></svg><div style={{fontSize:20,color:accent}}>مسار رمزي، وليس خريطة جغرافية</div></div>
 </>:null}
 {beat.kind==='childhood'?<div style={{...side(false,410),top:320,...card}}>{tag}<div style={{fontSize:130,color:accent,lineHeight:1.3}}>{beat.value}<span style={{fontSize:45,color:paper}}> سنين</span></div><div style={{fontSize:36}}>{beat.label}</div><div style={{display:'flex',gap:12,marginTop:25}}>{Array.from({length:6},(_,i)=><div key={i} style={{height:55,width:35,background:local>i*3?accent:'#36525a',transform:`translateY(${local>i*3?0:25}px)`}}/>)}</div></div>:null}
 {beat.kind==='study'?<div style={{...side(true,420),top:260,...card}}>{tag}<div style={{fontSize:58,lineHeight:1.5}}>{beat.value}</div><svg width="350" height="200" viewBox="0 0 350 200"><rect x="15" y="15" width="320" height="145" rx="8" fill="none" stroke={paper} strokeWidth="5"/><path d="M100 55L65 87L100 120M250 55L285 87L250 120M200 48L150 125M175 160V182M100 185H250" stroke={accent} fill="none" strokeWidth="7" strokeDasharray="500" strokeDashoffset={500*(1-Math.min(1,local/25))}/></svg></div>:null}
 <div style={{position:'absolute',bottom:65,left:80,color:paper,fontFamily:'Story Cairo',fontSize:19}}>دراسة تصميم · الصوت الأصلي · 16:9</div>
 <div style={{position:'absolute',bottom:35,left:80,right:80,height:3,background:'rgba(255,255,255,.3)'}}><div style={{height:3,width:`${Math.min(100,f/300*100)}%`,background:accent}}/></div>
 </div>;
};
