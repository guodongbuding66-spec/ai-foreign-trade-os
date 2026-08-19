import assert from 'node:assert/strict';
import { canonicalDocumentType, normalizeGeneratedSnapshot, normalizeExtractedDocument, parseDocumentTextDeterministic } from '../functions/_lib/document-intelligence.js';

assert.equal(canonicalDocumentType('Bill of Lading'),'BL');
assert.equal(canonicalDocumentType('Air Waybill'),'AWB');
assert.equal(canonicalDocumentType('Certificate of Origin'),'COO');

const snap={documentType:'PL',documentNo:'PL-001',order:{orderNo:'O-1',poNumber:'PO-1',currency:'USD',incoterm:'FOB',paymentTerms:'30/70',shippingMarks:'ABC/001',pol:'NINGBO',pod:'HAMBURG',amount:200,etd:'2026-09-01',eta:'2026-10-01'},customer:{companyName:'Buyer GmbH'},items:[{skuId:'s1',skuCode:'SKU1',product:'Garden Shed',variant:'Large',quantity:2,unitPrice:100,lineTotal:200,currency:'USD'}],packages:[{skuId:'s1',skuCode:'SKU1',packageCode:'A',quantityPerSet:1,length:128,width:54,height:13,grossWeight:49},{skuId:'s1',skuCode:'SKU1',packageCode:'B',quantityPerSet:1,length:128,width:54,height:11,grossWeight:49}]};
const normalized=normalizeGeneratedSnapshot(snap);
assert.equal(normalized.document_type,'PL');
assert.equal(normalized.quantity,2);
assert.equal(normalized.package_count,4);
assert.equal(normalized.shipping_marks,'ABC/001');
assert.equal(normalized.pol,'NINGBO');
assert.match(normalized.goods_description,/Garden Shed/);

const blText=`BILL OF LADING NO.: BL123456\nSHIPPER: ISUNOR\nCONSIGNEE: BUYER GMBH\nVESSEL: EVER TEST\nVOYAGE: V001\nPORT OF LOADING: NINGBO\nPORT OF DISCHARGE: HAMBURG\nSHIPPING MARKS: ABC/001\nTOTAL PACKAGES: 40\nSHIPPED ON BOARD: 2026-09-01\nFULL SET CLEAN ON BOARD`;
const bl=parseDocumentTextDeterministic(blText,'BL');
assert.equal(bl.document_type,'BL');
assert.equal(bl.document_no,'BL123456');
assert.equal(bl.pol,'NINGBO');
assert.equal(bl.pod,'HAMBURG');
assert.equal(bl.vessel,'EVER TEST');
assert.equal(bl.package_count,40);
assert.equal(bl.clean_status,'clean');
assert.equal(bl.bl_no,'BL123456');

const aliased=normalizeExtractedDocument({documentType:'Commercial Invoice',documentNo:'CI99',shippingMarks:'M1',packageCount:12,goodsDescription:'Steel Shed',port_of_loading:'Ningbo',port_of_discharge:'Hamburg'},'CI');
assert.equal(aliased.document_type,'CI');
assert.equal(aliased.document_no,'CI99');
assert.equal(aliased.marks,'M1');
assert.equal(aliased.package_count,12);
assert.equal(aliased.pol,'Ningbo');
console.log('Document Intelligence smoke OK');
