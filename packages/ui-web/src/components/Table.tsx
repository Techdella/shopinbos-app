import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  selectedKey?: string;
  className?: string;
}

/** Data table inside a card; scrolls horizontally on narrow screens. */
export function Table<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  onRowClick,
  selectedKey,
  className,
}: TableProps<T>) {
  return (
    <div className={cn('overflow-x-auto rounded-card border border-line bg-paper', className)}>
      <table className="w-full border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'px-4 py-3 text-xs font-semibold text-sub',
                  c.align === 'right' && 'text-right',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sub">
                {empty ?? 'Nothing here yet.'}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  aria-selected={selectedKey !== undefined ? selectedKey === key : undefined}
                  className={cn(
                    'border-b border-line last:border-b-0',
                    onRowClick && 'cursor-pointer hover:bg-canvas',
                    selectedKey === key && 'bg-canvas',
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 py-3 text-ink',
                        c.align === 'right' && 'text-right',
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
