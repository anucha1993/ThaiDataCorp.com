import type { JuristicProfile } from "@/types/company";

/**
 * ปุ่มค้นหาข้อมูลเพิ่มเติมจากภายนอก (เบอร์โทร / Facebook / ข่าว / แผนที่)
 * เป็นแค่ลิงก์ไปหน้าผลค้นหา — ไม่ดึงหรือเก็บข้อมูลจากเว็บอื่น ผู้ใช้ตัดสินเองว่าผลไหนตรงบริษัท
 */
export default function ExternalLookup({ profile }: { profile: JuristicProfile }) {
  const name = profile.nameTh;
  const q = (s: string) => encodeURIComponent(s);
  const links = [
    { label: "ค้นหาเบอร์โทร", href: `https://www.google.com/search?q=${q(`"${name}" เบอร์โทร`)}` },
    { label: "Facebook", href: `https://www.google.com/search?q=${q(`"${name}" site:facebook.com`)}` },
    { label: "ข่าว", href: `https://news.google.com/search?q=${q(`"${name}"`)}&hl=th&gl=TH&ceid=TH:th` },
    {
      label: "แผนที่",
      href: `https://www.google.com/maps/search/?api=1&query=${q(`${name} ${profile.address.full !== "-" ? profile.address.full : ""}`.trim())}`,
    },
  ];

  return (
    <nav aria-label="ค้นหาข้อมูลเพิ่มเติม" className="mt-4">
      <p className="mb-1 text-xs text-wiki-muted">ค้นหาข้อมูลเพิ่มเติมจากภายนอก (เปิดในแท็บใหม่)</p>
      <ul className="flex flex-wrap gap-2 text-sm">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener nofollow"
              className="inline-block border border-wiki-border bg-wiki-bg px-3 py-1 hover:bg-wiki-header hover:no-underline"
            >
              {l.label} ↗
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
