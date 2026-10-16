import {NativeEditorCanvas} from './NativeEditorCanvas';
import React from 'react';
import {Video, OffthreadVideo, useRemotionEnvironment, staticFile, AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
import type {PreparedEditProps} from '../prepared-edit/PreparedEdit';
import {NativeCaptionTrack} from './NativeCaptionTrack';
import {NativeOperations} from './NativeOperations';
import {VisualStory} from './VisualStory';

// Statement titles and draft captions share this native-aspect preview.
// The source video remains uncropped and its audio is left intact.
export const NativeAspectPreview: React.FC<PreparedEditProps> = ({plate,edit}) => {
 const frame=useCurrentFrame();const {width,height}=useVideoConfig();
 const {isRendering}=useRemotionEnvironment();
 const inset=edit?.nativeOperations?.find(o=>o.kind==='inset'&&frame>=o.fromFrame&&frame<o.toFrame);
 const scale=inset?interpolate(frame,[inset.fromFrame,inset.toFrame-1],[.94,1],{extrapolateRight:'clamp'}):1;
 const volume=edit?.nativeOperations?.find(o=>o.kind==='gain')?.value??1;
 const scene=edit?.scenes.find(s=>s.family==='statement'&&frame>=s.fromFrame&&frame<s.fromFrame+s.durationInFrames);
 const data=scene?.data as {kicker:string;title:string}|undefined;
 const local=scene?frame-scene.fromFrame:0;
 const fade=scene?interpolate(local,[0,6,Math.max(7,scene.durationInFrames-8),scene.durationInFrames],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):0;
 return <AbsoluteFill style={{background:'#000'}}>
    {edit?.nativeEditor&&plate?<NativeEditorCanvas edit={edit} src={plate.src} volume={volume} insetScale={scale}/>:<AbsoluteFill style={{transform:`scale(${scale})`}}>{plate ? (isRendering ? <OffthreadVideo muted src={staticFile(plate.src)} style={{width:'100%',height:'100%',objectFit:'contain'}} /> : <Video volume={volume} src={staticFile(plate.src)} style={{width:'100%',height:'100%',objectFit:'contain'}} />) : null}</AbsoluteFill>}
    {edit?<NativeOperations edit={edit}/>:null}
    {scene&&data?<div dir="rtl" style={{position:'absolute',left:width*.04,bottom:height*.08,width:width*.32,padding:width*.014,borderRadius:width*.009,background:'rgba(8,23,30,.91)',borderInlineStart:`${width*.003}px solid #f4bc56`,color:'#fff',fontFamily:'Arial, sans-serif',opacity:fade}}>
      <div style={{fontSize:width*.011,color:'#f4bc56',marginBottom:height*.015}}>{data.kicker}</div>
      <div dir={/[\u0600-\u06ff]/.test(data.title)?'rtl':'ltr'} style={{display:'flex',flexWrap:'wrap',gap:width*.006,fontSize:width*.034,fontWeight:700,lineHeight:1.5}}>{data.title.split(/\s+/).map((word,i)=>{const p=interpolate(local-(scene.motion==='stagger'?i*5:0),[0,12],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <span key={i} style={{display:'inline-block',opacity:p,transform:`translateY(${(1-p)*height*.025}px)`}}>{word}</span>})}</div>
    </div>:null}
    {edit?.visualStory?<VisualStory edit={edit}/>:edit?.captions.words.length?<NativeCaptionTrack edit={edit}/>:null}
    {edit?.captions.words.length&&edit.captions.status==='draft'?<div dir="rtl" style={{position:'absolute',top:height*.025,left:width*.025,color:'#ffe08a',background:'rgba(0,0,0,.75)',padding:'8px 14px',fontFamily:'Arial',fontSize:width*.012}}>مسودة غير معتمدة سمعيًا</div>:null}
  </AbsoluteFill>;
};
