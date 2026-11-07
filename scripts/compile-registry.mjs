import fs from "node:fs/promises";
import solc from "solc";

const source = await fs.readFile(new URL("../contracts/OathRegistry.sol", import.meta.url), "utf8");
const input = {
  language: "Solidity",
  sources: { "OathRegistry.sol": { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } }
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter(entry => entry.severity === "error");
if (errors.length) throw new Error(errors.map(entry => entry.formattedMessage).join("\n"));
const contract = output.contracts["OathRegistry.sol"].OathRegistry;
await fs.writeFile(new URL("../public/oath-registry-artifact.json", import.meta.url), JSON.stringify({ abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` }, null, 2));
console.log("Compiled OathRegistry artifact to public/oath-registry-artifact.json");
