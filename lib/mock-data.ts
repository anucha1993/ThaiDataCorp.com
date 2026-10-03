/**
 * Mock Data สำหรับช่วงพัฒนา (ใช้เมื่อไม่ได้ตั้ง GDX_CONSUMER_KEY)
 *
 * - Profile อยู่ในรูปแบบ Raw ของ GDX/DBD เพื่อให้ผ่าน normalizer ตัวเดียวกับข้อมูลจริง
 * - ชื่อบริษัทและบุคคลทั้งหมดเป็นข้อมูลสมมติ เลขทะเบียนผ่าน checksum แต่ไม่ใช่บริษัทจริง
 */
import type {
  DbdRawProfileResponse,
  DirectorsApiResponse,
  FinancialsApiResponse,
} from "@/types/company";

interface MockCompany {
  profile: DbdRawProfileResponse;
  people: DirectorsApiResponse;
  financials: FinancialsApiResponse;
}

export const MOCK_COMPANIES: Record<string, MockCompany> = {
  "0105553000121": {
    profile: {
      ResultList: [
        {
          "cd:OrganizationJuristicPerson": {
            "cd:OrganizationJuristicID": "0105553000121",
            "cd:OrganizationJuristicNameTH": "บริษัท ตัวอย่าง เทคโนโลยี จำกัด",
            "cd:OrganizationJuristicNameEN": "SAMPLE TECHNOLOGY COMPANY LIMITED",
            "cd:OrganizationJuristicType": "บริษัทจำกัด",
            "cd:OrganizationJuristicRegisterDate": "25530315",
            "cd:OrganizationJuristicStatus": "ยังดำเนินกิจการอยู่",
            "cd:OrganizationJuristicObjective": {
              "td:JuristicObjective": {
                "td:JuristicObjectiveCode": "62011",
                "td:JuristicObjectiveTextTH": "การจัดทำโปรแกรมคอมพิวเตอร์ที่เป็นซอฟต์แวร์สำเร็จรูป",
              },
            },
            "cd:OrganizationJuristicRegisterCapital": "5000000",
            "cd:OrganizationJuristicPaidUpCapital": "5000000",
            "cd:OrganizationJuristicBranchName": "สำนักงานใหญ่",
            "cd:OrganizationJuristicAddress": {
              "cr:AddressType": {
                "cd:AddressNo": "99/9",
                "cd:Building": "อาคารตัวอย่างทาวเวอร์ ชั้น 12",
                "cd:Street": "ถนนสุขุมวิท",
                "cd:Soi": "สุขุมวิท 21",
                "cd:CitySubDivision": { "cr:CitySubDivisionTextTH": "คลองเตยเหนือ" },
                "cd:City": { "cr:CityTextTH": "วัฒนา" },
                "cd:CountrySubDivision": { "cr:CountrySubDivisionTextTH": "กรุงเทพมหานคร" },
                "cd:PostCode": "10110",
              },
            },
          },
        },
      ],
    },
    people: {
      directors: [
        { order: 1, name: "นายสมมติ ใจดี", position: "กรรมการผู้จัดการ" },
        { order: 2, name: "นางสาวตัวอย่าง รักงาน", position: "กรรมการ" },
        { order: 3, name: "นายทดสอบ มั่นคง", position: "กรรมการ" },
      ],
      shareholders: [
        { order: 1, name: "นายสมมติ ใจดี", nationality: "ไทย", shares: 25000, percent: 50 },
        { order: 2, name: "นางสาวตัวอย่าง รักงาน", nationality: "ไทย", shares: 15000, percent: 30 },
        { order: 3, name: "นายทดสอบ มั่นคง", nationality: "ไทย", shares: 10000, percent: 20 },
      ],
      authorizedSignatory:
        "นายสมมติ ใจดี ลงลายมือชื่อและประทับตราสำคัญของบริษัท หรือกรรมการสองคนลงลายมือชื่อร่วมกันและประทับตราสำคัญของบริษัท",
    },
    financials: {
      financials: [
        { fiscalYear: 2024, totalRevenue: 48250000, netProfit: 6120000, totalAssets: 39800000, totalLiabilities: 12400000, equity: 27400000 },
        { fiscalYear: 2023, totalRevenue: 41030000, netProfit: 4870000, totalAssets: 33150000, totalLiabilities: 10900000, equity: 22250000 },
        { fiscalYear: 2022, totalRevenue: 35670000, netProfit: 3210000, totalAssets: 27600000, totalLiabilities: 9800000, equity: 17800000 },
      ],
    },
  },

  "0105561003452": {
    profile: {
      ResultList: [
        {
          "cd:OrganizationJuristicPerson": {
            "cd:OrganizationJuristicID": "0105561003452",
            "cd:OrganizationJuristicNameTH": "บริษัท สยามสาธิต ฟู้ดส์ จำกัด",
            "cd:OrganizationJuristicNameEN": "SIAM SATHIT FOODS COMPANY LIMITED",
            "cd:OrganizationJuristicType": "บริษัทจำกัด",
            "cd:OrganizationJuristicRegisterDate": "25610820",
            "cd:OrganizationJuristicStatus": "ยังดำเนินกิจการอยู่",
            "cd:OrganizationJuristicObjective": {
              "td:JuristicObjective": {
                "td:JuristicObjectiveCode": "56101",
                "td:JuristicObjectiveTextTH": "ภัตตาคารและร้านอาหาร",
              },
            },
            "cd:OrganizationJuristicRegisterCapital": "2000000",
            "cd:OrganizationJuristicPaidUpCapital": "1000000",
            "cd:OrganizationJuristicBranchName": "สำนักงานใหญ่",
            "cd:OrganizationJuristicAddress": {
              "cr:AddressType": {
                "cd:AddressNo": "123",
                "cd:Moo": "4",
                "cd:Street": "ถนนพหลโยธิน",
                "cd:CitySubDivision": { "cr:CitySubDivisionTextTH": "สามเสนใน" },
                "cd:City": { "cr:CityTextTH": "พญาไท" },
                "cd:CountrySubDivision": { "cr:CountrySubDivisionTextTH": "กรุงเทพมหานคร" },
                "cd:PostCode": "10400",
              },
            },
          },
        },
      ],
    },
    people: {
      directors: [
        { order: 1, name: "นางสมใจ อร่อยดี", position: "กรรมการ" },
        { order: 2, name: "นายตัวอย่าง ครัวไทย", position: "กรรมการ" },
      ],
      shareholders: [
        { order: 1, name: "นางสมใจ อร่อยดี", nationality: "ไทย", shares: 12000, percent: 60 },
        { order: 2, name: "นายตัวอย่าง ครัวไทย", nationality: "ไทย", shares: 8000, percent: 40 },
      ],
      authorizedSignatory: "นางสมใจ อร่อยดี ลงลายมือชื่อและประทับตราสำคัญของบริษัท",
    },
    financials: {
      financials: [
        { fiscalYear: 2024, totalRevenue: 12840000, netProfit: -420000, totalAssets: 6950000, totalLiabilities: 5100000, equity: 1850000 },
        { fiscalYear: 2023, totalRevenue: 11920000, netProfit: 380000, totalAssets: 6400000, totalLiabilities: 4130000, equity: 2270000 },
      ],
    },
  },

  "0505560007892": {
    profile: {
      ResultList: [
        {
          "cd:OrganizationJuristicPerson": {
            "cd:OrganizationJuristicID": "0505560007892",
            "cd:OrganizationJuristicNameTH": "ห้างหุ้นส่วนจำกัด ล้านนาตัวอย่าง ก่อสร้าง",
            "cd:OrganizationJuristicNameEN": "LANNA SAMPLE CONSTRUCTION LIMITED PARTNERSHIP",
            "cd:OrganizationJuristicType": "ห้างหุ้นส่วนจำกัด",
            "cd:OrganizationJuristicRegisterDate": "25600110",
            "cd:OrganizationJuristicStatus": "ร้าง",
            "cd:OrganizationJuristicObjective": {
              "td:JuristicObjective": {
                "td:JuristicObjectiveCode": "41001",
                "td:JuristicObjectiveTextTH": "การก่อสร้างอาคารที่พักอาศัย",
              },
            },
            "cd:OrganizationJuristicRegisterCapital": "1000000",
            "cd:OrganizationJuristicBranchName": "สำนักงานใหญ่",
            "cd:OrganizationJuristicAddress": {
              "cr:AddressType": {
                "cd:AddressNo": "45/2",
                "cd:Moo": "7",
                "cd:CitySubDivision": { "cr:CitySubDivisionTextTH": "สุเทพ" },
                "cd:City": { "cr:CityTextTH": "เมืองเชียงใหม่" },
                "cd:CountrySubDivision": { "cr:CountrySubDivisionTextTH": "เชียงใหม่" },
                "cd:PostCode": "50200",
              },
            },
          },
        },
      ],
    },
    people: {
      directors: [{ order: 1, name: "นายตัวอย่าง ดอยสูง", position: "หุ้นส่วนผู้จัดการ" }],
      shareholders: [],
    },
    financials: { financials: [] },
  },
};
