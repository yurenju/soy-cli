import { Directive, DATE_FORMAT } from "./Directive";
import { f } from "@marcj/marshal";
import moment, { Moment } from "moment";
import { copyValues } from "../Common";

export class Price extends Directive {
  readonly type = "price";

  @f.moment() date: Moment = moment();
  @f holding: string = "HOOL";
  @f amount: string = "0";
  @f symbol: string = "USD";

  constructor(price?: Partial<Price>) {
    super();
    if (price) {
      copyValues(price, this);
    }
  }

  toString() {
    const { date, holding, amount, symbol } = this;
    return `${date.format(DATE_FORMAT)} price ${holding} ${amount} ${symbol}`;
  }
}
