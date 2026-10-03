/**
 * ฟอร์มตัวกรอง + ปุ่มดาวน์โหลด CSV ที่ใช้ซ้ำในหลายหน้า (HTML form ล้วน ไม่ต้องใช้ JavaScript)
 * - หน้า static (TSIC / อันดับ / หน่วยงาน) วางฟอร์มนี้เป็น "กล่องเครื่องมือ" ที่ส่งไปหน้าค้นหาของสมาชิก
 * - หน้าค้นหาของสมาชิกใช้ฟอร์มเดียวกันพร้อมค่าที่เลือกไว้
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { GuestOnly } from "@/components/MemberGate";
import { primaryButtonCls } from "@/components/Panel";
import {
  AGENCY_SORTS,
  CONTRACT_METHODS,
  CONTRACT_SORTS,
  CONTRACT_TYPES,
  WINNER_SORTS,
  type AgencyFilters,
  type ContractFilters,
  type WinnerFilters,
} from "@/lib/procurement-search";

export const fieldCls = "w-full min-w-0 border border-wiki-border bg-white px-2 py-1";

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

function Options({ items, all }: { items: readonly string[]; all: string }) {
  return (
    <>
      <option value="">{all}</option>
      {items.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </>
  );
}

/** กรอบกล่องเครื่องมือ + ปุ่ม "ค้นหา" และ "ดาวน์โหลด CSV" */
export function FilterBox({
  title,
  action,
  exportAction,
  hidden,
  children,
  open = true,
}: {
  title: string;
  action: string;
  exportAction: string;
  hidden?: Record<string, string | undefined>;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="my-4 border border-wiki-border bg-wiki-bg text-sm">
      <summary className="cursor-pointer px-3 py-2 font-bold">
        🔎 {title}{" "}
        <GuestOnly>
          <span className="font-normal text-wiki-muted">(สำหรับสมาชิก — สมัครฟรี)</span>
        </GuestOnly>
      </summary>
      <form action={action} method="get" className="border-t border-wiki-border px-3 py-3">
        {Object.entries(hidden ?? {}).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="submit" className="border border-wiki-link bg-wiki-link px-4 py-1.5 font-bold text-white hover:opacity-90">
            ค้นหา / กรอง
          </button>
          <button
            type="submit"
            formAction={exportAction}
            className="border border-wiki-border bg-white px-4 py-1.5 font-bold text-wiki-text hover:bg-wiki-header"
          >
            ⬇ ดาวน์โหลด CSV
          </button>
        </div>
      </form>
    </details>
  );
}

/** แสดงแทนผลลัพธ์เมื่อยังไม่ได้เข้าสู่ระบบ */
export function MemberLock({ next, what }: { next: string; what: string }) {
  return (
    <div className="my-4 border border-wiki-border bg-wiki-bg px-4 py-5 text-center">
      <p className="mb-3">{what}สำหรับสมาชิก — สมัครฟรี ด้วยอีเมลหรือ Google</p>
      <Link href={`/register?next=${encodeURIComponent(next)}`} className={primaryButtonCls}>
        สมัครสมาชิกฟรี
      </Link>
      <p className="mt-3 text-sm">
        มีบัญชีแล้ว? <Link href={`/login?next=${encodeURIComponent(next)}`}>เข้าสู่ระบบ</Link>
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- ฟิลด์ */

export function ContractFields({ f, provinces, fixedAgency }: { f?: ContractFilters; provinces: string[]; fixedAgency?: boolean }) {
  return (
    <>
      <Field label="คำในชื่อโครงการ" wide>
        <input name="q" defaultValue={f?.q ?? ""} placeholder="เช่น ถนน, คอมพิวเตอร์, ก่อสร้างอาคาร" className={fieldCls} />
      </Field>
      {!fixedAgency && (
        <Field label="หน่วยงาน (คำในชื่อ)">
          <input name="agency_q" defaultValue={f?.agencyQ ?? ""} placeholder="เช่น กรมทางหลวง, เทศบาล" className={fieldCls} />
        </Field>
      )}
      <Field label="ผู้รับสัญญา (ชื่อ หรือเลข 13 หลัก)">
        <input name="winner" defaultValue={f?.winner ?? ""} className={fieldCls} />
      </Field>
      <Field label="จังหวัดที่ตั้งโครงการ">
        <select name="province" defaultValue={f?.province ?? ""} className={fieldCls}>
          <Options items={provinces} all="ทุกจังหวัด" />
        </select>
      </Field>
      <Field label="วิธีจัดซื้อจัดจ้าง">
        <select name="method" defaultValue={f?.method ?? ""} className={fieldCls}>
          <Options items={CONTRACT_METHODS} all="ทุกวิธี" />
        </select>
      </Field>
      <Field label="ประเภทโครงการ">
        <select name="type" defaultValue={f?.type ?? ""} className={fieldCls}>
          <Options items={CONTRACT_TYPES} all="ทุกประเภท" />
        </select>
      </Field>
      <Field label="ลงนามตั้งแต่วันที่">
        <input type="date" name="from" defaultValue={f?.from ?? ""} className={fieldCls} />
      </Field>
      <Field label="ถึงวันที่">
        <input type="date" name="to" defaultValue={f?.to ?? ""} className={fieldCls} />
      </Field>
      <Field label="มูลค่าสัญญาขั้นต่ำ (บาท)">
        <input name="vmin" inputMode="numeric" defaultValue={f?.vmin ?? ""} className={fieldCls} />
      </Field>
      <Field label="มูลค่าสัญญาสูงสุด (บาท)">
        <input name="vmax" inputMode="numeric" defaultValue={f?.vmax ?? ""} className={fieldCls} />
      </Field>
      <Field label="จัดเรียง">
        <select name="sort" defaultValue={f?.sort ?? "new"} className={fieldCls}>
          {Object.entries(CONTRACT_SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

export function WinnerFields({ f, provinces }: { f?: WinnerFilters; provinces: string[] }) {
  return (
    <>
      <Field label="ชื่อบริษัท หรือเลขทะเบียน 13 หลัก">
        <input name="q" defaultValue={f?.q ?? ""} className={fieldCls} />
      </Field>
      <Field label="จังหวัดที่ตั้งโครงการ">
        <select name="province" defaultValue={f?.province ?? ""} className={fieldCls}>
          <Options items={provinces} all="ทั่วประเทศ" />
        </select>
      </Field>
      <Field label="จัดเรียง">
        <select name="sort" defaultValue={f?.sort ?? "value"} className={fieldCls}>
          {Object.entries(WINNER_SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="จำนวนสัญญาขั้นต่ำ">
        <input name="min_contracts" inputMode="numeric" defaultValue={f?.minContracts ?? ""} className={fieldCls} />
      </Field>
      <Field label="มูลค่ารวมขั้นต่ำ (บาท)">
        <input name="min_value" inputMode="numeric" defaultValue={f?.minValue ?? ""} className={fieldCls} />
      </Field>
    </>
  );
}

export function AgencyFields({ f, provinces }: { f?: AgencyFilters; provinces: string[] }) {
  return (
    <>
      <Field label="คำในชื่อหน่วยงาน">
        <input name="q" defaultValue={f?.q ?? ""} placeholder="เช่น เทศบาล, โรงพยาบาล, กรม" className={fieldCls} />
      </Field>
      <Field label="จังหวัดหลักของโครงการ">
        <select name="province" defaultValue={f?.province ?? ""} className={fieldCls}>
          <Options items={provinces} all="ทุกจังหวัด" />
        </select>
      </Field>
      <Field label="จัดเรียง">
        <select name="sort" defaultValue={f?.sort ?? "value"} className={fieldCls}>
          {Object.entries(AGENCY_SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="จำนวนสัญญาขั้นต่ำ">
        <input name="min_contracts" inputMode="numeric" defaultValue={f?.minContracts ?? ""} className={fieldCls} />
      </Field>
      <Field label="มูลค่ารวมขั้นต่ำ (บาท)">
        <input name="min_value" inputMode="numeric" defaultValue={f?.minValue ?? ""} className={fieldCls} />
      </Field>
    </>
  );
}

/** ตัวกรองรายชื่อบริษัท (ใช้กับหน้า TSIC → ส่งไปหน้าค้นหาขั้นสูง /search) */
export function CompanyFields({ provinces, province }: { provinces: string[]; province?: string }) {
  return (
    <>
      <Field label="จังหวัด">
        <select name="province" defaultValue={province ?? ""} className={fieldCls}>
          <Options items={provinces} all="ทุกจังหวัด" />
        </select>
      </Field>
      <Field label="สถานะ">
        <select name="status" defaultValue="" className={fieldCls}>
          <option value="">ทั้งหมด</option>
          <option value="active">ยังดำเนินกิจการ</option>
          <option value="dissolved">เลิก / ร้าง / ชำระบัญชีแล้ว</option>
        </select>
      </Field>
      <Field label="จัดเรียง">
        <select name="sort" defaultValue="new" className={fieldCls}>
          <option value="new">จดทะเบียนล่าสุด</option>
          <option value="old">จดทะเบียนเก่าสุด</option>
          <option value="capital">ทุนจดทะเบียนมากสุด</option>
          <option value="name">ชื่อ ก–ฮ</option>
        </select>
      </Field>
      <Field label="จดทะเบียนตั้งแต่วันที่">
        <input type="date" name="from" className={fieldCls} />
      </Field>
      <Field label="ถึงวันที่">
        <input type="date" name="to" className={fieldCls} />
      </Field>
      <Field label="ทุนจดทะเบียนขั้นต่ำ (บาท)">
        <input name="cap_min" inputMode="numeric" className={fieldCls} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-1">
        <input type="checkbox" name="gov" value="1" />
        เคยได้งานภาครัฐ (e-GP)
      </label>
    </>
  );
}
