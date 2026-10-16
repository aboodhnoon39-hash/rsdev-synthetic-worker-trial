import React,{useMemo,useEffect,useId} from 'react';
import {loadFont} from '@remotion/fonts';
import {staticFile,delayRender,continueRender,cancelRender} from 'remotion';
import type {NativeLayer} from '../prepared-edit/native-editor';
const pending=new Map<string,Promise<void>>();
export const NativeTypography:React.FC<{layer:NativeLayer;frame:number}>=({layer,frame})=>{
 const t=layer.typography!,id=useId().replace(/:/g,''),arabic=/[\u0600-\u06ff]/u.test(layer.text),english=t.font==='IBMPlexMono'||t.font==='SourceSerif4';
 const handle=useMemo(()=>delayRender('تحميل الخط المحلي'),[t.font,t.weight]);
 useEffect(()=>{const key=t.font+'-'+t.weight;let p=pending.get(key);if(!p){const fonts=english?[{family:t.font,subset:'latin',weight:t.weight},{family:'Cairo',subset:'arabic',weight:700}]:['arabic','latin'].map(subset=>({family:t.font,subset,weight:t.weight}));p=Promise.all(fonts.map(f=>loadFont({family:f.family,url:staticFile(`fonts/${f.family}-${f.subset}-${f.weight}.woff2`),weight:String(f.weight),format:'woff2'}))).then(()=>{});pending.set(key,p);}p.then(()=>continueRender(handle)).catch(cancelRender);},[t.font,t.weight,handle,english]);
 const style:React.CSSProperties={display:'inline-block',fontFamily:`${t.font}, Cairo`,WebkitTextStroke:t.stroke+'px #101820',paintOrder:'stroke fill',textShadow:t.shadow?'0 3px 8px rgba(0,0,0,.7)':undefined,transform:`perspective(900px) rotateY(${t.perspectiveX??0}deg) rotateX(${t.perspectiveY??0}deg)`};
 if(t.curve){const width=Math.min(900,Math.max(300,layer.text.length*layer.fontSize*.65)),height=layer.fontSize*2+Math.abs(t.curve),base=layer.fontSize+Math.max(0,t.curve),path=`M 20 ${base} Q ${width/2} ${base-t.curve*2} ${width-20} ${base}`;return <span style={style}><svg width={width} height={height} style={{overflow:'visible'}}><defs><path id={id} d={path}/></defs><text fill={layer.color} direction={arabic?'rtl':'ltr'} textAnchor="middle" style={{fontFamily:style.fontFamily,fontSize:layer.fontSize,fontWeight:t.weight}}><textPath href={'#'+id} startOffset="50%">{layer.text}</textPath></text></svg></span>;}
 if(!t.words)return <span dir={arabic?'rtl':'ltr'} style={style}>{layer.text}</span>;
 return <span dir={arabic?'rtl':'ltr'} style={{...style,display:'inline-flex',flexWrap:'wrap',columnGap:'0.24em',rowGap:'0.08em',fontWeight:t.weight}}>{layer.text.trim().split(/\s+/u).map((word,i)=>{const p=Math.max(0,Math.min(1,(frame-i*t.staggerFrames)/8)),e=t.easing??'ease-out',eased=e==='linear'?p:e==='ease-in'?p*p:e==='smooth'?p*p*(3-2*p):1-(1-p)**2;return <React.Fragment key={i}><span style={{display:'inline-block',opacity:eased,transform:`translateY(${(1-eased)*18}px)`,color:word===t.highlight?t.highlightColor:undefined}}>{word}</span></React.Fragment>;})}</span>;
};
