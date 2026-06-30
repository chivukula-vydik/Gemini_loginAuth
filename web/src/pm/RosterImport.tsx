import { useState, useRef } from 'react';
import { authed, authedRaw } from '../fetchHelper';

type ParseResult = {
  headers: string[];
  mapping: Record<string, string>;
  rowCount: number;
  sampleRows: Record<string, string>[];
};

type DryRunResult = {
  totalRows: number;
  errors: string[];
  warnings: string[];
  valid: boolean;
};

type CommitResult = {
  batchId: string;
  totalRows: number;
  created: number;
  updated: number;
  errored: number;
  managerWarnings: string[];
  results: { row: number; email: string; status: string; errors?: string[] }[];
};

type Step = 'upload' | 'mapping' | 'preview' | 'committed';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function RosterImport() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    window.open(`${API}/import/template`, '_blank');
  }

  async function upload(f: File) {
    setFile(f);
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await authedRaw('/import/parse', 'POST', fd);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Parse failed');
      }
      const data: ParseResult = await res.json();
      setParseResult(data);
      setMapping(data.mapping);
      setStep('mapping');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function runDryRun() {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(mapping));
      const res = await authedRaw('/import/dry-run', 'POST', fd);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Dry run failed');
      }
      const data: DryRunResult = await res.json();
      setDryRunResult(data);
      setStep('preview');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function commit() {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(mapping));
      const res = await authedRaw('/import/commit', 'POST', fd);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Commit failed');
      setCommitResult(data as CommitResult);
      setStep('committed');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function rollback() {
    if (!commitResult?.batchId) return;
    if (!window.confirm(`Rollback batch ${commitResult.batchId}? This will DELETE all imported users.`)) return;
    setLoading(true);
    try {
      const result = await authed(`/import/batch/${commitResult.batchId}`, 'DELETE');
      alert(`Rolled back: ${result.deleted} users deleted.`);
      reset();
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  function reset() {
    setStep('upload');
    setFile(null);
    setParseResult(null);
    setMapping({});
    setDryRunResult(null);
    setCommitResult(null);
    setError('');
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Roster Import</h1>
          <p className="ts-sub">Upload your employee roster to seed the system</p>
        </div>
        {step !== 'upload' && (
          <button className="btn btn-auto" onClick={reset}>Start Over</button>
        )}
      </header>

      {error && <p className="ts-error">{error}</p>}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="ts-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <button className="btn btn-auto" onClick={downloadTemplate}>Download Template</button>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Fill the template, then upload as CSV or XLSX.</span>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); }} />
          <button className="btn btn-auto btn-primary" onClick={() => fileRef.current?.click()} disabled={loading}>
            {loading ? 'Parsing...' : 'Upload File'}
          </button>
          {file && <span style={{ marginLeft: 12, fontSize: 13 }}>{file.name}</span>}
        </div>
      )}

      {/* Step 2: Column mapping */}
      {step === 'mapping' && parseResult && (
        <div className="ts-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Column Mapping</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            {parseResult.rowCount} rows detected. Verify column mappings below.
          </p>
          <div style={{ display: 'grid', gap: 8, maxWidth: 500 }}>
            {Object.entries(mapping).map(([field, header]) => (
              <div key={field} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ minWidth: 140, fontWeight: 500, fontSize: 13 }}>{field}</span>
                <select className="input" value={header}
                  onChange={e => setMapping({ ...mapping, [field]: e.target.value })}>
                  <option value="">— unmapped —</option>
                  {parseResult.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Sample rows */}
          {parseResult.sampleRows.length > 0 && (
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <h4 style={{ marginBottom: 8 }}>Sample Data (first {parseResult.sampleRows.length} rows)</h4>
              <table className="ts-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>{parseResult.headers.map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {parseResult.sampleRows.map((row, i) => (
                    <tr key={i}>{parseResult.headers.map(h => <td key={h}>{row[h.toLowerCase()]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button className="btn btn-auto btn-primary" onClick={runDryRun} disabled={loading}>
              {loading ? 'Validating...' : 'Validate (Dry Run)'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview / dry-run report */}
      {step === 'preview' && dryRunResult && (
        <div className="ts-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Validation Report</h3>
          <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
            <div><strong>{dryRunResult.totalRows}</strong> rows</div>
            <div style={{ color: dryRunResult.errors.length ? 'var(--color-danger, red)' : 'var(--color-success, green)' }}>
              <strong>{dryRunResult.errors.length}</strong> errors
            </div>
            <div style={{ color: dryRunResult.warnings.length ? 'orange' : 'var(--color-success, green)' }}>
              <strong>{dryRunResult.warnings.length}</strong> warnings
            </div>
          </div>

          {dryRunResult.errors.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ color: 'var(--color-danger, red)' }}>Errors (must fix)</h4>
              <ul style={{ fontSize: 13, maxHeight: 200, overflow: 'auto' }}>
                {dryRunResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {dryRunResult.warnings.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ color: 'orange' }}>Warnings</h4>
              <ul style={{ fontSize: 13, maxHeight: 200, overflow: 'auto' }}>
                {dryRunResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-auto" onClick={() => setStep('mapping')}>Back</button>
            <button className="btn btn-auto btn-primary" onClick={commit}
              disabled={loading || !dryRunResult.valid}>
              {loading ? 'Importing...' : `Commit Import (${dryRunResult.totalRows} rows)`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Post-commit report */}
      {step === 'committed' && commitResult && (
        <div className="ts-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 12, color: 'var(--color-success, green)' }}>Import Complete</h3>
          <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
            <div><strong>{commitResult.created}</strong> created</div>
            <div><strong>{commitResult.updated}</strong> updated</div>
            <div style={{ color: commitResult.errored ? 'var(--color-danger, red)' : undefined }}>
              <strong>{commitResult.errored}</strong> errored
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Batch ID: <code>{commitResult.batchId}</code>
          </p>

          {commitResult.managerWarnings.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ color: 'orange' }}>Manager Link Warnings</h4>
              <ul style={{ fontSize: 13 }}>
                {commitResult.managerWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {commitResult.errored > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ color: 'var(--color-danger, red)' }}>Errors</h4>
              <ul style={{ fontSize: 13, maxHeight: 200, overflow: 'auto' }}>
                {commitResult.results.filter(r => r.status === 'error').map((r, i) => (
                  <li key={i}>Row {r.row} ({r.email}): {r.errors?.join('; ')}</li>
                ))}
              </ul>
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Imported users are inactive. Use the Users page to send invites.
          </p>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-auto" onClick={reset}>Import Another</button>
            <button className="btn btn-auto" style={{ color: 'var(--color-danger, red)' }}
              onClick={rollback} disabled={loading}>
              Rollback This Batch
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
