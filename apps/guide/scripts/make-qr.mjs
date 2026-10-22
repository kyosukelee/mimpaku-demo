// 使い方: npm run qr -- https://<公開URL>/p/hiroshima-demo/
// 物件に貼るQRコード(PNG)を docs/qr-hiroshima-demo.png に作る
import QRCode from "qrcode";
import { mkdirSync } from "node:fs";

const url = process.argv[2];
if (!url || !/^https:\/\//.test(url)) {
  console.error("URLをhttps://から指定してください。例: npm run qr -- https://mimpaku-demo.pages.dev/p/hiroshima-demo/");
  process.exit(1);
}
mkdirSync("../../docs", { recursive: true });
const out = "../../docs/qr-hiroshima-demo.png";
await QRCode.toFile(out, url, { width: 800, margin: 4, errorCorrectionLevel: "M" });
console.log("作成しました:", out);
