import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

const search = createFromSource(source);

export const dynamic = "force-static";
export const revalidate = false;

// Export the prebuilt index for Fumadocs' static client. This route contains
// no query or application state; the browser downloads the immutable index and
// performs searches locally, keeping the portal serverless and static-first.
export const GET = search.staticGET;
