import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";

export default {
  packagerConfig: { asar: true },
  makers: [
    new MakerZIP({}, ["darwin"]),
    new MakerSquirrel({}),
  ],
};
