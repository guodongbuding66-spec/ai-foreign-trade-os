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
