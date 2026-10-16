// One source track follows each clip's trim, order, speed and gain.
export function nativeAudioFilter(edit,masterGain=1,assetInputs={}){
 const clips=edit.nativeEditor?.clips??edit.segments.map(s=>({...s,speed:1,gain:1})),fps=edit.source.fps;
 const tracks=(edit.nativeEditor?.mediaTracks??[]).filter(t=>t.kind==='audio'&&!t.muted);const chains=clips.map((c,i)=>`[1:a:0]atrim=start=${c.fromFrame/fps}:end=${c.toFrame/fps},asetpts=PTS-STARTPTS,atempo=${c.speed},volume=${c.gain},aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${Math.ceil((c.toFrame-c.fromFrame)/c.speed)/fps}[a${i}]`);
 chains.push(clips.map((_,i)=>`[a${i}]`).join('')+`concat=n=${clips.length}:v=0:a=1,volume=${masterGain}[${tracks.length?'basevoice':'voice'}]`);
 for(const [i,t] of tracks.entries())chains.push(`[${t.assetId?assetInputs[t.assetId]:1}:a:0]atrim=start=${t.fromFrame/fps}:end=${t.toFrame/fps},asetpts=PTS-STARTPTS,volume=${t.gain*masterGain},aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(t.editFrom/fps*1000)}:all=1[overlay${i}]`);if(tracks.length)chains.push('[basevoice]'+tracks.map((_,i)=>`[overlay${i}]`).join('')+`amix=inputs=${tracks.length+1}:duration=first:normalize=0[voice]`);
 return chains.join(';');
}

export function nativeAudioUnchanged(edit,masterGain=1){const c=edit.nativeEditor?.clips;return !(edit.nativeEditor?.mediaTracks??[]).some(t=>t.kind==='audio'&&!t.muted)&&masterGain===1&&(!c||c.every((clip,i)=>clip.fromFrame===(i===0?0:c[i-1].toFrame)&&clip.speed===1&&clip.gain===1)&&c.at(-1)?.toFrame===edit.source.totalFrames);}
