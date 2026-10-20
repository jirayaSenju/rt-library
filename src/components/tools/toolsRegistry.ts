import { ToolDefinition } from "@/types/tools";

export const BUILTIN_TOOLS_REGISTRY: ToolDefinition[] = [
  {
    id: "nscb-desktop",
    name: "NSCB Desktop",
    category: "converter",
    url: "https://github.com/cxfcxf/nscb-desktop",
    sourceType: "github",
    icon: "ArrowLeftRight",
    descriptionKey: "tools.items.nscbDesktop.description",
  },
  {
    id: "nx-firmware",
    name: "NX Firmware",
    category: "firmware",
    url: "https://github.com/THZoria/NX_Firmware/releases",
    sourceType: "releases",
    icon: "Cpu",
    descriptionKey: "tools.items.nxFirmware.description",
  },
  {
    id: "keys",
    name: "Keys",
    category: "resources",
    url: "https://edenprodkeys.com/",
    sourceType: "resource",
    icon: "KeyRound",
    descriptionKey: "tools.items.keys.description",
  },
];

