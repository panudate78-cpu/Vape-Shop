# Product CSV import and export

## Workflow
1. **Export** (`Export current inventory`) gives a CSV of every variant.
2. **Edit** in a spreadsheet. Keep the header row.
3. **Upload** on the Import page. The file is checked and planned first. Nothing is written yet.
4. **Review** the list: **New**, **Update** (with the old and new value for each change), **No change**, **Rejected** (with the reason).
5. **Download corrections** if any rows are rejected. The file holds only those rows, with an `error` column. Fix and re-upload it.
6. **Apply.** Valid rows are written one at a time. Rejected rows are skipped. Each applied import appears in **Import history** with its row-level changes. Previews are not recorded.

## Blank cells
A blank cell never changes existing data. It only sets a value for a **new** product or variant.
Blank cells cannot clear a value. Clearing needs a separate marker, which the import does not have yet. Clear values in the product editor instead.

## Validation
| Column | Rule |
|---|---|
| `price`, `cost_price` | Above 0, at most 2 decimals. `£` is accepted. |
| `stock`, `low_stock_threshold` | Whole number, 0 or more. |
| `is_active` | `true`/`false`, `yes`/`no`, `1`/`0`. |
| `barcode` | 8 to 14 digits (EAN/UPC). Must not be used by another variant. |
| `images` | `https://` links, separated by `|` or `;`. No spaces. |
| `sku` | Must be unique within the file. |
| `product_name` | Required for a new product. Matched to an existing product by exact name, ignoring case. |
| `price` on a new product | Required, because it becomes the base price. |

## Round-trip table (export → edit → import)
| Column | Round-trips | Notes |
|---|---|---|
| `sku` | Yes | The key that matches a variant. |
| `product_name` | Yes | Repeat it on every variant row of a product. |
| `brand` | Yes | |
| `category` | Yes, if set | Blank does not clear the category. |
| `description` | Yes, if set | Blank does not clear it. |
| `images` | Yes, if set | Blank does not clear them. |
| `cost_price` | Yes, if set | Never shown to customers. |
| `flavor`, `nicotine_strength`, `bottle_size`, `color` | Yes, if set | Blank does not clear them. |
| `stock` | Yes | Set this to 0 to show zero stock. |
| `price` | Yes | The variant's own price. Blank means the product's `base_price` applies. Import cannot return a variant to "inherit". |
| `low_stock_threshold` | Yes | |
| `is_active` | Yes | |
| `barcode` | Yes, if set | Blank does not clear it. |
| `base_price` | Export only | Read-only. The import ignores it. Change it in the product editor. |

**Not in the CSV at all:** compliance details (product type, device type, compatibility, VG/PG, age-restriction flag, MHRA reference, batch numbers, tank and container sizes, supplier documents), product tags, reserved stock and stock batches. Edit these in **Admin → Compliance** or the product editor.

## Verified
- `tests/import-safety.cjs`: 42 checks pass (blank cells, invalid values, duplicates, image links, preview writes nothing, labels and changes, corrections file, in-file product creation, history, access).
- `tests/roundtrip.cjs`: an exported file, previewed unchanged, reports no changes and no rejected rows. An inheriting price stays inherited.
