import { Moment } from "moment";

export interface CreditCardBill {
  closingDate: Moment; // 帳單結帳日
  paymentDueDate: Moment; //繳款截止日
  currency: string; // 幣別
  newBalance: number; // 本期應繳總額
  minimumDue: number; // 本期最低應繳總額
  previousBalance: number; // 上期帳單總額
  previousPayment: number; // 上期繳款金額
  transactions: CreditCardTransaction[];
}

export interface CreditCardTransaction {
  [key: string]: any;
  transactionDate: Moment; //消費日
  postingDate: Moment; // 入帳起息日
  description: string; // 交易說明
  amount: number; // 台幣金額
  country?: string; // 消費國家
  foreignCurrency?: string; // 外幣幣種，有時候國外刷卡也會用台幣計價，所以也可能會是 TWD
  foreignAmount?: number; // 外幣金額
  exchangeDate?: Moment; // 折算日
}
