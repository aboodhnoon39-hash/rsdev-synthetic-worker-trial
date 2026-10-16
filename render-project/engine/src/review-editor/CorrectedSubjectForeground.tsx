import React,{useEffect,useMemo,useState} from 'react';
import {AbsoluteFill,delayRender,continueRender,cancelRender,staticFile} from 'remotion';
import type {NativeLayer} from '../prepared-edit/native-editor';
export const CorrectedSubjectForeground:React.FC<{mask:NonNullable<NativeLayer['subjectMask']>;frame:number;width:number;height:number;style:React.CSSProperties;children:React.ReactNode}>=({mask,frame,width,height,style,children})=>{
 const file=staticFile(mask.prefix+'/mask-'+String(frame-mask.fromFrame).padStart(6,'0')+'.png'),corrections=(mask.corrections??[]).filter(c=>frame>=c.fromFrame&&frame<c.toFrame),key=file+JSON.stringify(corrections),handle=useMemo(()=>delayRender('Subject mask corrections'),[key]),[ready,setReady]=useState({key:'',url:''});
 useEffect(()=>{let active=true;const image=new Image();image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,width,height);for(const c of corrections){ctx.globalCompositeOperation=c.mode==='exclude'?'destination-out':'source-over';ctx.fillStyle='#fff';ctx.fillRect(c.x*width,c.y*height,c.width*width,c.height*height);}if(active)setReady({key,url:canvas.toDataURL('image/png')});}catch(e){cancelRender(e);}};image.onerror=()=>cancelRender(new Error('Cannot read local subject mask'));image.src=file;return()=>{active=false;continueRender(handle);};},[key,width,height,handle]);
 useEffect(()=>{if(ready.key===key)continueRender(handle);},[ready,key,handle]);
 return <AbsoluteFill style={{...style,maskImage:'url("'+(ready.key===key?ready.url:file)+'")',WebkitMaskImage:'url("'+(ready.key===key?ready.url:file)+'")',maskSize:'100% 100%',WebkitMaskSize:'100% 100%'}}>{children}</AbsoluteFill>;
};
