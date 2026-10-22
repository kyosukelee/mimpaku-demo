import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);
export const supabase = createClient(url ?? "http://localhost", key ?? "anon-key-not-set");
export const guideBase = ((import.meta.env.VITE_GUIDE_URL as string | undefined) ?? "").replace(/\/+$/, "");
