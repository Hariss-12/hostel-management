import { useMemo, useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';

/**
 * columns: [{ key, header, render?(row), sortable?, className? }]
 * filters: [{ key, label, options: ['a'] | [{ value, label }] }]
 * Search, filters, sorting and pagination all happen in the browser.
 */
export default function DataTable({
  columns, rows = [], searchKeys = [], filters = [], pageSize = 10, loading = false,
  empty = 'Nothing to show yet.', toolbar, rowKey = 'id', searchPlaceholder = 'Search...',
}) {
  const [q, setQ] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [q, filterValues, rows.length]);

  const visible = useMemo(() => {
    let out = rows;
    const needle = q.trim().toLowerCase();
    if (needle && searchKeys.length) {
      out = out.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(needle)));
    }
    filters.forEach((f) => {
      const v = filterValues[f.key];
      if (v) out = out.filter((r) => String(r[f.key] ?? '') === v);
    });
    if (sort) {
      out = [...out].sort((a, b) => {
        const x = a[sort.key] ?? '';
        const y = b[sort.key] ?? '';
        const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, q, filterValues, sort, searchKeys, filters]);

  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pages);
  const slice = visible.slice((current - 1) * pageSize, current * pageSize);

  const toggleSort = (key) => setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));

  return (
    <div className="card table-card">
      {(searchKeys.length > 0 || filters.length > 0 || toolbar) && (
        <div className="table-toolbar">
          {searchKeys.length > 0 && (
            <div className="search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label="Search" />
            </div>
          )}
          {filters.map((f) => (
            <select key={f.key} value={filterValues[f.key] || ''} onChange={(e) => setFilterValues((v) => ({ ...v, [f.key]: e.target.value }))} aria-label={f.label}>
              <option value="">{f.label}</option>
              {f.options.map((o) => {
                const opt = typeof o === 'object' ? o : { value: o, label: o };
                return <option key={opt.value} value={opt.value}>{opt.label}</option>;
              })}
            </select>
          ))}
          {toolbar && <div className="toolbar-extra">{toolbar}</div>}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.className}>
                  {c.sortable ? (
                    <button className="th-sort" onClick={() => toggleSort(c.key)}>{c.header}<ArrowUpDown size={12} /></button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="cell-state">Loading...</td></tr>
            ) : slice.length === 0 ? (
              <tr><td colSpan={columns.length} className="cell-state">{rows.length ? 'No records match your search or filters.' : empty}</td></tr>
            ) : (
              slice.map((row, i) => (
                <tr key={row[rowKey] ?? i}>
                  {columns.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(row) : row[c.key] ?? '-'}</td>)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {visible.length > pageSize && (
        <div className="pager">
          <span>Showing {(current - 1) * pageSize + 1}-{Math.min(current * pageSize, visible.length)} of {visible.length}</span>
          <div>
            <button className="icon-btn" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
            <span className="pager-page">{current} / {pages}</span>
            <button className="icon-btn" disabled={current === pages} onClick={() => setPage(current + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
