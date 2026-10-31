import fs from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!args[i].startsWith("--")||!args[i+1])throw Error("Each option requires a value");options[args[i].slice(2)]=args[i+1];}
const build=Number(options.build);
if(!Number.isSafeInteger(build)||build<1||!options.version||!options.tag||!options.output)throw Error("Required: --build 10 --version Preview10 --tag konz-preview10 --output update-manifest.json --portable path.zip [--installer path.exe]");
const packages=[];
for(const kind of ["portable","installer"]){if(!options[kind])continue;const file=options[kind],data=await fs.readFile(file);packages.push({kind,name:path.basename(file),bytes:data.length,sha256:createHash("sha256").update(data).digest("hex")});}
if(!packages.length)throw Error("Provide at least one update package");
const manifest={build,version:options.version,tag:options.tag,notes:options.notes||"",packages};
await fs.writeFile(options.output,JSON.stringify(manifest,null,2)+"\n");
console.log("Manifest created: "+options.output);
