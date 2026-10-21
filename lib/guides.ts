/**
 * คู่มือ / บทความความรู้ (เขียนโดยทีมงาน) — เนื้อหาอยู่ใน content/guides/*.tsx
 * เพิ่มบทความ: สร้างไฟล์ใหม่ใน content/guides แล้วเพิ่มใน GUIDES ด้านล่าง
 */
import type { ComponentType } from "react";
import PartnerCheckGuide, { meta as partnerCheck } from "@/content/guides/partner-check";
import CompanyStatusGuide, { meta as companyStatus } from "@/content/guides/company-status";
import VatGuide, { meta as vat } from "@/content/guides/vat-registration";
import TisiGuide, { meta as tisi } from "@/content/guides/tisi-standard";
import TsicGuide, { meta as tsic } from "@/content/guides/tsic-business-type";
import ProcurementGuide, { meta as procurement } from "@/content/guides/government-procurement";
import CertificateGuide, { meta as certificate } from "@/content/guides/company-certificate";
import CapitalGuide, { meta as capital } from "@/content/guides/registered-capital";
import CompanyTypesGuide, { meta as companyTypes } from "@/content/guides/company-types";
import PublicCompanyGuide, { meta as publicCompany } from "@/content/guides/public-company";
import JuristicIdGuide, { meta as juristicId } from "@/content/guides/juristic-id";
import FinancialGuide, { meta as financial } from "@/content/guides/financial-statements";
import ObjectivesGuide, { meta as objectives } from "@/content/guides/company-objectives";
import AddressGuide, { meta as address } from "@/content/guides/registered-address";
import ScamsGuide, { meta as scams } from "@/content/guides/business-scams";
import TaxInvoiceGuide, { meta as taxInvoice } from "@/content/guides/tax-invoice";
import LeadsGuide, { meta as leads } from "@/content/guides/b2b-leads-pdpa";
import SellingGovGuide, { meta as sellingGov } from "@/content/guides/selling-to-government";

export interface GuideMeta {
  slug: string;
  title: string;
  /** คำอธิบายสั้น (meta description / การ์ดในหน้ารวม) */
  description: string;
  /** วันที่เผยแพร่ / ปรับปรุง (YYYY-MM-DD) */
  published: string;
  updated: string;
  /** เวลาอ่านโดยประมาณ (นาที) */
  minutes: number;
  /** หมวดในหน้ารวมคู่มือ */
  category: GuideCategory;
}

export const GUIDE_CATEGORIES = ["ตรวจสอบคู่ค้า", "พื้นฐานนิติบุคคล", "ภาษีและเอกสาร", "ทำธุรกิจ", "สถิติธุรกิจ"] as const;
export type GuideCategory = (typeof GUIDE_CATEGORIES)[number];

export interface Guide extends GuideMeta {
  Body: ComponentType;
}

export const GUIDES: Guide[] = [
  { ...partnerCheck, Body: PartnerCheckGuide },
  { ...companyStatus, Body: CompanyStatusGuide },
  { ...vat, Body: VatGuide },
  { ...capital, Body: CapitalGuide },
  { ...certificate, Body: CertificateGuide },
  { ...tsic, Body: TsicGuide },
  { ...procurement, Body: ProcurementGuide },
  { ...tisi, Body: TisiGuide },
  { ...scams, Body: ScamsGuide },
  { ...financial, Body: FinancialGuide },
  { ...address, Body: AddressGuide },
  { ...companyTypes, Body: CompanyTypesGuide },
  { ...publicCompany, Body: PublicCompanyGuide },
  { ...juristicId, Body: JuristicIdGuide },
  { ...objectives, Body: ObjectivesGuide },
  { ...taxInvoice, Body: TaxInvoiceGuide },
  { ...leads, Body: LeadsGuide },
  { ...sellingGov, Body: SellingGovGuide },
];

export const getGuide = (slug: string) => GUIDES.find((g) => g.slug === slug) ?? null;
