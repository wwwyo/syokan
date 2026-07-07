import { z } from "zod";
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { type InlineContent, inlineContentSchema, InlineContentView } from "../inline";

export const tablePropsSchema = z
  .object({
    // header cells; the column count follows this array
    columns: z.array(inlineContentSchema).min(1),
    // shorter rows are padded on render; a row wider than the header would silently drop
    // its extra cells, so reject it rather than lose data
    rows: z.array(z.array(inlineContentSchema)),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.rows.forEach((row, i) => {
      if (row.length > value.columns.length) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", i],
          message: `row has ${row.length} cells but there are ${value.columns.length} columns`,
        });
      }
    });
  });

export type TableProps = z.infer<typeof tablePropsSchema>;

/**
 * Display-only table for aggregations and listings. Cells accept plain strings or
 * inline nodes (Text / Link / Badge / Time); narrowing rows is not a Table concern —
 * that's the cross-cutting tag mechanism (TagFilter).
 */
export function Table({ columns, rows }: TableProps) {
  return (
    <div data-slot="catalog-table" className="overflow-x-auto">
      <UITable>
        <TableHeader>
          <TableRow>
            {columns.map((column, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
              <TableHead key={i}>
                <InlineContentView content={column} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
            <TableRow key={rowIndex}>
              {columns.map((_, cellIndex) => {
                const cell: InlineContent | undefined = row[cellIndex];
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
                  <TableCell key={cellIndex} className="align-top">
                    {cell !== undefined ? (
                      <InlineContentView content={cell} />
                    ) : null}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </UITable>
    </div>
  );
}
