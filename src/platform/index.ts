import * as dialogs from "./dialogs";
import * as filesystem from "./filesystem";
import * as shell from "./shell";
import * as system from "./system";

export * from "./types";

export const platform = {
  dialogs,
  filesystem,
  shell,
  system,
};

export default platform;
