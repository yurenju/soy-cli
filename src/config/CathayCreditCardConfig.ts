import { Config } from "./Config";
import { f } from "@marcj/marshal";

export default class CathayCreditCardConfig extends Config {
  @f inputFile: string = "";
  @f encoding: string = "utf8";
  @f.array(String) defaultParsingFields: string[] = [];
  @f einvoiceIntegration: boolean = false;
}
