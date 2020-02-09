import { readFileSync } from "fs";
import * as yaml from "js-yaml";

export class Config {
  [key: string]: any;

  constructor(json: object) {
    Object.entries(json).forEach(([key, value]) => {
      this[key] = value;
    });
  }

  static parse(file: string): Config {
    const content = readFileSync(file, { encoding: "utf8" });
    const config = yaml.safeLoad(content);
    return new Config(config);
  }
}
