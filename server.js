/**
 * Startup file สำหรับ Plesk (Node.js / Phusion Passenger)
 *
 * ตั้งค่าใน Plesk → Node.js:
 *   Application Startup File: server.js
 *   Application Mode:         production
 *
 * ก่อนรันต้อง `npm run build` แล้ว (สร้างโฟลเดอร์ .next)
 * Passenger กำหนดพอร์ตให้เอง — ใช้ PORT ถ้ามี ไม่มีใช้ 3000
 */
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const { createServer } = require("http");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, () => {
      console.log(`> ThaiDataCorp ready on port ${port} (${process.env.NODE_ENV ?? "production"})`);
    });
  })
  .catch((err) => {
    console.error("Failed to start Next.js:", err);
    process.exit(1);
  });
