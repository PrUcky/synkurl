// The waitlist form. Sends the answers to /api/join and shows what happens next.

import { setUpForm } from "/form-kit.js";
import "/share.js";

const form = document.getElementById("waitlist");
const done = document.getElementById("done");

setUpForm({
  form,
  collect: (data) => ({
    email: data.get("email"),
    phone_type: data.get("phone_type"),
    city: data.get("city"),
    family_size: data.get("family_size"),
    device_pick: data.get("device_pick") || "",
    is_adult: data.get("is_adult") === "yes",
    consent: data.get("consent") === "yes",
    lang: data.get("lang") || "en",
  }),
  onSuccess(body) {
    if (body.next === "check-email") {
      location.assign(body.recent ? "/check-email?sent=recent" : "/check-email");
      return;
    }
    if (body.next === "already") {
      document.getElementById("done-title").textContent = "You're already on the waitlist.";
      document.getElementById("done-text").textContent =
        "This email joined earlier, so there's nothing more to do. We'll email you when early access opens.";
    }
    form.hidden = true;
    done.hidden = false;
    done.classList.add("is-celebrating");
    done.focus();
  },
});
