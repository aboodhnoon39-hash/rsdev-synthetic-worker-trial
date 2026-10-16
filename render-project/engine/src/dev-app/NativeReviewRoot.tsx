import {Composition, registerRoot} from 'remotion';
import {NativeAspectPreview} from '../review-editor/NativeAspectPreview';
import {compileEdit} from '../prepared-edit/timeline';
import {editManifestSchema} from '../prepared-edit/schema';
const Root=()=> <Composition id="NativeReview" component={NativeAspectPreview} width={1920} height={1080} fps={30} durationInFrames={90} defaultProps={{edit:null,plate:null,guides:false}} calculateMetadata={({props})=>{const edit=editManifestSchema.parse(props.edit);return {width:edit.source.width,height:edit.source.height,fps:edit.source.fps,durationInFrames:compileEdit(edit).durationInFrames};}}/>;
registerRoot(Root);
