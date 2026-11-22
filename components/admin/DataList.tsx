import type { ReactNode } from "react";

/**
 * Wireframe A13 pattern: real table with scope="col" headers from 1024 px, one card per row on a phone.
 * Both views come from the same column list, so they never disagree. Server component, no state.
 */
export type Column<T> = { header: string; render: (row: T) => ReactNode; /** Mobile card: show without the header label (main line). */ primary?: boolean };

export function DataList<T>({ rows, columns, rowKey, caption }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; caption: string }) {
  return (
    <>
      <div className="adm-table-wrap">
        <table className="admin-table adm-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.header} scope="col">{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c) => (
                  <td key={c.header}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="adm-rows" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className="adm-rowcard">
            {columns.map((c) => (
              <div key={c.header} className={c.primary ? "adm-rowcard-main" : "adm-rowcard-line"}>
                {!c.primary && <span className="adm-rowcard-label">{c.header}</span>}
                <span>{c.render(r)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}
