import {transformAt,type NativeClip,type Transform} from './native-editor.ts';
/** Keep the exact existing easing interval; resampling or resetting easing would change the motion. */
export function sliceAnimation(element:{transform:Transform;keys:NativeClip['keys']},from:number,to:number){
 if(to<=from)throw Error('مدى حركة غير صالح.');
 if(!element.keys.length)return {transform:{...element.transform},keys:[] as NativeClip['keys']};
 const points=[from,...element.keys.map(k=>k.atFrame).filter(f=>f>from&&f<to),to];
 const keys:NativeClip['keys']=points.map((point,index)=>{
  const transform=transformAt(element,point),key:NativeClip['keys'][number]={atFrame:point-from,ease:'linear',transform};
  if(index===0)return key;
  const start=points[index-1],destination=element.keys.find(k=>k.atFrame>=point),previous=destination?element.keys[element.keys.indexOf(destination)-1]:undefined;
  if(previous&&destination&&start>=previous.atFrame&&point<=destination.atFrame){
   key.ease=destination.ease;const lo=destination.easeRange?.from??0,hi=destination.easeRange?.to??1,span=destination.atFrame-previous.atFrame;
   const range={from:lo+(hi-lo)*(start-previous.atFrame)/span,to:lo+(hi-lo)*(point-previous.atFrame)/span};
   if(range.from!==0||range.to!==1)key.easeRange=range;
  }
  return key;
 });
 return {transform:transformAt(element,from),keys};
}

