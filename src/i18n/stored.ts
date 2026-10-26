// Resolvers for built-in default texts that v1.7/v1.8 copied into state (spec section 7). Resolved by VALUE: a stored
// value equal to a built-in default's canonical (th) text shows the current-language default; anything else is user
// text and shows as typed (also text that happens to equal an English default). Step.ed is never consulted (it does not
// mean "user typed"). Editors keep each row's original stored value and write keepStored(f, orig, draft), so an
// untouched built-in saved while in English stays canonical and keeps translating. Key shapes are a contract:
//   lib-care (B4): presets.slot.<slotId> | presets.step.<slotId>.<stepId>.title/.hint | presets.lib.<libId>.title/.hint
//                  | presets.task.<taskId>.title/.hint | presets.check.<checkId>.name/.note
//   lib-5 (B5):    gymlog.ex.<exerciseId>
//   components-care (B5): routineEditor.newName (default name of a routine added in the editor)
//   components-gym (B8):  exerciseEditor.newName (default name of an exercise added in the editor)
// Not re-exported from index.ts because it pulls in those dictionaries.
import { eitherStored, storedText } from "./core";
import * as Care from "./msg/lib-care";
import * as L5 from "./msg/lib-5";
import * as CareUi from "./msg/components-care";
import * as GymUi from "./msg/components-gym";

export const STORED_SPECS: { name: string; module: string; prefixes: readonly string[] }[] = [
  { name: "careRoutineName", module: "lib-care", prefixes: ["presets.slot."] },
  { name: "careStepText", module: "lib-care", prefixes: ["presets.step.", "presets.lib."] },
  { name: "careTaskText", module: "lib-care", prefixes: ["presets.task."] },
  { name: "careCheckText", module: "lib-care", prefixes: ["presets.check."] },
  { name: "gymExName", module: "lib-5", prefixes: ["gymlog.ex."] },
  { name: "newRoutineName", module: "components-care", prefixes: ["routineEditor.newName"] },
  { name: "newExName", module: "components-gym", prefixes: ["exerciseEditor.newName"] },
];
const spec = (name: string) => STORED_SPECS.find((x) => x.name === name)!.prefixes;

export const careRoutineName = storedText(Care, spec("careRoutineName")); // Routine.name of the preset routines
export const careStepText = storedText(Care, spec("careStepText")); // Step.title / Step.hint
export const careTaskText = storedText(Care, spec("careTaskText")); // CareTask.title / .hint
export const careCheckText = storedText(Care, spec("careCheckText")); // Check.name / .note
export const newRoutineName = storedText(CareUi, spec("newRoutineName")); // Routine.name of an untouched new routine
export const newExName = storedText(GymUi, spec("newExName")); // GymEx.name of an untouched new exercise
// GymEx.name: default plan names and the editor default follow the language; user text as typed.
export const gymExName = eitherStored(storedText(L5, spec("gymExName")), newExName);
// Display name of any stored routine name: preset names and the editor default follow the language; user text as typed.
export const routineName = eitherStored(careRoutineName, newRoutineName);

export const stepTitle = (s: { title: string }) => careStepText(s.title);
export const stepHint = (s: { hint?: string }) => (s.hint === undefined ? undefined : careStepText(s.hint));
