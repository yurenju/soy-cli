import { Config } from "./Config";
import { f } from "@marcj/marshal";

export default class CathayBankConfig extends Config {
  @f inputFile: string = "";
  @f encoding: string = "utf8";
}
