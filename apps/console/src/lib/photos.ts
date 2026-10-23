import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { PHOTO_BUCKET } from "../types";

// 写真のパスから、期限つきの表示用URLを作る(非公開バケットなので、直接は開けない)
export function usePhotoUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join("|");
  useEffect(() => {
    let alive = true;
    if (paths.length === 0) { setUrls({}); return; }
    supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      if (!alive || !data) return;
      const map: Record<string, string> = {};
      for (const row of data) if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
      setUrls(map);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
