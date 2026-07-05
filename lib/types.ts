import { Timestamp } from 'firebase/firestore';

export type ContractStatus = 'active' | 'inactive' | 'unknown';
export type InvoiceStatus = 'paid' | 'pending' | 'late' | 'unknown';

export interface AdjustmentEntry {
  date: Timestamp | null;
  value: number;
}

export interface Contract {
  id: string;
  tenantId: string;
  tenantName: string;
  propertyId: string;
  propertyName: string;
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  dueDay: number | null;
  rentValue: number;
  currentRentValue: number;
  nextAdjustmentDate: Timestamp | null;
  adjustmentType: string;
  adjustmentHistory: AdjustmentEntry[];
  collectsIncomeTax: boolean;
  collectsIptu: boolean;
  status: ContractStatus;
  legacyId?: number;
}

export interface Invoice {
  id: string;
  contractId: string;
  tenantName: string;
  propertyName: string;
  referenceMonth: Timestamp | null;
  dueDay: number | null;
  dueDate: Timestamp | null;
  rentAmount: number;
  currentRentAmount: number;
  iptuAmount: number;
  extraFeeAmount: number;
  insuranceAmount: number;
  refundAmount: number;
  condoFeeAmount: number;
  condoAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  notes: string;
  pdfUrl: string | null;
  whatsappSentAt: Timestamp | null;
  paidDate: Timestamp | null;
  legacyId?: number;
  iptuScheduleLabel?: string | null, 
  refundScheduleLabel?: string | null, 
  extraFeeScheduleLabel?: string | null
}

export interface Tenant {
  id: string;
  name: string;
  phone: string;
  cpf: string;
  email: string;
  status: string;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  code: string;
  iptuCode: string;
  energyCode: string;
  managementCompany: string;
  monthlyIptu: number;
  monthlyInsurance: number;
  refundFee: number;
  condoFee: number;
  iptuChargeMonths?: number | null, 
  iptuChargeStartMonth?: string | null, 
  refundFeeChargeMonths?: number | null, 
  refundFeeChargeStartMonth?: string | null, 
  extraCondoFee?: number, 
  extraCondoFeeChargeMonths?: number | null, 
  extraCondoFeeChargeStartMonth?: string | null
}

export interface Payment {
  id: string;
  contractId: string;
  invoiceId: string;
  paymentDate: Timestamp | null;
  amountPaid: number;
  status: string;
}

export type HistoryEntryType = 'general' | 'renewal' | 'adjustment' | 'incident';

export interface HistoryEntry {
  id: string;
  contractId: string;
  tenantName: string;
  propertyName: string;
  date: Timestamp | null;
  note: string;
  type: HistoryEntryType;
  legacyId?: number;
}
