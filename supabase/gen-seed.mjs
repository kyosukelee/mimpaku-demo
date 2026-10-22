// data/property.json から seed.sql を作る。 使い方: node supabase/gen-seed.mjs
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("../data/property.json", import.meta.url), "utf8"));
const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const b = (v) => (v ? "true" : "false");

const p = data.property;
const pcols = ["slug", "name_ja", "name_en", "tagline_ja", "tagline_en", "area_ja", "area_en", "check_in", "check_out", "emergency_phone", "emergency_note_ja", "emergency_note_en"];

let sql = `-- 架空データの投入(最初の1回だけ実行する)。 data/property.json から生成。\n`;
sql += `insert into public.properties (${pcols.join(", ")}, is_published)\nvalues (${pcols.map((c) => q(p[c])).join(", ")}, ${b(p.is_published)})\non conflict (slug) do nothing;\n\n`;

const icols = ["category", "display", "sort_order", "title_ja", "title_en", "body_ja", "body_en", "map_query"];
const rows = data.items.map(
  (i) => `  ((select id from public.properties where slug = ${q(p.slug)}), ${q(i.category)}, ${q(i.display)}, ${i.sort_order}, ${q(i.title_ja)}, ${q(i.title_en)}, ${q(i.body_ja)}, ${q(i.body_en)}, ${q(i.map_query)}, ${b(i.requires_code)}, ${b(i.is_published)})`
);
sql += `insert into public.guide_items (property_id, ${icols.join(", ")}, requires_code, is_published)\nselect * from (values\n${rows.join(",\n")}\n) as v(property_id, ${icols.join(", ")}, requires_code, is_published)\nwhere not exists (\n  select 1 from public.guide_items g where g.property_id = (select id from public.properties where slug = ${q(p.slug)})\n);\n`;

fs.writeFileSync(new URL("./seed.sql", import.meta.url), sql);
console.log("seed.sql を作りました:", data.items.length, "項目");
