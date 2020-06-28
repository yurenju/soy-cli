import "reflect-metadata";
import { Directive, DATE_FORMAT } from "./Directive";
import { f } from "@marcj/marshal";
import moment, { Moment } from "moment";
import { Posting } from "./Posting";
import { copyValues } from "../Common";

enum TxFlag {
  Completed = "*",
  Incomplete = "!",
}

export class Transaction extends Directive {
  readonly type = "transaction";

  @f.moment()
  date: Moment = moment();

  @f.enum(TxFlag)
  flag: TxFlag = TxFlag.Completed;

  @f payee: string = "";
  @f narration: string = "";
  @f.map(String) metadata: Record<string, string> = {};
  @f.array(Posting) postings: Posting[] = [];

  constructor(tx?: Partial<Transaction>) {
    super();
    if (tx) {
      copyValues(tx, this);
    }
  }

  toString() {
    const { date, flag, payee, narration, postings, metadata } = this;
    const lines = [];

    let major = `${date.format(DATE_FORMAT)} ${flag}`;
    if (payee) {
      major += ` "${payee}"`;
    }
    if (narration) {
      major += ` "${narration}"`;
    }
    lines.push(major);

    if (Object.keys(metadata).length > 0) {
      lines.push(
        ...Object.entries(metadata).map(
          ([key, value]) => `  ${key}: "${value}"`
        )
      );
    }

    if (postings.length > 0) {
      lines.push(...postings.map((posting) => posting.toString()));
    }

    return lines.join("\n");
  }
}
