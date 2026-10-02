import { createUsersDraft, getUsersProfile } from "@withone/sdk/gmail";
import { connections, oneClient } from "./config.js";

/**
 * The only Gmail write in this repo: a DRAFT to the candidate, never sent.
 * Advances get the intro-call invite, declines get the kind no. Holds get
 * nothing, because a human has not decided yet. You open your drafts
 * folder, read each one, and send what you agree with.
 */

const mail = () => oneClient().connection(connections.gmail());

export async function readMailbox(): Promise<string> {
  const res = await mail().run(getUsersProfile({ path: { userId: "me" } }));
  const address = (res.data as { emailAddress?: string })?.emailAddress;
  if (!address) throw new Error("Gmail answered, but not with a mailbox address.");
  return address;
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export async function createDraft(from: string, to: string, subject: string, body: string): Promise<string> {
  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
  const res = await mail().run(
    createUsersDraft({
      path: { userId: "me" },
      body: { message: { raw: Buffer.from(raw, "utf8").toString("base64url") } },
    }),
  );
  return (res.data as { id?: string })?.id ?? "unknown";
}
