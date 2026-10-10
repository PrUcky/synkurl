// The "Did you mean …?" hint on the forms.
import { describe, expect, it } from "vitest";
import { suggestEmail } from "../public/email-hint.js";

describe("email typo hint", () => {
  it.each([
    ["asha@gmial.com", "asha@gmail.com"],
    ["asha@gmail.con", "asha@gmail.com"],
    ["asha@gmail.co", "asha@gmail.com"],
    ["asha@gamil.com", "asha@gmail.com"],
    ["ravi@yaho.com", "ravi@yahoo.com"],
    ["ravi@hotmial.com", "ravi@hotmail.com"],
    ["ravi@rediffmail.co", "ravi@rediffmail.com"],
    ["Ravi@Outlok.com", "ravi@outlook.com"],
  ])("suggests a fix for %s", (typed, expected) => {
    expect(suggestEmail(typed)).toBe(expected);
  });

  it.each(["asha@gmail.com", "asha@yahoo.co.in", "asha@mail.com", "asha@company.in", "asha@ymail.com", "not-an-email", ""])(
    "stays quiet for %s",
    (typed) => {
      expect(suggestEmail(typed)).toBeNull();
    }
  );
});
