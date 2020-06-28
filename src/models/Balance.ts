import "reflect-metadata";
import {
  Directive,
  DEFAULT_ACCOUNT,
  DEFAULT_SYMBOL,
  DATE_FORMAT,
} from "./Directive";
import { f } from "@marcj/marshal";
import moment, { Moment } from "moment";
import { copyValues } from "../Common";

export class Balance extends Directive {
  readonly type: string = "balance";

  @f.moment() date: Moment = moment();
  @f account: string = DEFAULT_ACCOUNT;
  @f amount: string = "0";
  @f symbol: string = DEFAULT_SYMBOL;

  constructor(balance?: Partial<Balance>) {
    super();
    if (balance) {
      copyValues(balance, this);
    }
  }

  toString() {
    const { date, account, amount, symbol } = this;
    return `${date.format(DATE_FORMAT)} balance ${account} ${amount} ${symbol}`;
  }
}
