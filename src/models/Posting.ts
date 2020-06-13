import "reflect-metadata";
import { f } from "@marcj/marshal";
import { DEFAULT_SYMBOL, DEFAULT_ACCOUNT } from "./Directive";
import { copyValues } from "../Common";

enum PriceType {
  Unit = "unit",
  Total = "total",
}

export class Cost {
  @f amount: string = "";
  @f symbol: string = DEFAULT_SYMBOL;
}

export class Price {
  @f type: PriceType = PriceType.Unit;
  @f amount: string = "";
  @f symbol: string = DEFAULT_SYMBOL;
}

export class Posting {
  [key: string]: any;

  @f account: string = DEFAULT_ACCOUNT;
  @f amount: string = "";
  @f symbol: string = DEFAULT_SYMBOL;
  @f.map(String) metadata: Record<string, string> = {};
  @f.optional() cost?: Cost;
  @f.optional() price?: Price;

  constructor(posting?: Partial<Posting>) {
    if (posting) {
      copyValues(posting, this);
    }
  }

  toString() {
    const { account, amount, symbol, cost, price, metadata } = this;
    const lines = [];

    let major = `  ${account}`;
    if (amount) {
      major += ` ${amount} ${symbol}`;

      if (cost) {
        major += ` {${cost.amount} ${cost.symbol}}`;
      }

      // add "@ 200 USD" or "@@ 200 USD" depends on type
      if (price) {
        const op = price.type === PriceType.Unit ? "@" : "@@";
        major += ` ${op} ${price.amount} ${price.symbol}`;
      }
    }

    lines.push(major);

    if (Object.keys(metadata).length > 0) {
      lines.push(
        ...Object.entries(metadata).map(
          ([key, value]) => `    ${key}: "${value}"`
        )
      );
    }

    return lines.join("\n");
  }
}
