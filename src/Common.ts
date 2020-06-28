import moment, { Moment } from "moment";
import ptr from "jsonpointer";
import { Posting } from "./models/Posting";
import { Transaction } from "./models/Transaction";
import { Rule, PatternType } from "./config/Config";

export enum TxType {
  Deposit = "deposit",
  Withdraw = "withdraw",
}

export function parseROCDate(dateStr: string): Moment {
  const [rocYear, month, day] = dateStr.split("/");
  const year = Number.parseInt(rocYear) + 1911;
  return moment(`${year}/${month}/${day}`, "YYYY/MM/DD");
}

export function postingTransform(
  data: Record<string, any>,
  query: string,
  value: any
) {
  if (query === "/symbol") {
    const regex = new RegExp(`${data.symbol}$`);
    data.account = data.account.replace(regex, value);
  }
  ptr.set(data, query, value);
}

export function copyValues(from: any, to: any) {
  Object.entries(from).forEach(([key, value]) => {
    to[key] = value;
  });
}

export function patternReplace(
  posting: Posting,
  tx: Transaction,
  rules: Rule[]
) {
  rules.forEach(({ pattern, transform }) => {
    const matched = pattern.every(({ type, query, value }) => {
      const re = new RegExp(value);
      const actual =
        type === PatternType.Posting
          ? ptr.get(posting, query)
          : ptr.get(tx, query);

      if (actual && typeof actual === "string") {
        return re.test(actual);
      } else {
        return false;
      }
    });

    if (matched) {
      transform.forEach(({ type, query, value }) => {
        if (type === PatternType.Posting) {
          postingTransform(posting, query, value);
        }
        if (type === PatternType.Transaction) {
          ptr.set(tx, query, value);
        }
      });
    }
  });
}
