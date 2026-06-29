import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './DeclarationReview.css';

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function currentFY() {
  const now = new Date();
  const y = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return `FY${y}-${String(y + 1).slice(2)}`;
}

interface Proof { fileId: string; filename: string }
interface DecItem { section: string; declaredAmount: number; proofAmount: number | null; proofs: Proof[]; verifyStatus: string; rejectReason: string }
interface UserRef { _id: string; firstName: string; lastName: string; email: string }
interface Dec { _id: string; user: UserRef; regime: string; items: DecItem[]; phase: string; lockedForTds: boolean }

export function DeclarationReview() {
  const navigate = useNavigate();
  const fy = currentFY();
  const [decs, setDecs] = useState<Dec[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    authed(`/declarations/${fy}/all`).then(d => { setDecs(d || []); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  async function verifyItem(userId: string, idx: number, action: 'verify' | 'reject', proofAmount?: number) {
    setBusy(true);
    const rejectReason = action === 'reject' ? (prompt('Reason for rejection:') || 'Rejected') : '';
    try {
      const d = await authed(`/declarations/${fy}/verify/${userId}/${idx}`, 'PATCH', { action, proofAmount, rejectReason });
      setDecs(prev => prev.map(dec => dec.user._id === userId ? { ...dec, items: d.items, phase: d.phase } : dec));
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
    setBusy(false);
  }

  async function closeDec(userId: string) {
    setBusy(true);
    try {
      const d = await authed(`/declarations/${fy}/close/${userId}`, 'POST');
      setDecs(prev => prev.map(dec => dec.user._id === userId ? { ...dec, phase: d.phase, lockedForTds: d.lockedForTds } : dec));
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
    setBusy(false);
  }

  async function closeAll() {
    if (!confirm(`Close all open declarations for ${fy}? This locks them for TDS.`)) return;
    setBusy(true);
    try {
      const r = await authed(`/declarations/${fy}/close-all`, 'POST');
      setMsg(`${r.closed} declarations closed`);
      const fresh = await authed(`/declarations/${fy}/all`);
      setDecs(fresh || []);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
    setBusy(false);
  }

  if (!loaded) return <div className="dr-page">Loading...</div>;

  const stats = {
    total: decs.length,
    proof: decs.filter(d => d.phase === 'proof').length,
    closed: decs.filter(d => d.phase === 'closed').length,
    pending: decs.flatMap(d => d.items).filter(it => it.verifyStatus === 'pending' && it.proofs.length > 0).length,
  };

  return (
    <div className="dr-page">
      <div className="dr-header">
        <button className="dr-back" onClick={() => navigate('/payroll')}>← Back</button>
        <h1 className="dr-title">Declaration Review — {fy}</h1>
      </div>

      <div className="dr-stats">
        <div className="dr-stat"><span className="dr-stat-n">{stats.total}</span><span className="dr-stat-l">Total</span></div>
        <div className="dr-stat"><span className="dr-stat-n">{stats.proof}</span><span className="dr-stat-l">Proofs Submitted</span></div>
        <div className="dr-stat"><span className="dr-stat-n">{stats.pending}</span><span className="dr-stat-l">Items Pending</span></div>
        <div className="dr-stat"><span className="dr-stat-n">{stats.closed}</span><span className="dr-stat-l">Closed</span></div>
      </div>

      {msg && <div className="dr-msg">{msg}</div>}

      <div className="dr-actions-top">
        <button className="dr-close-all" onClick={closeAll} disabled={busy}>Close All Open Declarations</button>
      </div>

      {decs.length === 0 && <div className="dr-empty">No declarations found for {fy}.</div>}

      {decs.map(dec => {
        const name = `${dec.user.firstName} ${dec.user.lastName}`;
        const isExpanded = expanded === dec._id;
        const pendingItems = dec.items.filter(it => it.verifyStatus === 'pending' && it.proofs.length > 0).length;
        const total = dec.items.reduce((s, it) => s + it.declaredAmount, 0);
        return (
          <div key={dec._id} className="dr-card">
            <div className="dr-card-header" onClick={() => setExpanded(isExpanded ? null : dec._id)}>
              <div className="dr-card-name">{name}</div>
              <div className="dr-card-meta">
                <span className={`dr-phase dr-phase-${dec.phase}`}>{dec.phase}</span>
                <span className="dr-card-regime">{dec.regime.toUpperCase()}</span>
                <span className="dr-card-total">{fmt(total)}</span>
                {pendingItems > 0 && <span className="dr-card-pending">{pendingItems} pending</span>}
                <span className="dr-chevron">{isExpanded ? '▾' : '▸'}</span>
              </div>
            </div>
            {isExpanded && (
              <div className="dr-card-body">
                {dec.items.map((item, i) => (
                  <div key={i} className={`dr-item ${item.verifyStatus === 'rejected' ? 'dr-item-rejected' : item.verifyStatus === 'verified' ? 'dr-item-verified' : ''}`}>
                    <div className="dr-item-top">
                      <span className="dr-item-section">{item.section}</span>
                      <span className="dr-item-amount">{fmt(item.declaredAmount)}</span>
                      <span className={`dr-badge dr-badge-${item.verifyStatus}`}>{item.verifyStatus}</span>
                    </div>
                    {item.proofs.length > 0 && (
                      <div className="dr-item-proofs">
                        {item.proofs.map((p, pi) => <span key={pi} className="dr-proof-chip">{p.filename}</span>)}
                      </div>
                    )}
                    {item.proofAmount !== null && item.verifyStatus === 'verified' && (
                      <div className="dr-item-verified-amt">Verified amount: {fmt(item.proofAmount)}</div>
                    )}
                    {item.verifyStatus === 'pending' && item.proofs.length > 0 && (
                      <div className="dr-item-actions">
                        <button className="dr-btn-verify" disabled={busy} onClick={() => verifyItem(dec.user._id, i, 'verify', item.declaredAmount)}>Verify</button>
                        <button className="dr-btn-reject" disabled={busy} onClick={() => verifyItem(dec.user._id, i, 'reject')}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
                {dec.phase !== 'closed' && (
                  <button className="dr-close-btn" disabled={busy} onClick={() => closeDec(dec.user._id)}>Close & Lock for TDS</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
