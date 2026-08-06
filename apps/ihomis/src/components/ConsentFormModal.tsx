'use client';

interface ConsentFormModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ConsentFormModal({ open, onClose }: ConsentFormModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-lg w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col animate-fade-in" style={{ background: 'var(--color-bg-secondary)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.1)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm">Patient Data Privacy Consent Form</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Republic Act 10173 — Data Privacy Act of 2012</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-gray-100 transition-colors" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-6 py-5 overflow-y-auto flex-1 text-sm leading-relaxed space-y-5" style={{ color: 'var(--color-text-secondary)' }}>
          <div className="p-4 rounded-lg" style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.15)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#2563eb' }}>Important Notice</p>
            <p className="text-xs">
              This consent form is required under <strong>Republic Act No. 10173</strong> (Data Privacy Act of 2012) and its
              Implementing Rules and Regulations. Your personal and health data will be processed in compliance with applicable
              Philippine laws and regulations.
            </p>
          </div>

          <section>
            <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>1. Purpose of Data Collection</h3>
            <p className="text-xs">I understand that my personal and health information is being collected for the following purposes:</p>
            <ul className="list-disc list-inside text-xs mt-2 space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
              <li>Provision of healthcare services, diagnosis, and treatment</li>
              <li>Health information exchange between authorized healthcare facilities</li>
              <li>Compliance with Department of Health (DOH) reporting requirements</li>
              <li>Integration with the Wireless Access for Health (WAH) Hospital System</li>
              <li>PhilHealth claims processing and health insurance coordination</li>
              <li>Public health surveillance and disease monitoring</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>2. Types of Data Collected</h3>
            <p className="text-xs">The following personal and sensitive personal information will be collected and processed:</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                'Full name and demographics',
                'Date of birth and sex',
                'PhilHealth member ID',
                'Contact information',
                'Home address',
                'Medical history and diagnoses',
                'Vital signs and observations',
                'Treatment and encounter records',
              ].map(item => (
                <div key={item} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#2563eb' }} />
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>3. Data Sharing & Transfer</h3>
            <p className="text-xs">
              I consent to the sharing of my health data with authorized government health agencies, including but not limited to
              the <strong>Wireless Access for Health (WAH)</strong> hospital systems, <strong>PhilHealth</strong>, and other healthcare
              facilities within the national health information exchange network. Data will be transmitted securely using HL7 v2
              messaging via the ADAPT Integration Platform as a Service (iPaaS), where it is transformed to FHIR R4.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>4. Data Protection Measures</h3>
            <p className="text-xs">
              All personal data will be protected using industry-standard security measures including encryption during transit,
              secure database storage, access controls, and audit logging in compliance with the National Privacy Commission (NPC)
              guidelines.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>5. Patient Rights</h3>
            <p className="text-xs">Under RA 10173, I have the following rights:</p>
            <ul className="list-disc list-inside text-xs mt-2 space-y-1">
              <li><strong>Right to be informed</strong> — to know how my data is being processed</li>
              <li><strong>Right to access</strong> — to obtain a copy of my personal data</li>
              <li><strong>Right to object</strong> — to refuse or withdraw consent to data processing</li>
              <li><strong>Right to erasure</strong> — to request deletion of my personal data</li>
              <li><strong>Right to rectification</strong> — to correct any inaccurate personal data</li>
              <li><strong>Right to data portability</strong> — to obtain my data in a machine-readable format</li>
              <li><strong>Right to file a complaint</strong> — to lodge a complaint with the National Privacy Commission</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>6. Withdrawal of Consent</h3>
            <p className="text-xs">
              I understand that I may withdraw my consent at any time by notifying the healthcare facility in writing.
              However, withdrawal of consent may affect the provision of healthcare services and the processing of
              health insurance claims.
            </p>
          </section>

          <div className="p-4 rounded-lg" style={{ background: 'rgba(217,119,6,0.04)', border: '1px solid rgba(217,119,6,0.15)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#d97706' }}>Without Consent</p>
            <p className="text-xs">
              If this consent form is not agreed to, the patient record <strong>cannot be transmitted</strong> to WAH
              or other health agencies. The record will be <strong>quarantined</strong> by the ADAPT iPaaS system and will
              require consent before processing can continue.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: 'var(--color-border)' }}>
          <button onClick={onClose} className="portal-btn portal-btn-primary text-xs px-5 py-2">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
