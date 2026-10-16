import React from 'react';
import {AbsoluteFill,interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import type {EditManifest} from '../prepared-edit/schema';
export const NativeOperations:React.FC<{edit:EditManifest}>=({edit})=>{
 const frame=useCurrentFrame();const {width,height}=useVideoConfig();
 return <AbsoluteFill style={{pointerEvents:'none'}}>{(edit.nativeOperations??[]).filter(o=>frame>=o.fromFrame&&frame<o.toFrame).map((o,i)=>{
 const p=(frame-o.fromFrame)/Math.max(1,o.toFrame-o.fromFrame-1);const pulse=Math.sin(Math.PI*p);
 if(o.kind==='circle')return <svg key={i} width={width} height={height}><circle cx={width*.85} cy={height*.25} r={width*.05*(.8+.2*pulse)} fill="none" stroke="#f4bc56" strokeWidth={width*.006} strokeDasharray={`${width*.32*p} ${width}`} opacity={pulse}/><circle cx={width*.85} cy={height*.25} r={width*.014} fill="#f4bc56" opacity={pulse}/></svg>;
 if(o.kind==='wipe')return <div key={i} style={{position:'absolute',top:0,bottom:0,width:width*.018,left:interpolate(p,[0,1],[-width*.03,width]),background:'rgba(244,188,86,.32)',filter:'blur(10px)'}}/>;
 return null;
 })}</AbsoluteFill>;
};
