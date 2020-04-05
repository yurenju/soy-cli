import { Config } from "./Config";

export default class CathayCreditCardConfig extends Config {
  inputFile: string;
  encoding: string;
  defaultParsingFields: string[];
  einvoiceIntegration: boolean;
}
