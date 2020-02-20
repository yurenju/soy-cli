import { readFileSync } from "fs";
import * as yaml from "js-yaml";

export interface DefaultAccount {
  deposit: string;
  withdraw: string;
  base?: string;
  ethTx?: string;
}

export class Config {
  defaultAccount: DefaultAccount;
  outputDir: string;

  static parse(file: string): any {
    const content = readFileSync(file, { encoding: "utf8" });
    return yaml.safeLoad(content);
  }
}
