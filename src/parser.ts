import { readFileSync } from "fs";
import * as iconv from "iconv-lite";
import parse from "csv-parse/lib/sync";

export function parseCathayBankCsv(
  filename: string,
  encoding: string = "big5"
) {
  const orig = readFileSync(filename);
  const csv = iconv.decode(orig, encoding);

  const csvOptions = {
    relax_column_count: true,
    columns: true,
    trim: true
  };
  const records = parse(
    csv
      .split("\n")
      .slice(1)
      .join("\n"),
    csvOptions
  );

  return { records, csv };
}

function parseBillCsv(filename: string, encoding: string = "big5") {
  let bill = {
    info: {
      year: 0,
      month: 0
    },
    items: []
  };
  let csv;

  const orig = readFileSync(filename);
  csv = iconv.decode(orig, encoding);

  const headerMatched = csv
    .split("\n")
    .shift()
    .match(/(\d+)年(\d+)/);

  if (headerMatched) {
    bill.info.year = Number.parseInt(headerMatched[1], 10) + 1911;
    bill.info.month = Number.parseInt(headerMatched[2], 10) - 1;
  }

  const csvOptions = {
    relax_column_count: true,
    columns: true,
    trim: true
  };
  const records = parse(
    csv
      .split("\n")
      .slice(20)
      .join("\n"),
    csvOptions
  ).slice(3);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record["交易說明"] === "正卡本期消費") {
      break;
    }

    bill.items.push(record);
  }

  return {
    bill,
    csv
  };
}
