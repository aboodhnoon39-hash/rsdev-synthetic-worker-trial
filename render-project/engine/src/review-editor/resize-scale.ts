// Project a drag onto a corner diagonal. Scale stays uniform and bounded.
export function resizeScale(scale:number,dx:number,dy:number,width:number,height:number,sx:number,sy:number){
 if(width<=0||height<=0)return scale;
 return Math.max(.1,Math.min(4,scale+2*(dx*sx*width+dy*sy*height)/(width*width+height*height)));
}
