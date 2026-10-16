import type {CSSProperties} from 'react';
import type {Transform} from './native-editor';
export type MediaTransition={kind:'dissolve'|'whip'|'blur';frames:number;direction:'left'|'right';window?:{from:number;duration:number}};
export function mediaTransitionStyle(t:MediaTransition|undefined,frame:number,duration:number,width:number,base:Transform):CSSProperties{
 if(!t)return {};
 if(t.window){frame+=t.window.from;duration=t.window.duration;}
 const n=Math.min(t.frames,Math.floor(duration/2));if(n<1)return {};
 const enter=Math.max(0,Math.min(1,frame/n)),leave=Math.max(0,Math.min(1,(duration-1-frame)/n));
 const smooth=(x:number)=>x*x*(3-2*x);const p=smooth(Math.min(enter,leave));
 if(t.kind==='dissolve')return {opacity:base.opacity*p};
 if(t.kind==='blur')return {opacity:base.opacity*p,filter:`blur(${(1-p)*24}px)`};
 const sign=t.direction==='right'?1:-1,offset=(enter<1?-(1-smooth(enter)):1-smooth(leave))*width*sign;
 return {opacity:base.opacity*p,filter:`blur(${(1-p)*12}px)`,transform:`translate(${base.x+offset}px,${base.y}px) rotate(${base.rotation}deg) scale(${base.scale})`};
}
