import "reflect-metadata";
import {
  Directive,
  DEFAULT_SYMBOL,
  DEFAULT_ACCOUNT,
  DATE_FORMAT,
} from "./Directive";
import { f } from "@marcj/marshal";
import moment, { Moment } from "moment";

export class OpenAccount extends Directive {
  readonly type: string = "open";

  @f.moment() date: Moment = moment();
  @f symbol: string = DEFAULT_SYMBOL;
  @f account: string = DEFAULT_ACCOUNT;

  toString() {
    const { date, account, symbol } = this;
    return `${date.format(DATE_FORMAT)} open ${account} ${symbol}`;
  }
}
