const clean=(v,n=12000)=>String(v??'').trim().slice(0,n);
const num=v=>Number.isFinite(Number(v))?Number(v):0;

export const IMPORT_DOCUMENT_TYPES=new Set(['CI','PL','BL','AWB','SEA_WAYBILL','INSURANCE','COO','INSPECTION','BENEFICIARY_CERT','OTHER']);

export function canonicalDocumentType(v=''){
  const s=clean(v,80).toUpperCase().replace(/[\s-]+/g,'_');
  if(['CI','COMMERCIAL_INVOICE','INVOICE'].includes(s))return'CI';
  if(['PL','PACKING_LIST','PACKING_WEIGHT_LIST','WEIGHT_LIST'].includes(s))return'PL';
  if(['BL','B_L','BILL_OF_LADING','OCEAN_BILL_OF_LADING'].includes(s))return'BL';
  if(['AWB','AIR_WAYBILL','AIRWAY_BILL'].includes(s))return'AWB';
  if(['SEA_WAYBILL','SWB'].includes(s))return'SEA_WAYBILL';
  if(s.includes('INSURANCE'))return'INSURANCE';
  if(['COO','CERTIFICATE_OF_ORIGIN','ORIGIN_CERTIFICATE'].includes(s))return'COO';
  if(s.includes('INSPECTION'))return'INSPECTION';
  if(s.includes('BENEFICIARY')&&s.includes('CERT'))return'BENEFICIARY_CERT';
  return IMPORT_DOCUMENT_TYPES.has(s)?s:'OTHER';
}

function productText(items=[]){return items.map(i=>[i.skuCode,i.product,i.variant,i.color,i.size].filter(Boolean).join(' ')).filter(Boolean).join('; ')}
export function normalizeGeneratedSnapshot(snapshot={}){
  const order=snapshot.order||{},customer=snapshot.customer||{},items=Array.isArray(snapshot.items)?snapshot.items:[],packages=Array.isArray(snapshot.packages)?snapshot.packages:[];
  const qty=items.reduce((s,i)=>s+num(i.quantity),0),itemQty=new Map(items.map(i=>[i.skuId,num(i.quantity)]));
  const packageCount=packages.reduce((s,p)=>s+num(p.quantityPerSet||1)*num(itemQty.get(p.skuId)),0);
  return{
    document_type:canonicalDocumentType(snapshot.documentType),document_no:clean(snapshot.documentNo||''),order_no:clean(order.orderNo),po_number:clean(order.poNumber),
    seller:clean(snapshot.seller?.companyName||''),buyer:clean(customer.companyName),currency:clean(order.currency,12).toUpperCase(),amount:num(order.amount),incoterm:clean(order.incoterm,80),payment_terms:clean(order.paymentTerms,1000),
    shipping_marks:clean(order.shippingMarks,4000),marks:clean(order.shippingMarks,4000),package_count:packageCount,quantity:qty,goods_description:productText(items),pol:clean(order.pol||order.port,1000),pod:clean(order.pod,1000),etd:clean(order.etd,30),eta:clean(order.eta,30),
    items:items.map(i=>({sku_id:i.skuId,sku_code:i.skuCode,description:[i.product,i.variant,i.color,i.size].filter(Boolean).join(' '),quantity:num(i.quantity),unit_price:num(i.unitPrice),line_total:num(i.lineTotal),currency:clean(i.currency,12)})),
    packages:packages.map(p=>({sku_id:p.skuId,sku_code:p.skuCode,package_code:p.packageCode,quantity_per_set:num(p.quantityPerSet||1),length:num(p.length),width:num(p.width),height:num(p.height),dimension_unit:clean(p.dimensionUnit,12),gross_weight:num(p.grossWeight),weight_unit:clean(p.weightUnit,12)}))
  };
}

function first(text,patterns){for(const re of patterns){const m=text.match(re);if(m?.[1])return clean(m[1],1000)}return''}
function numberField(text,patterns){const v=first(text,patterns);if(!v)return 0;const x=Number(v.replace(/,/g,''));return Number.isFinite(x)?x:0}
export function parseDocumentTextDeterministic(rawText='',type='OTHER'){
  const text=clean(rawText,120000),docType=canonicalDocumentType(type);const out={document_type:docType};
  out.document_no=first(text,[/(?:invoice|document|b\/l|bill of lading|awb|policy|certificate)\s*(?:no\.?|number|#)\s*[:\-]?\s*([^\n]+)/i]);
  out.currency=first(text,[/\b(USD|EUR|GBP|CNY|RMB|JPY|AUD|CAD|CHF|HKD|TWD)\b/i]).toUpperCase();
  out.amount=numberField(text,[/(?:total amount|invoice total|amount)\s*[:\-]?\s*(?:[A-Z]{3}\s*)?([\d,.]+)/i]);
  out.shipping_marks=first(text,[/(?:shipping marks?|marks?\s*&\s*numbers?)\s*[:\-]?\s*([^\n]+)/i]);out.marks=out.shipping_marks;
  out.package_count=numberField(text,[/(?:total packages?|number of packages?|packages?)\s*[:\-]?\s*(\d+)/i]);
  out.quantity=numberField(text,[/(?:total quantity|quantity|qty)\s*[:\-]?\s*([\d,.]+)/i]);
  out.pol=first(text,[/(?:port of loading|pol)\s*[:\-]?\s*([^\n]+)/i]);out.pod=first(text,[/(?:port of discharge|pod)\s*[:\-]?\s*([^\n]+)/i]);
  out.vessel=first(text,[/(?:vessel|vessel name)\s*[:\-]?\s*([^\n]+)/i]);out.voyage=first(text,[/(?:voyage|voyage no\.?)\s*[:\-]?\s*([^\n]+)/i]);
  out.on_board_date=first(text,[/(?:on board date|shipped on board|on-board date)\s*[:\-]?\s*([^\n]+)/i]);
  out.bl_no=docType==='BL'?out.document_no:'';out.awb_no=docType==='AWB'?out.document_no:'';
  const lower=text.toLowerCase();if(docType==='BL')out.clean_status=/(claused|unclean|damaged|broken|leaking|short shipped|insufficient packaging)/i.test(text)?'unclean':(/clean on board/i.test(text)?'clean':'unknown');
  out.goods_description=first(text,[/(?:description of goods|goods description|commodity)\s*[:\-]?\s*([^\n]+)/i]);
  out.source_text=text;out.deterministic=true;return out;
}

export function normalizeExtractedDocument(value={},type='OTHER'){
  const d=value&&typeof value==='object'?value:{};return{
    document_type:canonicalDocumentType(d.document_type||d.documentType||type),document_no:clean(d.document_no||d.documentNo,300),seller:clean(d.seller,1000),buyer:clean(d.buyer,1000),currency:clean(d.currency,12).toUpperCase(),amount:num(d.amount),incoterm:clean(d.incoterm,100),payment_terms:clean(d.payment_terms||d.paymentTerms,1000),shipping_marks:clean(d.shipping_marks||d.shippingMarks||d.marks,4000),marks:clean(d.shipping_marks||d.shippingMarks||d.marks,4000),package_count:num(d.package_count||d.packageCount),quantity:num(d.quantity),goods_description:clean(d.goods_description||d.goodsDescription,12000),pol:clean(d.pol||d.port_of_loading,1000),pod:clean(d.pod||d.port_of_discharge,1000),vessel:clean(d.vessel,1000),voyage:clean(d.voyage,1000),on_board_date:clean(d.on_board_date||d.onBoardDate,100),clean_status:clean(d.clean_status||d.cleanStatus,80).toLowerCase(),bl_no:clean(d.bl_no||d.blNo,300),awb_no:clean(d.awb_no||d.awbNo,300),issue_date:clean(d.issue_date||d.issueDate,100),items:Array.isArray(d.items)?d.items.slice(0,500):[]
  };
}
