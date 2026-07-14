import { runScheduled } from "../_shared/scheduled.ts";

Deno.serve((req) => runScheduled(req, "gsc"));
