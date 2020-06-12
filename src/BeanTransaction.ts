import moment = require("moment");
import Posting from "./Posting";

export default class BeanTransaction {
  date: string;
  flag: string;
  payee: string;
  narration: string;
  metadata: { [key: string]: string };
  postings: Posting[];

  constructor(
    date = moment().format("YYYY-MM-DD"),
    flag = "*",
    payee = "",
    narration = "",
    postings = [],
    metadata = {}
  ) {
    this.date = date;
    this.flag = flag;
    this.payee = payee;
    this.narration = narration;
    this.postings = postings;
    this.metadata = metadata;
  }

  toString(showMetadata = false) {
    const { date, flag, payee, narration, postings, metadata } = this;
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
    if (showMetadata) {
      lines.push(...attrsLines);
    }
    lines.push(...postings.map((d) => d.toString(showMetadata)));

    return lines.join("\n");
  }
}
