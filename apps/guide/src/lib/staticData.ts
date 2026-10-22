import raw from "../../../../data/property.json";
import type { GuideData } from "./guide";

// ビルド時の初期表示と、Supabaseにつながらないときの予備に使う。
export const staticData = raw as unknown as GuideData;
