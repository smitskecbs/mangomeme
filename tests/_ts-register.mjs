import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./_ts-hooks.mjs", import.meta.url), pathToFileURL("./"));
