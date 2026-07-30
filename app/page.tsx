import { redirect } from "next/navigation";

/** The app has one home: the prompt library. proxy.ts bounces signed-out
 *  visitors to /login before this ever renders. */
export default function Home() {
  redirect("/prompts");
}
