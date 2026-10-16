import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import type {EditManifest} from '../prepared-edit/schema';
import {compileEdit} from '../prepared-edit/timeline';

// Shares the editor's source-to-timeline mapping. Draft status never approves text.
export const NativeCaptionTrack:React.FC<{edit:EditManifest}>=({edit})=>{
 const frame=useCurrentFrame(),{width,height}=useVideoConfig();
 const compiled=React.useMemo(()=>compileEdit(edit),[edit]);
 const cue=compiled.captionGroups.find(c=>frame>=c.fromFrame&&frame<c.toFrame);
 if(!cue)return null;
 return <div dir="rtl" data-native-caption="true" style={{position:'absolute',bottom:height*.04,left:width*.08,right:width*.08,textAlign:'center',fontFamily:edit.fontFamily??'Arial, sans-serif',fontSize:width*.026,fontWeight:700,lineHeight:1.5,pointerEvents:'none'}}>
  <div style={{display:'inline-block',background:edit.captions.presentation==='minimal'?'transparent':'rgba(0,0,0,.82)',textShadow:'0 2px 5px #000',padding:'8px 18px',borderRadius:edit.captions.presentation==='ink-strip'?0:12,color:'#fff'}}>
   {cue.words.map((w,i)=><React.Fragment key={w.sourceIndex}>{i>0?' ':null}<span style={{color:frame>=w.fromFrame&&frame<w.toFrame?'#ffe08a':'#fff'}}>{w.text.trim()}</span></React.Fragment>)}
  </div>
  {edit.captions.status==='draft'?<div style={{fontSize:width*.009,color:'#ffe08a'}}>كابشن تجريبي غير معتمد</div>:null}
 </div>;
};
