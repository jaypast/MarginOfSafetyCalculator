---
name: drizzle-zod $type columns need explicit zod overrides
description: createInsertSchema widens varchar().$type<Union>() columns back to plain z.string(); insert schemas must override them with z.enum.
---

`createInsertSchema(table)` from drizzle-zod does NOT preserve a narrowed
`.$type<'a' | 'b'>()` on varchar/text columns — the generated insert schema
falls back to `z.string()`, so `z.infer` produces `string` and assignments
into the `$inferSelect` type (or `.values()` calls) fail tsc with
"Type 'string' is not assignable to type 'a' | 'b'".

**Why:** drizzle-zod derives from the column's runtime dataType (string),
not the TypeScript-only `$type` annotation.

**How to apply:** pass a refinement map as the second argument:
`createInsertSchema(table, { status: z.enum(STATUSES) }).omit({ id: true })`.
Do this for every `$type`-narrowed column that appears in an insert schema.
