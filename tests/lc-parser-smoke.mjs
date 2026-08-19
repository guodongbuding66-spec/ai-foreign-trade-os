import assert from 'node:assert/strict';
import { parseLCText, normalizeLCBody } from '../functions/_lib/lc.js';

const raw=`:20:LC20260001
:31C:260801
:31D:260930TAIPEI
:50:ABC IMPORT GMBH
:59:ISUNOR EXPORT CO LTD
:32B:USD100000,00
:43P:NOT ALLOWED
:43T:ALLOWED
:44E:NINGBO
:44F:HAMBURG
:44C:260915
:46A:
1. SIGNED COMMERCIAL INVOICE IN 3 ORIGINALS
2. PACKING LIST IN 2 COPIES
3. FULL SET CLEAN ON BOARD OCEAN BILLS OF LADING
:48:21 DAYS AFTER SHIPMENT
:47A:ALL DOCUMENTS MUST SHOW L/C NUMBER`;

const p=parseLCText(raw);
assert.equal(p.lcNo,'LC20260001');
assert.equal(p.issueDate,'2026-08-01');
assert.equal(p.expiryDate,'2026-09-30');
assert.equal(p.presentationPlace,'TAIPEI');
assert.equal(p.currency,'USD');
assert.equal(p.amount,100000);
assert.equal(p.partialShipment,'not allowed');
assert.equal(p.transshipment,'allowed');
assert.equal(p.latestShipmentDate,'2026-09-15');
assert.equal(p.pol,'NINGBO');
assert.equal(p.pod,'HAMBURG');
assert.ok(p.requiredDocuments.some(x=>x.documentType==='CI'&&x.originals===3));
assert.ok(p.requiredDocuments.some(x=>x.documentType==='PL'&&x.copies===2));
assert.ok(p.requiredDocuments.some(x=>x.documentType==='BL'));

const n=normalizeLCBody({...p,orderId:'ord1',requiredDocuments:p.requiredDocuments});
assert.equal(n.orderId,'ord1');
assert.equal(n.amount,100000);
assert.equal(n.requiredDocuments.length,3);
console.log('LC parser smoke OK');
