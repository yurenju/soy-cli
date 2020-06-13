import { Config } from "./Config";

export default class CathayCreditCardConfig extends Config {
  inputFile: string = "";
  encoding: string = "utf8";
  defaultParsingFields: string[] = [];
  einvoiceIntegration: boolean = false;
}
