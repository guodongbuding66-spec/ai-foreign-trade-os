const MIME_BY_EXT = new Map([
  ['pdf','application/pdf'],['jpg','image/jpeg'],['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']
]);
export const DOCUMENT_MEDIA_MIMES = new Set(['application/pdf','image/jpeg','image/png','image/webp']);
export const DEFAULT_DOCUMENT_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export function normalizeDocumentMediaMime(name='', mime=''){
  const raw=String(mime||'').toLowerCase().split(';')[0].trim();
  if(DOCUMENT_MEDIA_MIMES.has(raw))return raw;
  const ext=String(name||'').toLowerCase().split('.').pop();
  return MIME_BY_EXT.get(ext)||'';
}
export function documentMediaCapability(mime=''){
  const m=normalizeDocumentMediaMime('',mime);
  return m==='application/pdf'?'pdf':m.startsWith('image/')?'vision':'';
}
export function validateDocumentMedia(fileLike,maxBytes=DEFAULT_DOCUMENT_MEDIA_MAX_BYTES){
  const name=String(fileLike?.name||'').trim();
  const size=Number(fileLike?.size||0);
  const mime=normalizeDocumentMediaMime(name,fileLike?.type||fileLike?.mime||'');
  const cap=documentMediaCapability(mime);
  const max=Math.max(1024,Number(maxBytes)||DEFAULT_DOCUMENT_MEDIA_MAX_BYTES);
  if(!name)return {ok:false,error:'document_file_required'};
  if(!mime||!cap)return {ok:false,error:'document_file_type_unsupported'};
  if(!Number.isFinite(size)||size<=0)return {ok:false,error:'document_file_empty'};
  if(size>max)return {ok:false,error:'document_file_too_large',maxBytes:max};
  return {ok:true,name:name.slice(0,240),size,mime,capability:cap,maxBytes:max};
}
export function sniffDocumentMediaMime(input){
  const b=input instanceof Uint8Array?input:new Uint8Array(input||[]);
  if(b.length>=5&&b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46&&b[4]===0x2d)return 'application/pdf';
  if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'image/jpeg';
  if(b.length>=8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47&&b[4]===0x0d&&b[5]===0x0a&&b[6]===0x1a&&b[7]===0x0a)return 'image/png';
  if(b.length>=12&&b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&b[8]===0x57&&b[9]===0x45&&b[10]===0x42&&b[11]===0x50)return 'image/webp';
  return '';
}
export function safeDocumentFileName(name='document'){
  const cleaned=String(name||'document').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,' ').trim().slice(0,180);
  return cleaned||'document';
}
export function bytesToBase64(bytes){
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);let binary='';
  for(let i=0;i<view.length;i+=0x8000)binary+=String.fromCharCode(...view.subarray(i,Math.min(i+0x8000,view.length)));
  return btoa(binary);
}
export async function fileToBase64(file){return bytesToBase64(new Uint8Array(await file.arrayBuffer()))}
export async function sha256Hex(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input||[]);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
