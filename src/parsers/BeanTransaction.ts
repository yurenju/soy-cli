import moment = require("moment");
import Directive from "./Directive";

export default class BeanTransaction {
  date: string;
  flag: string;
  payee: string;
  narration: string;
  metadata: { [key: string]: string };
  directives: Directive[];

  constructor(
    date = moment().format("YYYY-MM-DD"),
    flag = "*",
    payee = "",
    narration = "",
    directives = [],
    metadata = {}
  ) {
    this.date = date;
    this.flag = flag;
    this.payee = payee;
    this.narration = narration;
    this.directives = directives;
    this.metadata = metadata;
  }

  toString() {
    const { date, flag, payee, narration, directives, metadata } = this;
    const lines = [];
    const firstArr = [date, flag];
    if (payee) {
      firstArr.push(`"${payee}"`);
    }
    if (narration) {
      firstArr.push(`"${narration}"`);
    }
    const attrsLines = Object.entries(metadata).map(
      ([key, value]) => `  ${key}: "${value}"`
    );

    lines.push(firstArr.join(" "));
    lines.push(...attrsLines);
    lines.push(...directives.map(d => d.toString()));

    return lines.join("\n");
  }
}
