// Registry of every dictionary module (tests only: the app imports modules directly). Adding a namespace module =
// create src/i18n/msg/<name>.ts (export th + en) and list it here.
import type { Msgs, Pack } from "../core";
import * as common from "./common";
import * as fmt from "./fmt";
import * as lib1 from "./lib-1";
import * as components from "./components";
import * as libBrain3 from "./lib-brain-3";
import * as lib3 from "./lib-3";
import * as appApiPushStatus from "./app-api-push-status";
import * as libCare from "./lib-care";
import * as lib4 from "./lib-4";
import * as appApiAiCoach from "./app-api-ai-coach";
import * as libBrain4 from "./lib-brain-4";
import * as componentsCare from "./components-care";
import * as lib5 from "./lib-5";
import * as libBrain5 from "./lib-brain-5";
import * as componentsInsights from "./components-insights";
import * as appSettingsBrain from "./app-settings-brain";
import * as lib6 from "./lib-6";
import * as libBrain6 from "./lib-brain-6";
import * as app from "./app";
import * as lib7 from "./lib-7";
import * as appSettingsSystem from "./app-settings-system";
import * as appSettingsWeek from "./app-settings-week";
import * as appApiPushTest from "./app-api-push-test";
import * as componentsBrain from "./components-brain";
import * as componentsGym from "./components-gym";
import * as lib8 from "./lib-8";
import * as appBody from "./app-body";
import * as componentsShare from "./components-share";
import * as libBrain8 from "./lib-brain-8";
import * as componentsToday from "./components-today";
import * as componentsLive from "./components-live";
import * as appSettingsAppearance from "./app-settings-appearance";
import * as lib9 from "./lib-9";
import * as appSettingsGoals from "./app-settings-goals";
import * as libBrain10 from "./lib-brain-10";
import * as appSettingsCare from "./app-settings-care";
import * as appGym from "./app-gym";
import * as lib10 from "./lib-10";
import * as appApiAuthPin from "./app-api-auth-pin";
import * as appApiPushTick from "./app-api-push-tick";
import * as lib11 from "./lib-11";
import * as componentsTerm from "./components-term";
import * as appSettingsTerm from "./app-settings-term";
import * as appSettingsPrivacy from "./app-settings-privacy";
import * as libBrain11 from "./lib-brain-11";
import * as appSettingsSchedule from "./app-settings-schedule";
import * as appSettingsNotifications from "./app-settings-notifications";
import * as appSettings from "./app-settings";
import * as componentsRituals from "./components-rituals";
import * as lib12 from "./lib-12";
import * as libServer from "./lib-server";

export const MODULES: Record<string, Pack<Msgs>> = {
  common: common,
  fmt: fmt,
  "lib-1": lib1,
  components: components,
  "lib-brain-3": libBrain3,
  "lib-3": lib3,
  "app-api-push-status": appApiPushStatus,
  "lib-care": libCare,
  "lib-4": lib4,
  "app-api-ai-coach": appApiAiCoach,
  "lib-brain-4": libBrain4,
  "components-care": componentsCare,
  "lib-5": lib5,
  "lib-brain-5": libBrain5,
  "components-insights": componentsInsights,
  "app-settings-brain": appSettingsBrain,
  "lib-6": lib6,
  "lib-brain-6": libBrain6,
  app: app,
  "lib-7": lib7,
  "app-settings-system": appSettingsSystem,
  "app-settings-week": appSettingsWeek,
  "app-api-push-test": appApiPushTest,
  "components-brain": componentsBrain,
  "components-gym": componentsGym,
  "lib-8": lib8,
  "app-body": appBody,
  "components-share": componentsShare,
  "lib-brain-8": libBrain8,
  "components-today": componentsToday,
  "components-live": componentsLive,
  "app-settings-appearance": appSettingsAppearance,
  "lib-9": lib9,
  "app-settings-goals": appSettingsGoals,
  "lib-brain-10": libBrain10,
  "app-settings-care": appSettingsCare,
  "app-gym": appGym,
  "lib-10": lib10,
  "app-api-auth-pin": appApiAuthPin,
  "app-api-push-tick": appApiPushTick,
  "lib-11": lib11,
  "components-term": componentsTerm,
  "app-settings-term": appSettingsTerm,
  "app-settings-privacy": appSettingsPrivacy,
  "lib-brain-11": libBrain11,
  "app-settings-schedule": appSettingsSchedule,
  "app-settings-notifications": appSettingsNotifications,
  "app-settings": appSettings,
  "components-rituals": componentsRituals,
  "lib-12": lib12,
  "lib-server": libServer,
};
