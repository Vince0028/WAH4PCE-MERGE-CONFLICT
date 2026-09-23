'use client';
import { useState, useEffect } from 'react';
import WAHSidebar from '@/components/Sidebar';
import ConsentFormModal from '@/components/ConsentFormModal';

async function safeFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, data: [] }; }
}

interface WAHRecord {
  id: string; patient_name: string; philhealth_no: string; gender: string;
  birth_date: string; diagnosis_code: string; diagnosis_display: string;
  status: string; source: string; created_at: string;
  fhir_bundle: Record<string, unknown>;
  consent_signed: boolean;
}

// Dynamic extraction of ALL fields from FHIR bundle including Observations
function extractFlat(bundle: Record<string, unknown>): Array<{ key: string; label: string; value: string }> {
  const fields: Array<{ key: string; label: string; value: string }> = [];
  const entries = (bundle?.entry || []) as Array<Record<string, unknown>>;

  for (const entry of entries) {
    const res = entry.resource as Record<string, unknown>;
    if (!res) continue;

    if (res.resourceType === 'Patient') {
      const names = (res.name as Array<Record<string, unknown>>) || [];
      const name = names[0] || {};
      const given = ((name.given as string[]) || []).join(' ');
      fields.push({ key: 'patient_name', label: 'Patient Name', value: `${name.family || ''}, ${given}`.trim() });
      fields.push({ key: 'gender', label: 'Gender', value: (res.gender as string) || '' });
      fields.push({ key: 'birth_date', label: 'Birth Date', value: (res.birthDate as string) || '' });
      const ids = (res.identifier as Array<Record<string, unknown>>) || [];
      const ph = ids.find(i => ((i.system as string) || '').includes('philhealth'));
      fields.push({ key: 'philhealth_id', label: 'PhilHealth ID', value: ph ? (ph.value as string) : '' });
      const tel = (res.telecom as Array<Record<string, unknown>>) || [];
      fields.push({ key: 'phone', label: 'Phone', value: tel[0] ? (tel[0].value as string) : '' });
      const addr = (res.address as Array<Record<string, unknown>>) || [];
      if (addr[0]) {
        const lines = ((addr[0].line as string[]) || []).join(', ');
        fields.push({ key: 'address', label: 'Address', value: [lines, addr[0].city, addr[0].district].filter(Boolean).join(', ') });
      } else fields.push({ key: 'address', label: 'Address', value: '' });
      const ms = res.maritalStatus as Record<string, unknown>;
      fields.push({ key: 'marital_status', label: 'Marital Status', value: ms ? (((ms.coding as Array<Record<string, unknown>>) || [])[0]?.code as string) || '' : '' });
    }

    if (res.resourceType === 'Encounter') {
      const cls = res.class as Record<string, unknown>;
      fields.push({ key: 'encounter_class', label: 'Encounter Class', value: cls ? (cls.code as string) || '' : '' });
      const pri = res.priority as Record<string, unknown>;
      fields.push({ key: 'priority', label: 'Priority', value: pri ? (((pri.coding as Array<Record<string, unknown>>) || [])[0]?.code as string) || '' : '' });
      const svc = res.serviceProvider as Record<string, unknown>;
      fields.push({ key: 'facility', label: 'Facility', value: svc ? (svc.display as string) || '' : '' });
      const parts = (res.participant as Array<Record<string, unknown>>) || [];
      fields.push({ key: 'physician', label: 'Physician', value: parts[0] ? ((parts[0].individual as Record<string, unknown>)?.display as string) || '' : '' });
      const reasons = (res.reasonCode as Array<Record<string, unknown>>) || [];
      fields.push({ key: 'reason', label: 'Reason', value: reasons[0] ? (reasons[0].text as string) || '' : '' });
    }

    if (res.resourceType === 'Observation') {
      const code = res.code as Record<string, unknown>;
      const display = (code?.text as string) || ((code?.coding as Array<Record<string, unknown>>) || [])[0]?.display as string || 'Observation';
      const loinc = ((code?.coding as Array<Record<string, unknown>>) || [])[0]?.code as string || '';
      const vq = res.valueQuantity as Record<string, unknown>;
      const value = vq ? `${vq.value} ${vq.unit || ''}`.trim() : '';
      fields.push({ key: `obs_${loinc}`, label: display, value });
    }

    if (res.resourceType === 'Condition') {
      const code = res.code as Record<string, unknown>;
      const coding = ((code?.coding as Array<Record<string, unknown>>) || []);
      fields.push({ key: 'diagnosis_code', label: 'Diagnosis Code', value: coding[0] ? (coding[0].code as string) || '' : '' });
      fields.push({ key: 'diagnosis_display', label: 'Diagnosis', value: coding[0] ? (coding[0].display as string) || (code?.text as string) || '' : '' });
    }
  }
  return fields;
}

// Convert to flat map for editing
function fieldsToMap(fields: Array<{ key: string; value: string }>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) m[f.key] = f.value;
  return m;
}

// Rebuild FHIR bundle with edited flat values
function rebuildBundle(bundle: Record<string, unknown>, edits: Record<string, string>): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(bundle));
  const entries = (result.entry || []) as Array<Record<string, unknown>>;
  for (const entry of entries) {
    const res = entry.resource as Record<string, unknown>;
    if (!res) continue;
    if (res.resourceType === 'Patient') {
      const names = (res.name as Array<Record<string, unknown>>) || [{}];
      const parts = (edits.patient_name || '').split(',').map(s => s.trim());
      names[0] = { ...names[0], family: parts[0] || '', given: (parts[1] || '').split(' ').filter(Boolean) };
      res.name = names;
      res.gender = edits.gender || res.gender;
      res.birthDate = edits.birth_date || res.birthDate;
      // PhilHealth
      const ids = (res.identifier as Array<Record<string, unknown>>) || [];
      const phIdx = ids.findIndex(i => ((i.system as string) || '').includes('philhealth'));
      if (phIdx >= 0) ids[phIdx].value = edits.philhealth_id;
      else if (edits.philhealth_id) ids.push({ system: 'https://www.philhealth.gov.ph/memberid', value: edits.philhealth_id });
      res.identifier = ids;
      // Phone
      if (edits.phone) res.telecom = [{ system: 'phone', value: edits.phone }];
    }
    if (res.resourceType === 'Encounter') {
      if (edits.facility) res.serviceProvider = { display: edits.facility };
      if (edits.physician) {
        res.participant = [{ individual: { display: edits.physician } }];
      }
    }
    if (res.resourceType === 'Condition') {
      const code = (res.code || {}) as Record<string, unknown>;
      const coding = ((code.coding as Array<Record<string, unknown>>) || [{}]);
      if (edits.diagnosis_code) coding[0] = { ...coding[0], code: edits.diagnosis_code };
      if (edits.diagnosis_display) coding[0] = { ...coding[0], display: edits.diagnosis_display };
      code.coding = coding;
      res.code = code;
    }
  }
  return result;
}

export default function RecordsPage() {
  const [records, setRecords] = useState<WAHRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'json'>('summary');
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [consentEdits, setConsentEdits] = useState<Record<string, boolean>>({});

  const showToast = (type: 'success' | 'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  const fetchRecords = async () => {
    const [localRes, sentRes, acceptedRes] = await Promise.all([
      safeFetch('/api/patients?source=LOCAL&status=SAVED'),
      safeFetch('/api/patients?source=LOCAL&status=SENT'),
      safeFetch('/api/patients?source=RECEIVED&status=SAVED'),
    ]);
    const all = [...(localRes.data || []), ...(sentRes.data || []), ...(acceptedRes.data || [])];
    all.sort((a: WAHRecord, b: WAHRecord) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setRecords(all);
    setLoading(false);
  };

  useEffect(() => { fetchRecords(); }, []);

  const startEdit = (rec: WAHRecord) => {
    setEditData(fieldsToMap(extractFlat(rec.fhir_bundle)));
    setConsentEdits(prev => ({ ...prev, [rec.id]: rec.consent_signed ?? false }));
    setEditId(rec.id);
    setExpandedId(rec.id);
    setViewMode('summary');
  };

  const handleSaveEdit = async (rec: WAHRecord) => {
    setSaving(true);
    const newBundle = rebuildBundle(rec.fhir_bundle, editData);
    // Also update metadata columns
    const parts = (editData.patient_name || '').split(',').map(s => s.trim());
    try {
      const data = await safeFetch('/api/patients', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rec.id,
          fhir_bundle: newBundle,
          patient_name: editData.patient_name || rec.patient_name,
          philhealth_no: editData.philhealth_id || rec.philhealth_no,
          gender: editData.gender || rec.gender,
          birth_date: editData.birth_date || rec.birth_date,
          diagnosis_code: editData.diagnosis_code || rec.diagnosis_code,
          diagnosis_display: editData.diagnosis_display || rec.diagnosis_display,
          consent_signed: consentEdits[rec.id] ?? rec.consent_signed,
        }),
      });
      if (data.success) { showToast('success', 'Record updated'); setEditId(null); fetchRecords(); }
      else showToast('error', data.message || 'Failed');
    } catch { showToast('error', 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      const data = await safeFetch(`/api/patients?id=${deleteModal}`, { method: 'DELETE' });
      if (data.success) { showToast('success', 'Record deleted'); fetchRecords(); }
      else showToast('error', data.message || 'Failed');
    } catch { showToast('error', 'Failed'); }
    finally { setDeleting(false); setDeleteModal(null); }
  };

  return (
    <>
      <WAHSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-5">
          <h1 className="text-lg font-semibold">Records</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>All FHIR records — locally saved and accepted from inbox.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent-bright)' }} /></div>
        ) : records.length === 0 ? (
          <div className="wah-card p-10 text-center"><p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No records yet.</p></div>
        ) : (
          <div className="space-y-3" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto', paddingRight: '4px' }}>
            {records.map(rec => {
              const isExpanded = expandedId === rec.id;
              const isEditing = editId === rec.id;
              const fieldsList = isExpanded ? extractFlat(rec.fhir_bundle) : [];
              return (
                <div key={rec.id} className="wah-card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">{rec.patient_name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{rec.birth_date || 'N/A'} · {rec.gender} · PhilHealth: {rec.philhealth_no}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {rec.source === 'RECEIVED' && <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(37,99,235,0.08)', color: '#2563eb' }}>From DOH</span>}
                      <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.08)', color: '#8b5cf6' }}>FHIR R4</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded" style={{
                        background: rec.status === 'SENT' ? 'rgba(5,150,105,0.08)' : 'rgba(217,119,6,0.08)',
                        color: rec.status === 'SENT' ? 'var(--color-success)' : 'var(--color-warning)',
                      }}>{rec.status}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded" style={{
                        background: rec.consent_signed ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.08)',
                        color: rec.consent_signed ? '#059669' : '#dc2626',
                      }}>
                        {rec.consent_signed ? '✓ Consent' : '⚠ No Consent'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                    <div><span style={{ color: 'var(--color-text-muted)' }}>Dx:</span> <strong>{rec.diagnosis_code || 'N/A'}</strong></div>
                    <div><span style={{ color: 'var(--color-text-muted)' }}>Desc:</span> <strong>{rec.diagnosis_display || 'N/A'}</strong></div>
                    <div><span style={{ color: 'var(--color-text-muted)' }}>Resources:</span> <strong>{((rec.fhir_bundle as Record<string, unknown>)?.entry as unknown[] || []).length}</strong></div>
                    <div><span style={{ color: 'var(--color-text-muted)' }}>Created:</span> <strong>{new Date(rec.created_at).toLocaleDateString()}</strong></div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!isEditing && <button onClick={() => startEdit(rec)} className="wah-btn wah-btn-secondary text-xs px-3 py-1.5">Edit</button>}
                    <button onClick={() => setDeleteModal(rec.id)} className="wah-btn text-xs px-3 py-1.5" style={{ color: 'var(--color-error)', border: '1px solid rgba(220,38,38,0.2)' }}>Delete</button>
                    <button onClick={() => { setExpandedId(isExpanded ? null : rec.id); if (isExpanded) setEditId(null); setViewMode('summary'); }}
                      className="text-xs font-medium flex items-center gap-1 ml-auto" style={{ color: 'var(--color-accent-bright)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points={isExpanded ? "6 9 12 15 18 9" : "9 18 15 12 9 6"} /></svg>
                      {isExpanded ? 'Hide details' : 'View details'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3">
                      <div className="flex gap-1 mb-3">
                        {(['summary', 'json'] as const).map(mode => (
                          <button key={mode} onClick={() => setViewMode(mode)} className="text-xs px-3 py-1.5 rounded font-medium transition-all" style={{
                            background: viewMode === mode ? 'var(--color-accent-bright)' : 'var(--color-bg-primary)',
                            color: viewMode === mode ? '#fff' : 'var(--color-text-secondary)',
                            border: `1px solid ${viewMode === mode ? 'var(--color-accent-bright)' : 'var(--color-border)'}`,
                          }}>{mode === 'summary' ? 'Field Summary' : 'FHIR Bundle'}</button>
                        ))}
                      </div>

                      {viewMode === 'summary' ? (
                        <div className="rounded overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide flex items-center justify-between" style={{ background: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                            <span>Patient Data {isEditing ? '— Editing' : '— Present vs Missing'}</span>
                            {isEditing && (
                              <div className="flex gap-1.5">
                                <button onClick={() => handleSaveEdit(rec)} disabled={saving} className="text-[11px] px-2.5 py-1 rounded font-medium text-white" style={{ background: '#059669' }}>
                                  {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button onClick={() => setEditId(null)} className="text-[11px] px-2.5 py-1 rounded font-medium" style={{ border: '1px solid var(--color-border)' }}>Cancel</button>
                              </div>
                            )}
                          </div>
                          <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                            {fieldsList.map(field => {
                              const val = isEditing ? (editData[field.key] || '') : field.value;
                              return (
                                <div key={field.key} className="flex items-center justify-between px-3 py-2 text-xs gap-4" style={{ borderColor: 'var(--color-border)' }}>
                                  <span className="shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{field.label}</span>
                                  {isEditing ? (
                                    <input type="text" value={editData[field.key] || ''}
                                      onChange={e => setEditData(prev => ({ ...prev, [field.key]: e.target.value }))}
                                      className="text-xs px-2 py-1 rounded text-right w-48 max-w-[60%]"
                                      style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', outline: 'none' }}
                                    />
                                  ) : val ? (
                                    <span className="flex items-center gap-1.5 font-medium"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#059669' }} />{val}</span>
                                  ) : (
                                    <span className="flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#d97706' }} />Not provided</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {!isEditing && (
                            <div className="px-3 py-2 text-[11px] flex items-center gap-4" style={{ background: 'var(--color-bg-primary)', borderTop: '1px solid var(--color-border)' }}>
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#059669' }} /> Present: {fieldsList.filter(f => f.value).length}</span>
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#d97706' }} /> Missing: {fieldsList.filter(f => !f.value).length}</span>
                            </div>
                          )}

                          {/* Consent Status Row */}
                          <div className="px-3 py-2.5 flex items-center justify-between" style={{ background: 'var(--color-bg-primary)', borderTop: '1px solid var(--color-border)' }}>
                            <div className="flex items-center gap-2">
                              {isEditing ? (
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={consentEdits[rec.id] ?? rec.consent_signed}
                                    onChange={e => setConsentEdits(prev => ({ ...prev, [rec.id]: e.target.checked }))}
                                    className="consent-checkbox-sm"
                                  />
                                  <span className="text-[11px] font-medium">Data Privacy Consent</span>
                                </label>
                              ) : (
                                <span className="flex items-center gap-1.5 text-[11px] font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: rec.consent_signed ? '#059669' : '#dc2626' }} />
                                  Data Privacy Consent: {rec.consent_signed ? 'Signed' : 'Not Signed'}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => setShowConsent(true)}
                              className="consent-view-link text-[11px]"
                            >
                              View Consent Form
                            </button>
                          </div>
                        </div>
                      ) : (
                        <pre className="p-3 rounded text-xs overflow-auto whitespace-pre-wrap" style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', maxHeight: '500px' }}>
                          {JSON.stringify(rec.fhir_bundle, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {deleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="rounded-lg p-6 w-full max-w-sm shadow-xl" style={{ background: 'var(--color-bg-secondary)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(220,38,38,0.1)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                </div>
                <div><p className="font-semibold text-sm">Delete Record</p><p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>This action cannot be undone.</p></div>
              </div>
              <p className="text-sm mb-5" style={{ color: 'var(--color-text-secondary)' }}>Permanently delete this FHIR record?</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeleteModal(null)} className="wah-btn wah-btn-secondary text-xs px-4 py-2">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="text-xs px-4 py-2 rounded font-medium text-white" style={{ background: '#dc2626' }}>{deleting ? 'Deleting...' : 'Delete'}</button>
              </div>
            </div>
          </div>
        )}
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        <ConsentFormModal open={showConsent} onClose={() => setShowConsent(false)} />
      </main>
    </>
  );
}
