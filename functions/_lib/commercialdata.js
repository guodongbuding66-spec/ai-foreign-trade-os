export const clean=(v,max=500)=>String(v??'').trim().slice(0,max);
export const num=v=>Number.isFinite(Number(v))?Number(v):0;

export function normalizeOrder(row, items=[]) {
  return {
    id:row.id,orderNo:row.order_no,companyId:row.company_id,company:row.company_name||'',contactId:row.contact_id||null,
    opportunityId:row.opportunity_id||null,quoteId:row.quote_id||null,poNumber:row.po_number||'',currency:row.currency||'USD',
    incoterm:row.incoterm||'',port:row.port||'',paymentTerms:row.payment_terms||'',deposit:num(row.deposit),balance:num(row.balance),
    amount:num(row.amount),productionDate:row.production_date||'',etd:row.etd||'',eta:row.eta||'',status:row.status||'Draft',
    ownerUserId:row.owner_user_id||null,owner:row.owner_display_name||'',createdAt:row.created_at,updatedAt:row.updated_at,
    items:items.map(i=>({id:i.id,skuId:i.sku_id,skuCode:i.sku_code||'',quantity:Number(i.quantity||0),unitPrice:num(i.unit_price),currency:i.currency||row.currency||'USD',lineTotal:num(i.line_total),metadata:safeJson(i.metadata_json,{})}))
  };
}

export function normalizeDocument(row) {
  return {id:row.id,type:row.document_type,no:row.document_no||'',companyId:row.company_id||null,orderId:row.order_id||null,status:row.status||'Draft',storageKey:row.storage_key||null,mimeType:row.mime_type||null,metadata:safeJson(row.metadata_json,{}),latestVersion:Number(row.latest_version||0),createdAt:row.created_at,updatedAt:row.updated_at};
}

export function normalizeShipment(row) {
  return {id:row.id,shipmentNo:row.shipment_no,orderId:row.order_id,orderNo:row.order_no||'',carrier:row.carrier||'',forwarder:row.forwarder||'',mode:row.mode||'',bookingNo:row.booking_no||'',blNo:row.bl_no||'',containerNo:row.container_no||'',sealNo:row.seal_no||'',trackingNo:row.tracking_no||'',pol:row.pol||'',pod:row.pod||'',etd:row.etd||'',eta:row.eta||'',vessel:row.vessel||'',voyage:row.voyage||'',status:row.status||'Draft',createdAt:row.created_at,updatedAt:row.updated_at};
}

export function safeJson(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}

export function commercialSchemaError(error){
  const m=String(error?.message||error||'');
  return m.includes('no such table')?{ok:false,error:'commercial_schema_not_ready',detail:'Run migrations/0004_commercial.sql in D1 first.'}:{ok:false,error:'commercial_database_error',detail:m.slice(0,180)};
}
