import { readFileSync } from "fs";
import * as iconv from "iconv-lite";
import parse from "csv-parse/lib/sync";
import moment, { Moment } from "moment";
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
  field: string,
  value: any
) {
  if (field === "symbol") {
    const regex = new RegExp(`${data.symbol}$`);
    data.account = data.account.replace(regex, value);
  }
  data[field] = value;
}

export function patternReplace(
  dir: Directive,
  tx: BeanTransaction,
  rules: Rule[]
) {
  rules.forEach(({ pattern, transform }) => {
    const matched = pattern.every(({ type, field, value }) => {
      if (type === PatternType.Directive) {
        return dir[field] === value || dir.metadata[field] === value;
      } else if (type === PatternType.Transaction) {
        return tx[field] === value || tx.metadata[field] === value;
      }
    });

    if (matched) {
      transform.forEach(({ type, field, value }) => {
        if (type === PatternType.Directive) {
          directiveTransform(dir, field, value);
        }
        if (type === PatternType.Transaction) {
          tx[field] = value;
        }
      });
    }
  });
}
