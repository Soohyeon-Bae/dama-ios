// Pixel processing only. Originals remain untouched in IndexedDB.
async function canvasImage(blob){const image=await createImageBitmap(blob);const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);image.close();return canvas;}
function png(canvas){return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));}
function crop(canvas,x,y,width,height,scale=2,threshold=null){const out=document.createElement('canvas');out.width=Math.round(width*scale);out.height=Math.round(height*scale);const ctx=out.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(canvas,x,y,width,height,0,0,out.width,out.height);if(threshold!==null){const data=ctx.getImageData(0,0,out.width,out.height);for(let i=0;i<data.data.length;i+=4){const gray=data.data[i]*.299+data.data[i+1]*.587+data.data[i+2]*.114;const v=gray>=threshold?0:255;data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255;}ctx.putImageData(data,0,0);}return out;}
function meaningful(text){return text.split('\n').map(s=>s.trim()).filter(s=>{const ko=(s.match(/[가-힣]/g)||[]).length;const letters=(s.match(/[가-힣A-Za-z0-9]/g)||[]).length;return ko>=4&&ko/Math.max(1,letters)>.35;}).join('\n');}
export async function readImage(worker,blob,onPhase=()=>{}){
 await worker.setParameters({tessedit_pageseg_mode:3});
 const full=await worker.recognize(blob);
 const canvas=await canvasImage(blob),w=canvas.width,h=canvas.height;
 let supplemental='';
 // Tall phone captures can contain small poster text or captions over pictures.
 if(h/w>1.5){onPhase('사진 위 작은 글씨도 확인해요.');const strip=crop(canvas,w*.04,h*.56,w*.8,h*.16,2,175);await worker.setParameters({tessedit_pageseg_mode:6});const pass=await worker.recognize(await png(strip));supplemental=meaningful(pass.data.text);}
 // Keep high-confidence full document text. With noisy photo text, show caption lines first.
 const fullText=full.data.confidence<65?meaningful(full.data.text):full.data.text;
 const pieces=full.data.confidence<65?[supplemental,fullText]:[fullText,supplemental];
 const text=[...new Set(pieces.filter(Boolean).join('\n\n').split('\n').map(s=>s.trim()).filter(Boolean))].join('\n');
 return {text,fullText:full.data.text,confidence:full.data.confidence,preprocessed:!!supplemental};
}
