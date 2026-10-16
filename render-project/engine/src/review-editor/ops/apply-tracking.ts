import type {EditManifest} from '../../prepared-edit/schema.ts';
export type TrackingResult={sourceSHA256:string;sourceFPS?:number;trajectory:Array<{frame:number;x:number;y:number;features:number}>};
import {editManifestSchema} from '../../prepared-edit/schema.ts';
export function attachTracking(manifest:EditManifest,layerId:string,result:TrackingResult){
 const m=structuredClone(manifest),e=m.nativeEditor;
 if(!e||e.clips.length!==1||e.clips[0].fromFrame!==0||e.clips[0].speed!==1)throw Error('التتبع يحتاج مصدرًا كاملًا بلا قص أو تغيير سرعة.');
 if(result.sourceSHA256!==m.source.sha256)throw Error('مسار التتبع لا يخص المصدر الحالي.');
 if(result.sourceFPS!==undefined&&result.sourceFPS!==m.source.fps)throw Error('معدل إطارات التتبع لا يطابق المصدر.');
 const layer=e.layers.find(x=>x.id===layerId);if(!layer)throw Error('اختر طبقة موجودة.');
 if(layer.keys.length||layer.fromFrame!==0)throw Error('لن نستبدل حركة يدوية؛ اختر طبقة جديدة تبدأ من الصفر.');
 const rows=result.trajectory;if(!Array.isArray(rows)||rows.length<2||rows.length>72)throw Error('مسار تتبع غير مكتمل.');
 for(let i=0;i<rows.length;i++){const r=rows[i];if(r.frame!==i||!Number.isFinite(r.x)||!Number.isFinite(r.y)||!Number.isInteger(r.features)||r.features<5||r.frame>=layer.toFrame)throw Error('إطار تتبع غير صالح أو خارج الطبقة.');}
 const origin=rows[0];layer.keys=rows.map(r=>({atFrame:r.frame,ease:'linear' as const,transform:{...layer.transform,x:layer.transform.x+r.x-origin.x,y:layer.transform.y+r.y-origin.y}}));
 // The last sample holds; no invented tracking after the measured range.
 layer.toFrame=rows.length;
 return editManifestSchema.parse(m);
}
