import "reflect-metadata";
import { readFileSync } from "fs";
import * as yaml from "js-yaml";
import { f } from "@marcj/marshal";

export enum PatternType {
  Posting = "posting",
  Transaction = "transaction",
  Balance = "balance",
}

export class Pattern {
  @f.enum(PatternType) type: PatternType = PatternType.Posting;
  @f query: string = "";
  @f value: string = "";
}

export class Transform {
  @f.enum(PatternType) type: PatternType = PatternType.Posting;
  @f query: string = "";
  @f value: string = "";
}

export class Rule {
  @f.array(Pattern) pattern: Pattern[] = [];
  @f.array(Transform) transform: Transform[] = [];
}

export class DefaultAccount {
  @f income: string = "";
  @f expenses: string = "";
  @f pnl: string = "";
  @f base?: string;
  @f ethTx?: string;
}

export class Config {
  @f defaultAccount: DefaultAccount = new DefaultAccount();
  @f outputDir: string = "";
  @f.array(Rule) rules: Rule[] = [];

  static parse(file: string): Record<string, any> {
    const content = readFileSync(file, { encoding: "utf8" });
    return yaml.safeLoad(content);
  }
}
