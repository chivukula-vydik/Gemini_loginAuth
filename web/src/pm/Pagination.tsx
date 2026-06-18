type Props = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
};

export function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;
  return (
    <div className="pm-pagination" aria-label="Pagination">
      <button className="btn btn-ghost" onClick={() => onChange(page - 1)} disabled={page <= 1}>Prev</button>
      <span className="ts-sub">Page {page} of {totalPages}</span>
      <button className="btn btn-ghost" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>Next</button>
    </div>
  );
}
