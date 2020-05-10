import { readFileSync } from "fs";
import * as iconv from "iconv-lite";
import parse from "csv-parse/lib/sync";
import moment, { Moment } from "moment";
import ptr from "json-ptr";
import Directive from "./Directive";
import BeanTransaction from "./BeanTransaction";
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

export function directiveTransform(
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

export function patternReplace(
  dir: Directive,
  tx: BeanTransaction,
  rules: Rule[]
) {
  rules.forEach(({ pattern, transform }) => {
    const matched = pattern.every(({ type, query, value }) => {
      const actual =
        type === PatternType.Directive
          ? ptr.get(dir, query)
          : ptr.get(tx, query);

      if (actual && typeof actual === "string") {
        return actual.includes(value);
      } else {
        return false;
      }
    });

    if (matched) {
      transform.forEach(({ type, query, value }) => {
        if (type === PatternType.Directive) {
          directiveTransform(dir, query, value);
        }
        if (type === PatternType.Transaction) {
          ptr.set(tx, query, value);
        }
      });
    }
  });
}
