import AdminCard from "@/components/AdminCard";
import { buttonCls, inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { importCsv, removeAllProducts, removeProduct, saveAdsConfig, toggleProduct, updateProductImage } from "@/app/admin/ads/actions";
import { getAdsConfig } from "@/lib/ads";
import { AD_PAGE_TYPES, AD_PLACEMENTS, ALWAYS_EXCLUDED, type AdPageType, type AdPlacement } from "@/lib/ads-config";
import { listProducts } from "@/lib/affiliate-repo";
import { formatNumber } from "@/lib/format";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const MSG: Record<string, { tone: "ok" | "error"; text: string }> = {
  "ok:saved": { tone: "ok", text: "บันทึกแล้ว — หน้าเว็บทั้งหมดอัปเดตตามการตั้งค่าใหม่" },
  "ok:cleared": { tone: "ok", text: "ลบสินค้าทั้งหมดแล้ว" },
  "error:no-file": { tone: "error", text: "ยังไม่ได้เลือกไฟล์" },
  "error:too-big": { tone: "error", text: "ไฟล์ใหญ่เกิน 5MB" },
  "error:image": { tone: "error", text: "ลิงก์รูปต้องขึ้นต้นด้วย https://" },
};

export default async function AdsAdminPage({ searchParams }: Props) {
  const q = await searchParams;
  const ok = one(q.ok);
  const error = one(q.error);
  const msg =
    ok === "imported"
      ? { tone: "ok" as const, text: `นำเข้าแล้ว — เพิ่มใหม่ ${one(q.added)} · อัปเดต ${one(q.updated)} · ข้าม ${one(q.skipped)} แถว (ไม่มีชื่อหรือลิงก์)` }
      : error === "no-rows"
        ? { tone: "error" as const, text: `ไม่พบรายการสินค้าในไฟล์ — ต้องมีคอลัมน์ชื่อสินค้าและลิงก์ · หัวตารางที่พบ: ${one(q.headers) || "-"}` }
        : ok
          ? MSG[`ok:${ok}`]
          : error
            ? MSG[`error:${error}`]
            : undefined;

  const [cfg, products] = await Promise.all([getAdsConfig(), listProducts().catch(() => [])]);
  const active = products.filter((p) => p.active).length;
  const clicks = products.reduce((s, p) => s + p.clicks, 0);
  const chk = (name: string, on: boolean) => <input type="checkbox" name={name} value="1" defaultChecked={on} />;

  return (
    <>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <AdminCard
        title="โฆษณาสินค้า Shopee Affiliate"
        actions={<span className={cfg.enabled ? "font-bold text-green-800" : "text-wiki-muted"}>{cfg.enabled ? "● เปิดอยู่" : "○ ปิดอยู่"}</span>}
      >
        <p className="mb-3 text-sm">
          สร้างลิงก์ที่ <a href="https://affiliate.shopee.co.th" target="_blank" rel="noopener">affiliate.shopee.co.th</a> → เลือกสินค้า → สร้างลิงก์หลายรายการ → ดาวน์โหลดไฟล์ CSV
          แล้วนำเข้าด้านล่าง · การ์ดสินค้าจะสุ่มแสดงในตำแหน่งที่เปิดไว้ คลิกผ่าน <span className="font-mono">/go/[id]</span> เพื่อนับคลิก (ค่าคอมดูได้ในเว็บ Shopee Affiliate)
        </p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            ["สินค้าที่แสดง", `${formatNumber(active)} / ${formatNumber(products.length)}`],
            ["คลิกรวม", formatNumber(clicks)],
            ["ตำแหน่งที่เปิด", `${Object.values(cfg.placements).filter(Boolean).length} / ${Object.keys(AD_PLACEMENTS).length}`],
          ].map(([k, v]) => (
            <div key={k} className="border border-wiki-border-light p-3">
              <div className="text-xs text-wiki-muted">{k}</div>
              <div className="font-serif text-xl tabular-nums">{v}</div>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard title="ตั้งค่า">
        <form action={saveAdsConfig} className="space-y-4 text-sm">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 font-bold">
              {chk("enabled", cfg.enabled)} เปิดแสดงสินค้า
            </label>
            <label className="flex items-center gap-2">
              {chk("hideForPaid", cfg.hideForPaid)} ไม่แสดงให้สมาชิกแพ็กเกจเสียเงิน/ทดลองใช้
            </label>
          </div>

          <fieldset className="border border-wiki-border-light p-3">
            <legend className="px-1 font-bold">ตำแหน่ง</legend>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {(Object.keys(AD_PLACEMENTS) as AdPlacement[]).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  {chk(`place_${k}`, cfg.placements[k])} {AD_PLACEMENTS[k].label} ({AD_PLACEMENTS[k].count} ชิ้น)
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="border border-wiki-border-light p-3">
            <legend className="px-1 font-bold">หน้าที่แสดง</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {(Object.keys(AD_PAGE_TYPES) as AdPageType[]).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  {chk(`page_${k}`, cfg.pages[k])} {AD_PAGE_TYPES[k]}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-wiki-muted">
              ไม่แสดงเสมอ: <span className="font-mono">{ALWAYS_EXCLUDED.join(" ")}</span>
            </p>
            <label className="mt-2 flex flex-col gap-1">
              ไม่แสดงในหน้าเพิ่มเติม (path ขึ้นต้นด้วย คั่นด้วยเว้นวรรค)
              <input name="extraExcluded" defaultValue={cfg.extraExcluded.join(" ")} placeholder="เช่น /jobs /news" className={`${inputCls} font-mono`} />
            </label>
          </fieldset>

          <button type="submit" className={primaryButtonCls}>
            บันทึก
          </button>
        </form>
      </AdminCard>

      <section id="products">
        <AdminCard
          title={`สินค้า (${formatNumber(products.length)})`}
          actions={
            products.length > 0 && (
              <form action={removeAllProducts}>
                <button type="submit" className="text-red-800 hover:underline">
                  ลบทั้งหมด
                </button>
              </form>
            )
          }
        >
          <form action={importCsv} className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <input type="file" name="file" accept=".csv,text/csv,.txt" required className={inputCls} />
            <button type="submit" className={primaryButtonCls}>
              นำเข้า CSV
            </button>
            <span className="text-xs text-wiki-muted">สินค้าเดิม (Item Id ซ้ำ) จะอัปเดตลิงก์ใหม่ จำนวนคลิกเดิมยังอยู่</span>
          </form>

          {products.length === 0 ? (
            <p className="text-sm text-wiki-muted">ยังไม่มีสินค้า</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="wikitable w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col">สินค้า</th>
                    <th scope="col">ราคา</th>
                    <th scope="col">ค่าคอม</th>
                    <th scope="col">คลิก</th>
                    <th scope="col">รูป (ลิงก์ https)</th>
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                      <td className="max-w-80">
                        <a href={p.productUrl ?? p.offerUrl} target="_blank" rel="noopener">
                          {p.name}
                        </a>
                        {p.shop && <div className="text-xs text-wiki-muted">{p.shop}</div>}
                      </td>
                      <td className="whitespace-nowrap">{p.price ?? "-"}</td>
                      <td>{p.commission ?? "-"}</td>
                      <td className="text-right tabular-nums">{formatNumber(p.clicks)}</td>
                      <td>
                        <form action={updateProductImage} className="flex gap-1">
                          <input type="hidden" name="id" value={p.id} />
                          <input name="imageUrl" defaultValue={p.imageUrl ?? ""} placeholder="https://..." className={`${inputCls} w-40 text-xs`} />
                          <button type="submit" className={buttonCls}>
                            บันทึก
                          </button>
                        </form>
                      </td>
                      <td className="whitespace-nowrap">
                        <form action={toggleProduct} className="inline">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                          <button type="submit" className="text-wiki-link hover:underline">
                            {p.active ? "ซ่อน" : "แสดง"}
                          </button>
                        </form>{" "}
                        ·{" "}
                        <form action={removeProduct} className="inline">
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="text-red-800 hover:underline">
                            ลบ
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </section>
    </>
  );
}
