// "Schedule for later" in the web builder (src/components/builder/editor/SchedulePublish.tsx): the same handlers as
// the phone's (src/app/api/mobile/store-editor/schedule/route.ts), which read the seller's session cookie as well as
// a Bearer token. GET → { scheduled } · POST { at, version } → { scheduled } · DELETE → { cancelled }.
export { GET, POST, DELETE } from "@/app/api/mobile/store-editor/schedule/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
