import install from "husky";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.HUSKY !== "0") {
    const application = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const repository = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: application, encoding: "utf8" }).trim();
    process.chdir(repository);
    const directory = path.relative(repository, path.join(application, ".husky")).split(path.sep).join("/");
    const result = install(directory);
    if (result) console.log(result);
}
