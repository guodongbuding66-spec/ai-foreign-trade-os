export function cleanLeadString(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeDomain(value) {
  let v = cleanLeadString(value, 255).toLowerCase();
  if (!v) return '';
  try {
    if (!/^https?:\/\//.test(v)) v = `https://${v}`;
    const u = new URL(v);
    return u.hostname.replace(/^www\./, '');
  } catch (_) {
    return v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

export function normalizeLead(row) {
  let evidence = [];
  try { evidence = JSON.parse(row.source_evidence_json || '[]'); } catch (_) {}
  return {
    id: row.id,
    source: row.source || 'Manual',
    sourceUrl: row.source_url || '',
    companyName: row.company_name || '',
    domain: row.domain || '',
    country: row.country_code || '',
    contactName: row.contact_name || '',
    contactTitle: row.contact_title || '',
    email: row.email || '',
    phone: row.phone || '',
    score: Number(row.score || 0),
    status: row.status || 'New',
    evidence,
    ownerUserId: row.owner_user_id || null,
    owner: row.owner_display_name || '',
    companyId: row.company_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function parseLeadPayload(body = {}) {
  const companyName = cleanLeadString(body.companyName, 240);
  const domain = normalizeDomain(body.domain);
  const email = cleanLeadString(body.email, 320).toLowerCase();
  if (!companyName && !domain && !email) return { error: 'lead_identity_required' };
  const score = Number(body.score ?? 0);
  const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 30) : [];
  return {
    value: {
      source: cleanLeadString(body.source, 120) || 'Manual',
      sourceUrl: cleanLeadString(body.sourceUrl, 1000),
      companyName,
      domain,
      country: cleanLeadString(body.country, 8).toUpperCase(),
      contactName: cleanLeadString(body.contactName, 180),
      contactTitle: cleanLeadString(body.contactTitle, 180),
      email,
      phone: cleanLeadString(body.phone, 80),
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
      status: cleanLeadString(body.status, 40) || 'New',
      evidence
    }
  };
}
