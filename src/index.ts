import "reflect-metadata";
import { Command } from "commander";
import { CathayBankParser } from "./CathayBankParser";
import { CryptoParser } from "./CryptoParser";

const program = new Command();

// Cathay Bank
let cathayBankOption = program.command(CathayBankParser.command);
CathayBankParser.options.forEach(opt => {
  cathayBankOption = cathayBankOption.option(opt);
});
cathayBankOption.action(options => {
  const parser = new CathayBankParser(options);
  parser.parse();
});

// Cryptos
let crpytoOptions = program.command(CryptoParser.command);
CryptoParser.options.forEach(opt => {
  crpytoOptions = crpytoOptions.option(opt);
});
crpytoOptions.action(options => {
  const parser = new CryptoParser(options);
  parser.parse();
});

program.parse(process.argv);
