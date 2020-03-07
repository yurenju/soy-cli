import { Config } from "./config/Config";

interface Rule {
  pattern: string;
  fields: string[];
  type: string;
  account: string;
}

export default class CathayBankConfig extends Config {
  inputFile: string;
  encoding: string;
  defaultParsingFields: string[];
  rules: Rule[];
}
