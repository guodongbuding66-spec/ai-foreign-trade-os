const clean=(v,n=2000)=>String(v??'').replace(/\r/g,'').trim().slice(0,n);
const num=v=>{let s=String(v??'').trim();if(s.includes(',')&&!s.includes('.'))s=s.replace(',','.');else s=s.replace(/,/g,'');const x=Number(s);return Number.isFinite(x)?x:0};

function dateYYMMDD(v){const s=clean(v,20).replace(/[^0-9]/g,'');if(s.length!==6)return'';const yy=Number(s.slice(0,2));const year=yy>=70?1900+yy:2000+yy;return `${year}-${s.slice(2,4)}-${s.slice(4,6)}`}
function normalizeFlag(v){const s=clean(v,80).toLowerCase();if(!s)return'unknown';if(/not allowed|prohibited|no\b|without/.test(s))return'not allowed';if(/allowed|yes\b|permitted/.test(s))return'allowed';return clean(v,80)}

export function parseSwiftTags(text=''){
  const lines=String(text||'').replace(/\r/g,'').split('\n'),tags={},order=[];let current='';
  for(const raw of lines){const line=raw.trimEnd(),m=line.match(/^:(\d{2}[A-Z]?):\s*(.*)$/);if(m){current=m[1];if(tags[current]!==undefined){const key=`${current}_${order.filter(x=>x.startsWith(current)).length+1}`;current=key}tags[current]=m[2].trim();order.push(current)}else if(current&&line.trim())tags[current]+=`\n${line.trim()}`}
  return{tags,order};
}

function docTypeFromLine(line){const s=line.toLowerCase();if(/commercial invoice|signed invoice/.test(s))return'CI';if(/packing list|packing\/weight list/.test(s))return'PL';if(/bill(?:s)?\s+of\s+lading|ocean\s+b\/l|marine\s+bill/.test(s))return'BL';if(/air waybill|airway bill|awb/.test(s))return'AWB';if(/sea waybill/.test(s))return'SEA_WAYBILL';if(/insurance policy|insurance certificate/.test(s))return'INSURANCE';if(/certificate of origin|origin certificate/.test(s))return'COO';if(/inspection certificate|certificate of inspection/.test(s))return'INSPECTION';if(/beneficiary.*certificate/.test(s))return'BENEFICIARY_CERT';return'OTHER'}
function copiesFromLine(line){const s=line.toLowerCase();let originals=0,copies=0;const o=s.match(/(\d+)\s*(?:original|orig)/);const c=s.match(/(\d+)\s*(?:cop(?:y|ies)|copy)/);if(o)originals=Number(o[1]);if(c)copies=Number(c[1]);if(/full set/.test(s)&&originals===0)originals=3;return{originals,copies}}
function requiredDocsFrom46A(v){if(!v)return[];const lines=String(v).split(/\n|;(?=\s*\d|\s*[A-Z])/).map(x=>x.replace(/^\s*\d+[.)-]?\s*/,'').trim()).filter(Boolean);return lines.map((description,i)=>({documentType:docTypeFromLine(description),description, ...copiesFromLine(description),conditions:{source:'46A'},sortOrder:i}))}

export function parseLCText(rawText=''){
  const raw=clean(rawText,120000),{tags}=parseSwiftTags(raw);const t=k=>tags[k]??'';
  const expiryRaw=t('31D');let expiryDate='',presentationPlace='';const em=String(expiryRaw).match(/^(\d{6})(.*)$/s);if(em){expiryDate=dateYYMMDD(em[1]);presentationPlace=clean(em[2],200)}
  const amountRaw=t('32B');let currency='',amount=0;const am=String(amountRaw).match(/^([A-Z]{3})([\d.,]+)/);if(am){currency=am[1];amount=num(am[2])}
  const lcNo=clean(t('20')||t('21'),160),issueDate=dateYYMMDD(t('31C'));
  const latestShipmentDate=dateYYMMDD(t('44C'));
  const result={
    lcNo,applicantName:clean(t('50')||t('50A')||t('50K'),1000),beneficiaryName:clean(t('59')||t('59A'),1000),currency,amount,
    issueDate,expiryDate,presentationPlace,latestShipmentDate,partialShipment:normalizeFlag(t('43P')),transshipment:normalizeFlag(t('43T')),
    goodsDescription:clean(t('45A'),12000),pol:clean(t('44E')||t('44A'),1000),pod:clean(t('44F')||t('44B'),1000),presentationPeriod:clean(t('48'),1000),additionalConditions:clean(t('47A'),12000),
    requiredDocuments:requiredDocsFrom46A(t('46A')),
    rawTerms:{swiftTags:tags,sourceText:raw}
  };
  return result;
}

export function normalizeLCBody(body={}){
  const docs=Array.isArray(body.requiredDocuments)?body.requiredDocuments.slice(0,100).map((d,i)=>({documentType:clean(d?.documentType||'OTHER',60).toUpperCase(),description:clean(d?.description,5000),originals:Math.max(0,Math.min(99,Number(d?.originals||0))),copies:Math.max(0,Math.min(99,Number(d?.copies||0))),conditions:d?.conditions&&typeof d.conditions==='object'?d.conditions:{},sortOrder:Number.isFinite(Number(d?.sortOrder))?Number(d.sortOrder):i})):[];
  const rawTerms=body.rawTerms&&typeof body.rawTerms==='object'?body.rawTerms:{};
  return{
    orderId:clean(body.orderId,100),documentId:clean(body.documentId,100)||null,lcNo:clean(body.lcNo,160),applicantName:clean(body.applicantName,1000),beneficiaryName:clean(body.beneficiaryName,1000),currency:clean(body.currency,12).toUpperCase(),amount:num(body.amount),issueDate:clean(body.issueDate,30),expiryDate:clean(body.expiryDate,30),presentationPlace:clean(body.presentationPlace,500),latestShipmentDate:clean(body.latestShipmentDate,30),partialShipment:clean(body.partialShipment||'unknown',80),transshipment:clean(body.transshipment||'unknown',80),status:clean(body.status||'Draft',40),
    goodsDescription:clean(body.goodsDescription,12000),pol:clean(body.pol,1000),pod:clean(body.pod,1000),presentationPeriod:clean(body.presentationPeriod,1000),additionalConditions:clean(body.additionalConditions,12000),requiredDocuments:docs,rawTerms
  };
}

export function publicLC(row,requiredDocuments=[]){let rawTerms={};try{rawTerms=JSON.parse(row.raw_terms_json||'{}')}catch{}return{id:row.id,orderId:row.order_id||null,orderNo:row.order_no||'',documentId:row.document_id||null,lcNo:row.lc_no,applicantName:row.applicant_name||'',beneficiaryName:row.beneficiary_name||'',currency:row.currency||'',amount:Number(row.amount||0),issueDate:row.issue_date||'',expiryDate:row.expiry_date||'',presentationPlace:row.presentation_place||'',latestShipmentDate:row.latest_shipment_date||'',partialShipment:row.partial_shipment||'unknown',transshipment:row.transshipment||'unknown',status:row.status||'Draft',rawTerms,requiredDocuments,createdAt:row.created_at,updatedAt:row.updated_at}}
