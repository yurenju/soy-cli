import {
  TaiwanEInvoice,
  InquirerIdentity,
  CarrierCardType,
} from "node-tw-e-invoice";
import { URLSearchParams } from "url";
import moment from "moment";
import fetch from "node-fetch";

interface Result {
  param: Record<string, string>;
  method: string;
  path: string;
}

export interface InvDate {
  year: number;
  month: number;
  date: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  time: any;
  timezoneOffset: number;
}

export interface Invoice {
  rowNum: number;
  invNum: string;
  cardType: string;
  cardNo: string;
  sellerName: string;
  invStatus: string;
  invDonatable: boolean;
  amount: string;
  invPeriod: string;
  donateMark: number;
  invDate: InvDate;
  sellerBan: string;
  sellerAddress: string;
  invoiceTime: string;
}

export interface InvoiceListResponse {
  v: string;
  code: number;
  msg: string;
  onlyWinningInv: string;
  details: Invoice[];
}

export interface InvoiceDetail {
  rowNum: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
}

export interface InvoiceDetailResponse {
  v: string;
  code: number;
  msg: string;
  invNum: string;
  invDate: string;
  sellerName: string;
  amount: string;
  invStatus: string;
  invPeriod: string;
  details: InvoiceDetail[];
  sellerBan: string;
  sellerAddress: string;
  invoiceTime: string;
}

export class EInvoiceService {
  einvoice: TaiwanEInvoice;
  uuid: string;
  cardEncrypt: string;
  cardNo: string;

  constructor(
    appId: string,
    apiKey: string,
    uuid: string,
    cardNo: string,
    cardEncrypt: string
  ) {
    this.einvoice = new TaiwanEInvoice(appId, apiKey);
    this.uuid = uuid;
    this.cardEncrypt = cardEncrypt;
    this.cardNo = cardNo;
  }

  getTime() {
    const timeStamp = moment().add(10, "seconds").toDate();
    const expTimeStamp = moment(timeStamp).add(1, "minute").toDate();
    return { timeStamp, expTimeStamp };
  }

  async getInvoiceList(
    startDate: string,
    endDate: string
  ): Promise<InvoiceListResponse> {
    const { timeStamp, expTimeStamp } = this.getTime();
    const { cardNo, cardEncrypt } = this;
    const { param, method, path } = (await this.einvoice
      .inquirer(this.uuid, InquirerIdentity.Common)
      .action("carrierInvChk", {
        version: 0.5,
        cardType: CarrierCardType.Mobile,
        expTimeStamp,
        timeStamp,
        startDate,
        endDate,
        onlyWinningInv: "N",
        cardNo,
        cardEncrypt,
      })) as Result;
    const body = new URLSearchParams();
    Object.entries(param).forEach(([key, value]) => body.append(key, value));
    const options = { method, body };

    return fetch(path, options).then((res) => res.json());
  }

  async getInvoiceDetail(
    invNum: string,
    invDate: string,
    amount: string
  ): Promise<InvoiceDetailResponse> {
    const { timeStamp, expTimeStamp } = this.getTime();
    const { cardNo, cardEncrypt } = this;
    const { method, param, path } = (await this.einvoice
      .inquirer(this.uuid, InquirerIdentity.Common)
      .action("carrierInvDetail", {
        version: 0.5,
        cardType: CarrierCardType.Mobile,
        expTimeStamp,
        timeStamp,
        invNum,
        invDate,
        cardNo,
        amount,
        cardEncrypt,
      })) as Result;
    const body = new URLSearchParams();
    Object.entries(param).forEach(([key, value]) => body.append(key, value));
    const options = { method, body };

    return fetch(path, options).then((res) => res.json());
  }
}
